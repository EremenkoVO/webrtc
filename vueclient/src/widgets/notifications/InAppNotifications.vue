<script setup lang="ts">
import { useInAppNotificationStore } from '@/shared/stores/inAppNotificationStore'

const notifications = useInAppNotificationStore()

function iconForKind(kind: 'info' | 'channel' | 'dm' | 'error') {
  if (kind === 'channel') return 'hashtag'
  if (kind === 'dm') return 'comment'
  if (kind === 'error') return 'circle-info'
  return 'bell'
}

function accentClassForKind(kind: 'info' | 'channel' | 'dm' | 'error') {
  if (kind === 'channel') return 'text-dc-blurple'
  if (kind === 'dm') return 'text-dc-green'
  if (kind === 'error') return 'text-dc-red'
  return 'text-dc-blurple'
}

function progressClassForKind(kind: 'info' | 'channel' | 'dm' | 'error') {
  if (kind === 'channel') return 'bg-dc-blurple'
  if (kind === 'dm') return 'bg-dc-green'
  if (kind === 'error') return 'bg-dc-red'
  return 'bg-dc-blurple'
}

function handleClick(id: string, onClick?: () => void) {
  onClick?.()
  notifications.remove(id)
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[500] w-[min(92vw,360px)] space-y-2 pointer-events-none">
      <TransitionGroup name="toast" tag="div">
        <div
          v-for="item in notifications.items"
          :key="item.id"
          class="pointer-events-auto rounded-lg border border-dc-separator/70 shadow-xl p-3 cursor-pointer overflow-hidden toast-glass"
          @click="handleClick(item.id, item.onClick)"
        >
          <div class="flex items-start gap-2">
            <font-awesome-icon :icon="iconForKind(item.kind)" :class="[accentClassForKind(item.kind), 'mt-0.5']" />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-dc-text-heading truncate">
                {{ item.title }}
              </div>
              <div v-if="item.body" class="text-xs text-dc-text-muted leading-5 break-words">
                {{ item.body }}
              </div>
            </div>
            <button
              class="w-5 h-5 flex items-center justify-center text-dc-text-muted hover:text-dc-text"
              @click.stop="notifications.remove(item.id)"
            >
              <font-awesome-icon icon="xmark" class="text-xs" />
            </button>
          </div>
          <div class="mt-2 h-1 rounded bg-dc-bg-tertiary/80 overflow-hidden">
            <div
              :class="[progressClassForKind(item.kind), 'h-full toast-progress']"
              :style="{ '--ttl-ms': `${item.ttlMs}ms` }"
            />
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.toast-progress {
  transform-origin: left center;
  animation: toast-progress var(--ttl-ms) linear forwards;
}

@keyframes toast-progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.toast-glass {
  /* Fallback for browsers without color-mix support */
  background-color: rgba(24, 26, 31, 0.62);
  background-color: color-mix(in srgb, var(--color-dc-bg-floating) 62%, transparent);
  backdrop-filter: blur(14px) saturate(145%);
  -webkit-backdrop-filter: blur(14px) saturate(145%);
}
</style>
