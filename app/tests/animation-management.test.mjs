/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  activateAnimation,
  animationNameValidationError,
  createAnimation,
  deleteAnimation,
  nextAnimationName,
  normalizeAnimationName,
  renameAnimation
} from '../src/renderer/src/lib/animation-management.ts'

const keyframe = (id, frame, value) => ({
  id,
  trackId: 'track-root-rotation',
  targetId: 'bone-root',
  property: 'rotation',
  frame,
  value,
  interpolation: 'bezier'
})

const animationA = {
  id: 'animation-a',
  name: 'Idle',
  duration: 30,
  fps: 30,
  loop: true,
  tracks: [],
  keyframes: []
}

const animationB = {
  id: 'animation-b',
  name: 'Run',
  duration: 20,
  fps: 24,
  loop: false,
  tracks: [],
  keyframes: [keyframe('key-b', 5, 20)]
}

const createState = () => ({
  project: {
    id: 'project-animation-test',
    name: 'Animation test',
    skeletonName: 'animation_test',
    canvas: { width: 640, height: 480 },
    boneSpace: 'canvas',
    bones: [],
    slots: [],
    attachments: [],
    constraints: [],
    skins: [],
    animations: [structuredClone(animationA), structuredClone(animationB)],
    artwork: null,
    audioTracks: [],
    updatedAt: '2026-11-12T00:00:00.000Z'
  },
  activeAnimation: 'animation-a',
  fps: 60,
  duration: 48,
  loop: false,
  keyframes: [keyframe('key-a-live', 12, 45)],
  frame: 12,
  isPlaying: true,
  selection: { kind: 'bone', id: 'bone-root' },
  selections: [{ kind: 'bone', id: 'bone-root' }]
})

test('switching animations commits the old timeline and restores it when switching back', () => {
  const switchedToB = activateAnimation(createState(), 'animation-b')

  assert.equal(switchedToB.activeAnimation, 'animation-b')
  assert.equal(switchedToB.frame, 0)
  assert.equal(switchedToB.isPlaying, false)
  assert.equal(switchedToB.fps, 24)
  assert.equal(switchedToB.duration, 20)
  assert.equal(switchedToB.loop, false)
  assert.deepEqual(switchedToB.keyframes, animationB.keyframes)
  assert.deepEqual(
    switchedToB.project.animations.find((animation) => animation.id === 'animation-a').keyframes,
    [keyframe('key-a-live', 12, 45)]
  )

  const editedB = {
    ...switchedToB,
    fps: 50,
    duration: 64,
    loop: true,
    keyframes: [keyframe('key-b-live', 18, 90)]
  }
  const switchedBack = activateAnimation(editedB, 'animation-a')

  assert.equal(switchedBack.activeAnimation, 'animation-a')
  assert.equal(switchedBack.fps, 60)
  assert.equal(switchedBack.duration, 48)
  assert.equal(switchedBack.loop, false)
  assert.deepEqual(switchedBack.keyframes, [keyframe('key-a-live', 12, 45)])
  assert.deepEqual(
    switchedBack.project.animations.find((animation) => animation.id === 'animation-b').keyframes,
    [keyframe('key-b-live', 18, 90)]
  )
})

test('creating an animation commits the current one and activates an empty timeline', () => {
  const created = createAnimation(createState(), 'Attack')
  const attack = created.project.animations.find((animation) => animation.name === 'Attack')

  assert.ok(attack)
  assert.equal(created.activeAnimation, attack.id)
  assert.equal(created.project.animations.length, 3)
  assert.deepEqual(created.keyframes, [])
  assert.deepEqual(attack.keyframes, [])
  assert.equal(created.frame, 0)
  assert.equal(created.isPlaying, false)
  assert.deepEqual(
    created.project.animations.find((animation) => animation.id === 'animation-a').keyframes,
    [keyframe('key-a-live', 12, 45)]
  )
})

test('renaming trims a unique name and refuses blank or duplicate names', () => {
  const state = createState()
  const renamed = renameAnimation(state, 'animation-b', '  Sprint  ')

  assert.equal(
    renamed.project.animations.find((animation) => animation.id === 'animation-b').name,
    'Sprint'
  )
  assert.equal(renameAnimation(state, 'animation-b', 'Idle'), state)
  assert.equal(renameAnimation(state, 'animation-b', '   '), state)
  assert.equal(normalizeAnimationName('  Jump  '), 'Jump')
  assert.equal(
    animationNameValidationError(state.project.animations, 'animation-b', ' idle '),
    'An animation named “idle” already exists.'
  )
  assert.equal(nextAnimationName(state.project.animations), 'Animation 3')
})

test('deleting inactive and active animations preserves or hydrates the right timeline', () => {
  const state = createState()
  const withoutB = deleteAnimation(state, 'animation-b')

  assert.equal(withoutB.activeAnimation, 'animation-a')
  assert.equal(withoutB.frame, 12)
  assert.equal(withoutB.isPlaying, true)
  assert.deepEqual(withoutB.keyframes, state.keyframes)

  const withoutA = deleteAnimation(state, 'animation-a')
  assert.equal(withoutA.activeAnimation, 'animation-b')
  assert.equal(withoutA.frame, 0)
  assert.equal(withoutA.isPlaying, false)
  assert.equal(withoutA.fps, 24)
  assert.deepEqual(withoutA.keyframes, animationB.keyframes)
})

test('the final animation cannot be deleted', () => {
  const state = createState()
  state.project.animations = [structuredClone(animationA)]
  const result = deleteAnimation(state, 'animation-a')

  assert.equal(result, state)
  assert.equal(result.project.animations.length, 1)
})
