import { useEffect, useRef, useState } from 'react'

import type { AudioClip } from '@/@types/audio'

export interface UseAudioPlaybackOptions {
  clips: AudioClip[]
  enabled: boolean
  frame: number
  fps: number
  isPlaying: boolean
  onPlaybackError?: (error: Error) => void
}

interface AudioPlaybackEntry {
  audio: HTMLAudioElement
  dataUrl: string
  playAttempt: Promise<void> | null
  playbackBlocked: boolean
  dispose: () => void
}

function playbackError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Audio playback failed.')
}

function destroyEntry(entry: AudioPlaybackEntry): void {
  entry.audio.pause()
  entry.dispose()
  entry.audio.removeAttribute('src')
  entry.audio.load()
  entry.playAttempt = null
  entry.playbackBlocked = false
}

export function useAudioPlayback({
  clips,
  enabled,
  frame,
  fps,
  isPlaying,
  onPlaybackError
}: UseAudioPlaybackOptions): void {
  const entriesRef = useRef(new Map<string, AudioPlaybackEntry>())
  const errorHandlerRef = useRef(onPlaybackError)
  const [mediaRevision, setMediaRevision] = useState(0)

  useEffect(() => {
    errorHandlerRef.current = onPlaybackError
  }, [onPlaybackError])

  useEffect(() => {
    const entries = entriesRef.current

    entries.forEach((entry, id) => {
      const clip = clips.find((candidate) => candidate.id === id)
      if (!clip || clip.dataUrl !== entry.dataUrl) {
        destroyEntry(entry)
        entries.delete(id)
      }
    })

    clips.forEach((clip) => {
      if (entries.has(clip.id) || !clip.dataUrl) return

      const audio = new Audio(clip.dataUrl)
      const markReady = (): void => setMediaRevision((revision) => revision + 1)
      const handleError = (): void => {
        errorHandlerRef.current?.(
          new Error(
            `${clip.sourceFileName || clip.name || 'An imported audio file'} could not be played.`
          )
        )
      }

      audio.preload = 'auto'
      audio.addEventListener('loadedmetadata', markReady)
      audio.addEventListener('canplay', markReady)
      audio.addEventListener('error', handleError)

      entries.set(clip.id, {
        audio,
        dataUrl: clip.dataUrl,
        playAttempt: null,
        playbackBlocked: false,
        dispose: () => {
          audio.removeEventListener('loadedmetadata', markReady)
          audio.removeEventListener('canplay', markReady)
          audio.removeEventListener('error', handleError)
        }
      })
      audio.load()
    })
  }, [clips])

  useEffect(
    () => () => {
      entriesRef.current.forEach(destroyEntry)
      entriesRef.current.clear()
    },
    []
  )

  useEffect(() => {
    const safeFps = Math.max(1, fps)

    clips.forEach((clip) => {
      const entry = entriesRef.current.get(clip.id)
      if (!entry) return

      const { audio } = entry
      if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) return

      audio.volume = Math.min(1, Math.max(0, clip.volume))
      audio.muted = clip.muted || !enabled

      const desiredTime = frame / safeFps - clip.startFrame / safeFps
      const duration = Math.max(0, clip.durationSeconds)
      const insideClip = desiredTime >= 0 && desiredTime < duration
      const shouldPlay = enabled && isPlaying && insideClip && !clip.muted && clip.volume > 0

      if (!shouldPlay) {
        audio.pause()
        entry.playAttempt = null

        const pausedTime = Math.min(duration, Math.max(0, desiredTime))
        if (Number.isFinite(pausedTime) && Math.abs(audio.currentTime - pausedTime) > 0.001) {
          audio.currentTime = pausedTime
        }

        entry.playbackBlocked = false
        return
      }

      const driftTolerance = Math.max(0.08, 2 / safeFps)
      if (Math.abs(audio.currentTime - desiredTime) > driftTolerance) {
        audio.currentTime = desiredTime
      }

      if (!audio.paused || entry.playAttempt || entry.playbackBlocked) return

      const attempt = audio.play()
      entry.playAttempt = attempt
      void attempt.then(
        () => {
          if (entry.playAttempt === attempt) entry.playAttempt = null
        },
        (error: unknown) => {
          if (entry.playAttempt === attempt) entry.playAttempt = null
          const normalizedError = playbackError(error)
          if (normalizedError.name === 'AbortError') return
          entry.playbackBlocked = true
          errorHandlerRef.current?.(normalizedError)
        }
      )
    })
  }, [clips, enabled, frame, fps, isPlaying, mediaRevision])
}
