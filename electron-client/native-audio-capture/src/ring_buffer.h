#pragma once
/*
 * ring_buffer.h — Lock-free single-producer / single-consumer ring buffer.
 *
 * Threading contract (MUST be upheld by callers):
 *   - Exactly ONE thread calls push().
 *   - Exactly ONE thread calls pop() / available_read().
 *
 * Real-time safety:
 *   - No heap allocations.
 *   - No locks (only atomic loads/stores with acquire-release ordering).
 *   - Safe to use from OS audio callbacks.
 *
 * Capacity must be a power of two.
 */

#include <atomic>
#include <algorithm>
#include <cstring>
#include <cstddef>

template<typename T, std::size_t Capacity>
class SPSCRingBuffer {
    static_assert((Capacity & (Capacity - 1)) == 0,
                  "SPSCRingBuffer: Capacity must be a power of two");

public:
    SPSCRingBuffer() noexcept : head_(0), tail_(0) {}

    /* ── Producer side ──────────────────────────────────────────────────────── */

    /**
     * Copy up to 'count' elements from 'data'.
     * Returns how many were actually written (may be less than count if full).
     * Called from the capture / producer thread.
     */
    std::size_t push(const T* data, std::size_t count) noexcept {
        const std::size_t head  = head_.load(std::memory_order_relaxed);
        const std::size_t tail  = tail_.load(std::memory_order_acquire);
        const std::size_t avail = Capacity - (head - tail);
        const std::size_t n     = std::min(count, avail);
        if (n == 0) return 0;

        /* Ring may wrap around — split into at most two memcpy calls. */
        const std::size_t mask       = Capacity - 1;
        const std::size_t offset     = head & mask;
        const std::size_t first_part = std::min(n, Capacity - offset);

        std::memcpy(buf_ + offset,       data,              first_part * sizeof(T));
        if (n > first_part)
            std::memcpy(buf_,            data + first_part, (n - first_part) * sizeof(T));

        head_.store(head + n, std::memory_order_release);
        return n;
    }

    /* ── Consumer side ──────────────────────────────────────────────────────── */

    /**
     * Read up to 'count' elements into 'data'.
     * Returns how many were actually read.
     * Called from the consumer / processing thread.
     */
    std::size_t pop(T* data, std::size_t count) noexcept {
        const std::size_t tail  = tail_.load(std::memory_order_relaxed);
        const std::size_t head  = head_.load(std::memory_order_acquire);
        const std::size_t avail = head - tail;
        const std::size_t n     = std::min(count, avail);
        if (n == 0) return 0;

        const std::size_t mask       = Capacity - 1;
        const std::size_t offset     = tail & mask;
        const std::size_t first_part = std::min(n, Capacity - offset);

        std::memcpy(data,              buf_ + offset, first_part * sizeof(T));
        if (n > first_part)
            std::memcpy(data + first_part, buf_,      (n - first_part) * sizeof(T));

        tail_.store(tail + n, std::memory_order_release);
        return n;
    }

    /** Number of elements ready to read. */
    std::size_t available_read() const noexcept {
        return head_.load(std::memory_order_acquire)
             - tail_.load(std::memory_order_acquire);
    }

    /** Free space remaining for writing. */
    std::size_t available_write() const noexcept {
        return Capacity - available_read();
    }

    /** Reset to empty state.  Only safe when no concurrent push/pop is active. */
    void reset() noexcept {
        head_.store(0, std::memory_order_relaxed);
        tail_.store(0, std::memory_order_relaxed);
    }

private:
    /*
     * Separate cache lines to eliminate false sharing between the
     * producer (modifies head_) and consumer (modifies tail_).
     */
    alignas(64) std::atomic<std::size_t> head_;
    alignas(64) std::atomic<std::size_t> tail_;

    T buf_[Capacity];
};
