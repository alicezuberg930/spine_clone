import assert from 'node:assert/strict'
import test from 'node:test'

import { createEmptyProject } from '../src/renderer/src/lib/editor-defaults.ts'

test('an empty project contains no preloaded rig or media content', () => {
  const project = createEmptyProject()

  assert.deepEqual(project.bones, [])
  assert.deepEqual(project.slots, [])
  assert.deepEqual(project.attachments, [])
  assert.deepEqual(project.constraints, [])
  assert.equal(project.artwork, null)
  assert.deepEqual(project.audioTracks, [])
  assert.deepEqual(project.animations[0].tracks, [])
  assert.deepEqual(project.animations[0].keyframes, [])
})

test('empty project instances do not share mutable editor data', () => {
  const first = createEmptyProject()
  const second = createEmptyProject()

  first.skins[0].attachmentIds.push('attachment-added-later')
  first.animations[0].tracks.push({
    id: 'track-added-later',
    name: 'Added later',
    targetId: 'bone-added-later',
    property: 'rotation',
    color: '#ffffff'
  })

  assert.deepEqual(second.skins[0].attachmentIds, [])
  assert.deepEqual(second.animations[0].tracks, [])
})
