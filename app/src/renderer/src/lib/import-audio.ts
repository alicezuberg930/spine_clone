import type { AudioClip } from '@/@types/audio'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav'])

const mimeTypeByExtension: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
}

export const AUDIO_FILE_ACCEPT = '.mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav,audio/x-wav'

export interface ImportAudioOptions {
  startFrame?: number
  waveformBuckets?: number
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

function clipName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return (dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName).trim() || 'Audio clip'
}

function createAudioId(file: File): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid
    ? `audio-${uuid}`
    : `audio-${file.lastModified}-${file.size}-${Date.now().toString(36)}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`))
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error(`Could not encode ${file.name}.`))
    }
    reader.readAsDataURL(file)
  })
}

function audioContextConstructor(): typeof AudioContext {
  const browserWindow = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  const Constructor = browserWindow.AudioContext ?? browserWindow.webkitAudioContext
  if (!Constructor) throw new Error('Audio decoding is not supported in this environment.')
  return Constructor
}

export function validateAudioFile(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty and cannot be imported.`

  const extension = fileExtension(file.name)
  if (!AUDIO_EXTENSIONS.has(extension)) {
    return `${file.name} is not supported. Choose an MP3, OGG, or WAV file.`
  }

  return null
}

export function buildAudioWaveform(buffer: AudioBuffer, bucketCount = 512): number[] {
  const length = buffer.length
  if (length === 0 || buffer.numberOfChannels === 0) return []

  const requestedBuckets = Number.isFinite(bucketCount) ? Math.round(bucketCount) : 512
  const buckets = Math.min(length, Math.max(16, Math.min(2048, requestedBuckets)))
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
    buffer.getChannelData(channel)
  )
  const peaks = Array<number>(buckets).fill(0)

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor((bucket * length) / buckets)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * length) / buckets))
    let peak = 0

    for (const channel of channels) {
      for (let sample = start; sample < end; sample += 1) {
        peak = Math.max(peak, Math.abs(channel[sample] ?? 0))
      }
    }

    peaks[bucket] = peak
  }

  const maximum = Math.max(...peaks)
  if (maximum <= Number.EPSILON) return peaks
  return peaks.map((peak) => Number((peak / maximum).toFixed(4)))
}

export async function importAudioFile(
  file: File,
  options: ImportAudioOptions = {}
): Promise<AudioClip> {
  const validationError = validateAudioFile(file)
  if (validationError) throw new Error(validationError)

  const encodedAudio = await file.arrayBuffer()
  const AudioContextConstructor = audioContextConstructor()
  const context = new AudioContextConstructor()

  try {
    const [buffer, dataUrl] = await Promise.all([
      context.decodeAudioData(encodedAudio.slice(0)),
      fileToDataUrl(file)
    ])

    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
      throw new Error(`${file.name} does not contain decodable audio.`)
    }

    const extension = fileExtension(file.name)
    return {
      id: createAudioId(file),
      name: clipName(file.name),
      sourceFileName: file.name,
      mimeType: file.type || mimeTypeByExtension[extension] || 'application/octet-stream',
      sizeBytes: file.size,
      dataUrl,
      durationSeconds: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      waveform: buildAudioWaveform(buffer, options.waveformBuckets),
      startFrame: Math.max(0, Math.round(options.startFrame ?? 0)),
      volume: 1,
      muted: false
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes(file.name)) throw error
    throw new Error(
      `${file.name} could not be decoded. Verify that it is a valid MP3, OGG, or WAV file.`,
      { cause: error }
    )
  } finally {
    await context.close().catch(() => undefined)
  }
}
