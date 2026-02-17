/**
 * Утилиты для работы с захватом аудио из приложений
 */

const SAMPLE_RATE = 48000
const CHANNELS = 2

/**
 * Создает MediaStreamTrack из PCM аудио данных
 * @param audioData PCM данные в формате Float32Array (interleaved stereo)
 * @returns MediaStreamTrack для использования в WebRTC
 */
export function createAudioTrackFromPCM(audioData: Float32Array): MediaStreamTrack {
  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
  const frameCount = audioData.length / CHANNELS
  
  // Создаем AudioBuffer из PCM данных
  const audioBuffer = audioContext.createBuffer(CHANNELS, frameCount, SAMPLE_RATE)
  
  // Разделяем interleaved данные на каналы
  for (let i = 0; i < frameCount; i++) {
    audioBuffer.getChannelData(0)[i] = audioData[i * CHANNELS] // Left
    audioBuffer.getChannelData(1)[i] = audioData[i * CHANNELS + 1] // Right
  }
  
  // Создаем источник из буфера
  const source = audioContext.createBufferSource()
  source.buffer = audioBuffer
  
  // Создаем destination для получения MediaStream
  const destination = audioContext.createMediaStreamDestination()
  source.connect(destination)
  
  // Запускаем воспроизведение
  source.start()
  
  return destination.stream.getAudioTracks()[0]
}

/**
 * Создает непрерывный MediaStreamTrack из потока PCM данных
 * Использует AudioWorkletNode или ScriptProcessorNode для обработки данных в реальном времени
 */
export class PCMAudioStream {
  private audioContext: AudioContext
  private scriptProcessor: ScriptProcessorNode | null = null
  private destination: MediaStreamAudioDestinationNode
  private track: MediaStreamTrack
  private audioQueue: Float32Array[] = []
  private currentBuffer: Float32Array | null = null
  private currentBufferOffset = 0
  private totalQueuedSamples = 0
  private maxQueueSize = 48000 * 2 // ~1 секунда буфера (48k samples * 2 channels)
  
  constructor() {
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.destination = this.audioContext.createMediaStreamDestination()
    this.track = this.destination.stream.getAudioTracks()[0]
    this.track.contentHint = 'music' // Указываем, что это музыка/аудио приложения
    
    // Создаем ScriptProcessorNode для обработки данных
    // Используем меньший bufferSize (2048) для меньшей задержки и более плавной обработки
    this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 0, CHANNELS)
    this.scriptProcessor.connect(this.destination)
    
    this.scriptProcessor.onaudioprocess = (event) => {
      this.processAudio(event)
    }
  }
  
  /**
   * Добавляет PCM данные в очередь для обработки
   */
  addAudioData(audioData: Float32Array) {
    if (audioData.length === 0) return
    
    // Проверяем, не переполняется ли очередь
    const samplesToAdd = audioData.length / CHANNELS
    if (this.totalQueuedSamples + samplesToAdd > this.maxQueueSize) {
      // Удаляем старые данные, если очередь переполнена
      while (this.totalQueuedSamples + samplesToAdd > this.maxQueueSize && this.audioQueue.length > 0) {
        const removed = this.audioQueue.shift()!
        this.totalQueuedSamples -= removed.length / CHANNELS
      }
    }
    
    // Клонируем данные, чтобы избежать проблем с shared memory
    const cloned = new Float32Array(audioData)
    this.audioQueue.push(cloned)
    this.totalQueuedSamples += samplesToAdd
  }
  
  private processAudio(event: AudioProcessingEvent) {
    const outputBuffer = event.outputBuffer
    const frameCount = outputBuffer.length
    const leftChannel = outputBuffer.getChannelData(0)
    const rightChannel = outputBuffer.getChannelData(1)
    
    let outputIndex = 0
    
    while (outputIndex < frameCount) {
      // Если текущий буфер закончился, берем следующий из очереди
      if (!this.currentBuffer || this.currentBufferOffset >= this.currentBuffer.length / CHANNELS) {
        if (this.audioQueue.length > 0) {
          this.currentBuffer = this.audioQueue.shift()!
          this.currentBufferOffset = 0
          this.totalQueuedSamples -= this.currentBuffer.length / CHANNELS
        } else {
          // Нет данных - заполняем нулями (тишина)
          // Это нормально, если данные приходят нерегулярно
          for (let i = outputIndex; i < frameCount; i++) {
            leftChannel[i] = 0
            rightChannel[i] = 0
          }
          break
        }
      }
      
      // Копируем данные из текущего буфера
      const remainingFrames = frameCount - outputIndex
      const availableFrames = (this.currentBuffer.length / CHANNELS) - this.currentBufferOffset
      const framesToCopy = Math.min(remainingFrames, availableFrames)
      
      // Оптимизированное копирование с использованием slice
      const srcStart = this.currentBufferOffset * CHANNELS
      const srcEnd = srcStart + framesToCopy * CHANNELS
      
      for (let i = 0; i < framesToCopy; i++) {
        const srcIdx = srcStart + i * CHANNELS
        leftChannel[outputIndex + i] = this.currentBuffer[srcIdx]
        rightChannel[outputIndex + i] = this.currentBuffer[srcIdx + 1]
      }
      
      this.currentBufferOffset += framesToCopy
      outputIndex += framesToCopy
    }
  }
  
  /**
   * Получить MediaStreamTrack
   */
  getTrack(): MediaStreamTrack {
    return this.track
  }
  
  /**
   * Остановить обработку и закрыть ресурсы
   */
  stop() {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }
    this.audioQueue = []
    this.currentBuffer = null
    this.currentBufferOffset = 0
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close()
    }
    this.track.stop()
  }
}
