export interface SceneVideoProgress {
  frame: number
  completedFrames: number
  totalFrames: number
}

export interface SceneVideoAudioTrack {
  dataUrl: string
  startFrame: number
  volume: number
  muted: boolean
}

export interface RecordSceneVideoOptions {
  width: number
  height: number
  fps: number
  startFrame: number
  endFrame: number
  renderFrame: (frame: number, canvas: HTMLCanvasElement) => void | Promise<void>
  videoBitsPerSecond?: number
  signal?: AbortSignal
  onProgress?: (progress: SceneVideoProgress) => void
  audio?: SceneVideoAudioTrack[] | null
}

export interface RecordedSceneVideo {
  contents: Uint8Array
  mimeType: string
  frameCount: number
  durationMs: number
}

const MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm'
] as const

function integerInRange(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`)
  const rounded = Math.round(value)
  if (rounded < minimum || rounded > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`)
  }
  return rounded
}

function abortError(): DOMException {
  return new DOMException('Video export was cancelled.', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function waitUntil(deadline: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  const delay = Math.max(0, deadline - performance.now())
  if (delay === 0) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delay)

    const handleAbort = (): void => {
      window.clearTimeout(timeout)
      reject(abortError())
    }

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function selectWebmMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video recording is not available in this build.')
  }

  const mimeType = MIME_TYPE_CANDIDATES.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  )
  if (!mimeType) throw new Error('This system does not provide a WebM video encoder.')
  return mimeType
}

function recordingError(event: Event): Error {
  const recorderEvent = event as Event & { error?: DOMException }
  return recorderEvent.error
    ? new Error(`The video encoder stopped: ${recorderEvent.error.message}`, {
        cause: recorderEvent.error
      })
    : new Error('The video encoder stopped unexpectedly.')
}

function defaultBitRate(width: number, height: number, fps: number): number {
  const estimated = Math.round(width * height * fps * 0.14)
  return Math.min(30_000_000, Math.max(1_000_000, estimated))
}

export async function recordSceneVideo(
  options: RecordSceneVideoOptions
): Promise<RecordedSceneVideo> {
  const width = integerInRange(options.width, 'Video width', 1, 16_384)
  const height = integerInRange(options.height, 'Video height', 1, 16_384)
  if (width * height > 100_000_000) {
    throw new Error('The requested video frame contains too many pixels to render safely.')
  }

  const fps = integerInRange(options.fps, 'Frame rate', 1, 120)
  const startFrame = integerInRange(options.startFrame, 'Start frame', 0, 100_000)
  const endFrame = integerInRange(options.endFrame, 'End frame', startFrame, 100_000)
  const frameCount = endFrame - startFrame + 1
  if (frameCount > 10_000) throw new Error('A video export cannot exceed 10,000 frames.')

  throwIfAborted(options.signal)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  await options.renderFrame(startFrame, canvas)
  if (canvas.width !== width || canvas.height !== height) {
    throw new Error('The frame renderer changed the requested video dimensions.')
  }
  throwIfAborted(options.signal)

  const mimeType = selectWebmMimeType()
  const stream = canvas.captureStream(0)
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  if (!videoTrack) {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error('The video canvas did not provide a capture track.')
  }

  let audioContext: AudioContext | null = null
  const audioSources: Array<{
    source: AudioBufferSourceNode
    delaySeconds: number
    offsetSeconds: number
  }> = []
  const audibleTracks = (options.audio ?? []).filter(
    (track) => !track.muted && track.volume > 0 && track.dataUrl
  )
  if (audibleTracks.length > 0) {
    audioContext = new AudioContext()
    const destination = audioContext.createMediaStreamDestination()
    const recordStartSeconds = startFrame / fps

    for (const track of audibleTracks) {
      try {
        const buffer = await fetch(track.dataUrl).then((response) => response.arrayBuffer())
        const decoded = await audioContext.decodeAudioData(buffer.slice(0))
        const clipStartSeconds = track.startFrame / fps
        const offsetSeconds = Math.max(0, recordStartSeconds - clipStartSeconds)
        if (offsetSeconds >= decoded.duration) continue

        const source = audioContext.createBufferSource()
        const gain = audioContext.createGain()
        source.buffer = decoded
        gain.gain.value = Math.max(0, Math.min(1, track.volume))
        source.connect(gain)
        gain.connect(destination)
        audioSources.push({
          source,
          offsetSeconds,
          delaySeconds: Math.max(0, clipStartSeconds - recordStartSeconds)
        })
      } catch {
        // Keep exporting with the remaining valid tracks.
      }
    }

    if (audioSources.length > 0) {
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track))
    } else {
      await audioContext.close()
      audioContext = null
    }
  }

  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: options.videoBitsPerSecond ?? defaultBitRate(width, height, fps)
  })
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => {
      const chunk = (event as BlobEvent).data
      if (chunk.size > 0) chunks.push(chunk)
    })
    recorder.addEventListener('stop', () => resolve(), { once: true })
    recorder.addEventListener('error', (event) => reject(recordingError(event)), { once: true })
  })

  const frameDuration = 1000 / fps
  let completedNormally = false

  try {
    recorder.start(1000)
    if (audioContext) {
      const audioStartTime = audioContext.currentTime + 0.03
      audioSources.forEach(({ source, delaySeconds, offsetSeconds }) =>
        source.start(audioStartTime + delaySeconds, offsetSeconds)
      )
    }
    const startedAt = performance.now()

    for (let index = 0; index < frameCount; index += 1) {
      const frame = startFrame + index
      if (index > 0) {
        throwIfAborted(options.signal)
        await options.renderFrame(frame, canvas)
        if (canvas.width !== width || canvas.height !== height) {
          throw new Error('The frame renderer changed the requested video dimensions.')
        }
      }

      throwIfAborted(options.signal)
      videoTrack.requestFrame()
      options.onProgress?.({ frame, completedFrames: index + 1, totalFrames: frameCount })
      await waitUntil(startedAt + (index + 1) * frameDuration, options.signal)
    }

    recorder.stop()
    await stopped
    completedNormally = true
  } finally {
    if (!completedNormally && recorder.state !== 'inactive') {
      recorder.stop()
      try {
        await stopped
      } catch {
        // Preserve the original render, cancellation, or encoding error.
      }
    }
    stream.getTracks().forEach((track) => track.stop())
    audioSources.forEach(({ source }) => {
      try {
        source.stop()
      } catch {
        // The source may have already ended naturally.
      }
    })
    if (audioContext) await audioContext.close()
  }

  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
  if (blob.size === 0) throw new Error('The video encoder produced no WebM data.')

  return {
    contents: new Uint8Array(await blob.arrayBuffer()),
    mimeType: recorder.mimeType || mimeType,
    frameCount,
    durationMs: frameCount * frameDuration
  }
}
