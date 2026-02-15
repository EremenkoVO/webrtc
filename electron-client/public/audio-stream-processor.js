/**
 * AudioWorkletProcessor that receives PCM Float32 samples via its MessagePort
 * and outputs them through the Web Audio graph.
 *
 * This processor acts as the bridge between native audio capture (sent from
 * Electron's main process via IPC → renderer → MessagePort) and WebRTC.
 *
 * Pipeline:
 *   Native addon (WASAPI / CoreAudio / PulseAudio)
 *     → Electron IPC (ArrayBuffer / SharedArrayBuffer)
 *       → AudioWorkletProcessor.port.onmessage
 *         → Ring buffer → process() output
 *           → MediaStreamDestination → RTCPeerConnection
 *
 * Message format:
 *   port.postMessage({ samples: Float32Array })   – push PCM frames
 *   port.postMessage({ cmd: 'flush' })             – clear ring buffer
 *   port.postMessage({ cmd: 'stop' })              – stop processor
 *
 * @module audio-stream-processor
 */

// Ring buffer size: ~1 second at 48 kHz gives enough headroom for IPC jitter
const RING_BUFFER_SIZE = 48000

class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    /** @type {Float32Array} */
    this._ringBuffer = new Float32Array(RING_BUFFER_SIZE)
    /** Write position in the ring buffer */
    this._writePos = 0
    /** Read position in the ring buffer */
    this._readPos = 0
    /** Total samples available for reading */
    this._available = 0
    /** Whether the processor should keep running */
    this._alive = true

    this.port.onmessage = (event) => {
      const data = event.data
      if (!data) return

      if (data.cmd === 'stop') {
        this._alive = false
        return
      }

      if (data.cmd === 'flush') {
        this._writePos = 0
        this._readPos = 0
        this._available = 0
        return
      }

      if (data.samples) {
        this._pushSamples(data.samples)
      }
    }
  }

  /**
   * Push incoming PCM samples into the ring buffer.
   * @param {Float32Array} samples
   */
  _pushSamples(samples) {
    const len = samples.length
    for (let i = 0; i < len; i++) {
      this._ringBuffer[this._writePos] = samples[i]
      this._writePos = (this._writePos + 1) % RING_BUFFER_SIZE
    }
    this._available = Math.min(this._available + len, RING_BUFFER_SIZE)
  }

  /**
   * Pull samples from the ring buffer into the output.
   * If the buffer is empty, output silence (zeros).
   * @param {Float32Array} output – destination channel buffer (128 frames)
   */
  _pullSamples(output) {
    const len = output.length
    if (this._available >= len) {
      for (let i = 0; i < len; i++) {
        output[i] = this._ringBuffer[this._readPos]
        this._readPos = (this._readPos + 1) % RING_BUFFER_SIZE
      }
      this._available -= len
    } else {
      // Underrun – output silence
      output.fill(0)
    }
  }

  /**
   * Called by the audio rendering thread (~every 2.67 ms at 48 kHz, 128 frames).
   */
  process(_inputs, outputs) {
    if (!this._alive) return false

    const output = outputs[0]
    if (output && output[0]) {
      this._pullSamples(output[0])
    }
    return true
  }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor)
