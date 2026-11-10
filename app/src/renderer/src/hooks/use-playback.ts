import { useEffect, useRef } from 'react'

interface UsePlaybackOptions {
  isPlaying: boolean
  frame: number
  fps: number
  duration: number
  loop: boolean
  onFrameChange: (frame: number) => void
  onPlayingChange: (playing: boolean) => void
}

export function usePlayback({
  isPlaying,
  frame,
  fps,
  duration,
  loop,
  onFrameChange,
  onPlayingChange
}: UsePlaybackOptions): void {
  const frameRef = useRef(frame)
  const lastRef = useRef(0)

  useEffect(() => {
    frameRef.current = frame
  }, [frame])

  useEffect(() => {
    if (!isPlaying) {
      lastRef.current = 0
      return
    }

    let animationFrame = 0
    const interval = 1000 / Math.max(1, fps)

    const tick = (time: number): void => {
      if (lastRef.current === 0) lastRef.current = time
      const elapsed = time - lastRef.current

      if (elapsed >= interval) {
        const steps = Math.max(1, Math.floor(elapsed / interval))
        const next = frameRef.current + steps
        lastRef.current = time - (elapsed % interval)

        if (next > duration) {
          if (loop) {
            const wrapped = next % Math.max(1, duration + 1)
            frameRef.current = wrapped
            onFrameChange(wrapped)
          } else {
            frameRef.current = duration
            onFrameChange(duration)
            onPlayingChange(false)
            return
          }
        } else {
          frameRef.current = next
          onFrameChange(next)
        }
      }

      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [duration, fps, isPlaying, loop, onFrameChange, onPlayingChange])
}
