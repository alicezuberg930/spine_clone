# Audio regression fixtures

Run `npm run fixtures:audio` from the `app` directory to generate two deterministic WAV files:

- `pulse-440hz-mono.wav` — 1.2 seconds, 44.1 kHz mono
- `harmony-660hz-stereo.wav` — 1.6 seconds, 44.1 kHz stereo

The generated WAV files are intentionally ignored by Git. Import both files in one selection to exercise multitrack decoding, timeline rendering, mute/volume controls, and synchronized playback without downloading external media.
