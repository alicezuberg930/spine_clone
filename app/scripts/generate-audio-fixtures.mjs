import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(appDirectory, 'test-fixtures', 'audio')

// JavaScript fixture scripts cannot express a TypeScript return annotation.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createToneWave({ frequency, durationSeconds, channels, phaseOffset = 0 }) {
  const sampleRate = 44_100
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const sampleCount = Math.round(durationSeconds * sampleRate)
  const blockAlign = channels * bytesPerSample
  const dataSize = sampleCount * blockAlign
  const wave = Buffer.alloc(44 + dataSize)

  wave.write('RIFF', 0, 'ascii')
  wave.writeUInt32LE(36 + dataSize, 4)
  wave.write('WAVE', 8, 'ascii')
  wave.write('fmt ', 12, 'ascii')
  wave.writeUInt32LE(16, 16)
  wave.writeUInt16LE(1, 20)
  wave.writeUInt16LE(channels, 22)
  wave.writeUInt32LE(sampleRate, 24)
  wave.writeUInt32LE(sampleRate * blockAlign, 28)
  wave.writeUInt16LE(blockAlign, 32)
  wave.writeUInt16LE(bitsPerSample, 34)
  wave.write('data', 36, 'ascii')
  wave.writeUInt32LE(dataSize, 40)

  const attackSamples = Math.round(sampleRate * 0.02)
  const releaseSamples = Math.round(sampleRate * 0.04)
  let offset = 44

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const attack = Math.min(1, sampleIndex / Math.max(1, attackSamples))
    const release = Math.min(1, (sampleCount - sampleIndex - 1) / Math.max(1, releaseSamples))
    const envelope = Math.max(0, Math.min(attack, release))

    for (let channel = 0; channel < channels; channel += 1) {
      const phase = channel === 0 ? 0 : phaseOffset
      const sample = Math.sin((2 * Math.PI * frequency * sampleIndex) / sampleRate + phase)
      wave.writeInt16LE(Math.round(sample * envelope * 0.14 * 32_767), offset)
      offset += bytesPerSample
    }
  }

  return wave
}

const fixtures = [
  {
    name: 'pulse-440hz-mono.wav',
    options: { frequency: 440, durationSeconds: 1.2, channels: 1 }
  },
  {
    name: 'harmony-660hz-stereo.wav',
    options: { frequency: 660, durationSeconds: 1.6, channels: 2, phaseOffset: Math.PI / 2 }
  }
]

await mkdir(outputDirectory, { recursive: true })

for (const fixture of fixtures) {
  const outputPath = path.join(outputDirectory, fixture.name)
  await writeFile(outputPath, createToneWave(fixture.options))
  console.log(outputPath)
}
