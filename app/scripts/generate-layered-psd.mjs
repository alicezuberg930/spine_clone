import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { writePsdBuffer } from 'ag-psd'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(process.argv[2] ?? 'test-fixtures/layers/test.layers.json')
const manifestDirectory = dirname(manifestPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const outputArgument = process.argv[3] ?? manifest.output ?? 'test.psd'
const outputPath = isAbsolute(outputArgument)
  ? outputArgument
  : resolve(manifestDirectory, outputArgument)

if (!Number.isInteger(manifest.width) || !Number.isInteger(manifest.height)) {
  throw new Error('The manifest must define integer width and height values.')
}
if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) {
  throw new Error('The manifest must contain at least one layer.')
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'layer-fixture-'))

try {
  const decoderPath = join(scriptDirectory, 'decode-layer-fixture.ps1')
  const decoderOutput = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      decoderPath,
      '-ManifestPath',
      manifestPath,
      '-OutputDirectory',
      temporaryDirectory
    ],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
  )

  const decodedLayers = decoderOutput
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  if (decodedLayers.length !== manifest.layers.length) {
    throw new Error(
      `Decoded ${decodedLayers.length} bitmaps for ${manifest.layers.length} manifest layers.`
    )
  }

  const children = manifest.layers.map((layer, index) => {
    const decoded = decodedLayers[index]
    const bytes = readFileSync(join(temporaryDirectory, decoded.raw))
    const expectedLength = decoded.width * decoded.height * 4
    if (bytes.byteLength !== expectedLength) {
      throw new Error(`Decoded bitmap ${layer.file} has an invalid byte length.`)
    }

    return {
      name: layer.name ?? basename(layer.file).replace(/\.[^.]+$/u, ''),
      left: layer.x,
      top: layer.y,
      opacity: layer.opacity ?? 1,
      hidden: layer.visible === false,
      blendMode: layer.blendMode ?? 'normal',
      imageData: {
        width: decoded.width,
        height: decoded.height,
        data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      }
    }
  })

  const psd = {
    width: manifest.width,
    height: manifest.height,
    children: [
      {
        name: manifest.groupName ?? manifest.name ?? 'Artwork',
        opened: true,
        children
      }
    ]
  }

  writeFileSync(
    outputPath,
    writePsdBuffer(psd, {
      compress: true,
      trimImageData: false,
      noBackground: true,
      logMissingFeatures: false
    })
  )

  process.stdout.write(
    `${outputPath}\n${manifest.width}x${manifest.height}, ${children.length} layers\n`
  )
} finally {
  const resolvedTemporaryDirectory = realpathSync(temporaryDirectory)
  const resolvedTempRoot = realpathSync(tmpdir())
  if (!resolvedTemporaryDirectory.startsWith(`${resolvedTempRoot}\\`)) {
    throw new Error('Refusing to remove a temporary directory outside the system temp folder.')
  }
  rmSync(resolvedTemporaryDirectory, { recursive: true, force: true })
}
