/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampViewportZoom,
  exceedsDragThreshold,
  mergeSelectionIds,
  normalizeViewportRect,
  rectangleIntersects,
  zoomPanAtPoint
} from '../src/renderer/src/lib/viewport-math.ts'

const almostEqual = (actual, expected, epsilon = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  )

function screenToDocument(screen, pan, zoomPercent, center = { x: 400, y: 300 }) {
  const scale = clampViewportZoom(zoomPercent) / 100
  return {
    x: center.x + (screen.x - center.x - pan.x) / scale,
    y: center.y + (screen.y - center.y - pan.y) / scale
  }
}

test('normalizes rectangles for forward, reverse, and axis-aligned drags', () => {
  assert.deepEqual(normalizeViewportRect({ x: 10, y: 20 }, { x: 35, y: 55 }), {
    x: 10,
    y: 20,
    width: 25,
    height: 35
  })
  assert.deepEqual(normalizeViewportRect({ x: 35, y: 55 }, { x: 10, y: 20 }), {
    x: 10,
    y: 20,
    width: 25,
    height: 35
  })
  assert.deepEqual(normalizeViewportRect({ x: 35, y: 20 }, { x: 10, y: 55 }), {
    x: 10,
    y: 20,
    width: 25,
    height: 35
  })
  assert.deepEqual(normalizeViewportRect({ x: 4.5, y: -2 }, { x: 4.5, y: 8 }), {
    x: 4.5,
    y: -2,
    width: 0,
    height: 10
  })
})

test('detects rectangle overlap, containment, touching edges, and separation', () => {
  const base = { x: 10, y: 10, width: 20, height: 20 }
  assert.equal(rectangleIntersects(base, { x: 15, y: 15, width: 2, height: 2 }), true)
  assert.equal(rectangleIntersects(base, { x: 30, y: 18, width: 5, height: 5 }), true)
  assert.equal(rectangleIntersects(base, { x: 30, y: 30, width: 0, height: 0 }), true)
  assert.equal(rectangleIntersects(base, { x: 30.001, y: 10, width: 5, height: 5 }), false)
  assert.equal(rectangleIntersects(base, { x: -5, y: -5, width: 10, height: 10 }), false)
})

test('accepts rectangles expressed with negative width or height', () => {
  assert.equal(
    rectangleIntersects(
      { x: 30, y: 30, width: -20, height: -20 },
      { x: 0, y: 15, width: 15, height: 5 }
    ),
    true
  )
})

test('uses a strict four-pixel drag threshold by default', () => {
  assert.equal(exceedsDragThreshold({ x: 0, y: 0 }, { x: 4, y: 0 }), false)
  assert.equal(exceedsDragThreshold({ x: 0, y: 0 }, { x: 0, y: -4 }), false)
  assert.equal(exceedsDragThreshold({ x: 0, y: 0 }, { x: 4, y: 0.001 }), true)
  assert.equal(exceedsDragThreshold({ x: 0, y: 0 }, { x: 3, y: 3 }), true)
  assert.equal(exceedsDragThreshold({ x: 2, y: 2 }, { x: 2, y: 2 }, -10), false)
  assert.equal(exceedsDragThreshold({ x: 2, y: 2 }, { x: 2.1, y: 2 }, 0), true)
})

test('clamps viewport zoom to 25 through 400 percent', () => {
  assert.equal(clampViewportZoom(-Infinity), 25)
  assert.equal(clampViewportZoom(-1), 25)
  assert.equal(clampViewportZoom(25), 25)
  assert.equal(clampViewportZoom(137.5), 137.5)
  assert.equal(clampViewportZoom(400), 400)
  assert.equal(clampViewportZoom(401), 400)
  assert.equal(clampViewportZoom(Infinity), 400)
  assert.equal(clampViewportZoom(Number.NaN), 100)
})

test('preserves the document point below the cursor while zooming in and out', () => {
  const cases = [
    {
      pan: { x: 0, y: 0 },
      cursor: { x: 725, y: 140 },
      currentZoom: 100,
      nextZoom: 250,
      center: { x: 400, y: 300 }
    },
    {
      pan: { x: 75, y: -40 },
      cursor: { x: 120, y: 510 },
      currentZoom: 320,
      nextZoom: 50,
      center: { x: 400, y: 300 }
    },
    {
      pan: { x: -12, y: 18 },
      cursor: { x: 24, y: 31 },
      currentZoom: 75,
      nextZoom: 180,
      center: { x: 0, y: 0 }
    }
  ]

  for (const testCase of cases) {
    const before = screenToDocument(
      testCase.cursor,
      testCase.pan,
      testCase.currentZoom,
      testCase.center
    )
    const nextPan = zoomPanAtPoint(
      testCase.pan,
      testCase.cursor,
      testCase.currentZoom,
      testCase.nextZoom,
      testCase.center
    )
    const after = screenToDocument(testCase.cursor, nextPan, testCase.nextZoom, testCase.center)
    almostEqual(after.x, before.x)
    almostEqual(after.y, before.y)
  }
})

test('uses clamped zoom values and keeps pan stable when zoom is unchanged', () => {
  const pan = { x: 17, y: -23 }
  assert.deepEqual(zoomPanAtPoint(pan, { x: 600, y: 400 }, 100, 100), pan)

  const clamped = zoomPanAtPoint(pan, { x: 600, y: 400 }, 10, 25)
  almostEqual(clamped.x, pan.x)
  almostEqual(clamped.y, pan.y)
})

test('replaces a selection with unique hit ids in hit order', () => {
  assert.deepEqual(mergeSelectionIds(['old', 'old'], ['mesh-2', 'mesh-1', 'mesh-2'], 'replace'), [
    'mesh-2',
    'mesh-1'
  ])
  assert.deepEqual(mergeSelectionIds(['old'], [], 'replace'), [])
})

test('adds hits without reordering or duplicating the current selection', () => {
  assert.deepEqual(mergeSelectionIds(['a', 'b', 'a'], ['b', 'c', 'c', 'd'], 'add'), [
    'a',
    'b',
    'c',
    'd'
  ])
  assert.deepEqual(mergeSelectionIds([], ['a', 'a'], 'add'), ['a'])
})

test('toggles each unique hit exactly once while preserving stable order', () => {
  assert.deepEqual(mergeSelectionIds(['a', 'b', 'a', 'c'], ['b', 'd', 'd', 'a'], 'toggle'), [
    'c',
    'd'
  ])
  assert.deepEqual(mergeSelectionIds([], ['x', 'x', 'y'], 'toggle'), ['x', 'y'])
  assert.deepEqual(mergeSelectionIds(['x', 'y'], [], 'toggle'), ['x', 'y'])
})
