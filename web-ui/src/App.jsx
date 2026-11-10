import { useEffect, useRef, useState } from 'react'

function ImageMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      viewBox="0 0 36 36"
      fill="none"
    >
      <rect x="3" y="3" width="30" height="30" rx="10" fill="currentColor" />
      <path
        d="M10 24.5 16.2 17l4.3 5.1 3.1-3.5 3.4 5.9H10Z"
        fill="#F5F4F0"
      />
      <circle cx="22.5" cy="12.5" r="2.5" fill="#F5F4F0" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path
        d="M16 21V5m0 0-6 6m6-6 6 6M6 20v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path
        d="m10 2 1.65 5.35L17 9l-5.35 1.65L10 16l-1.65-5.35L3 9l5.35-1.65L10 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="m16 13 .7 2.3L19 16l-2.3.7L16 19l-.7-2.3L13 16l2.3-.7L16 13Z"
        fill="currentColor"
      />
    </svg>
  )
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function getErrorMessage(response) {
  try {
    const body = await response.json()
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) {
      return body.detail.map((item) => item.msg).filter(Boolean).join(', ')
    }
  } catch {
    // The server may return a non-JSON error page.
  }

  return response.statusText || `Request failed (${response.status})`
}

function App() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [layers, setLayers] = useState('4')
  const [seed, setSeed] = useState('777')
  const [steps, setSteps] = useState('50')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return undefined
    }

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function chooseFile(nextFile) {
    setError('')
    setSuccess('')
    if (!nextFile) return

    if (!nextFile.type.startsWith('image/')) {
      setFile(null)
      setError('Please choose a valid image file.')
      return
    }

    setFile(nextFile)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!file) {
      setError('Choose an image before separating its layers.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('layers', layers)
    formData.append('seed', seed)
    formData.append('steps', steps)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/v1/layers/decompose', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const archive = await response.blob()
      if (
        archive.size === 0 ||
        !['application/zip', 'application/x-zip-compressed'].includes(
          response.headers.get('content-type')?.split(';')[0].trim() ?? ''
        )
      ) {
        throw new Error('The server did not return a valid layers ZIP file.')
      }

      const downloadUrl = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = 'image_layers.zip'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
      setSuccess('Your layers are ready. The ZIP download has started.')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Something went wrong while separating the image.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function removeFile() {
    setFile(null)
    setError('')
    setSuccess('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Layered home">
          <ImageMark />
          <span>layered</span>
        </a>
        <div className="topbar-note">
          <span className="status-dot" />
          <span>AI image tools</span>
        </div>
      </header>

      <main className="main-content">
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow">
            <SparkleIcon />
            <span>IMAGE TO LAYERS</span>
          </div>
          <h1 id="page-title">
            Every image has
            <br />
            <span>more than one layer.</span>
          </h1>
          <p className="intro-copy">
            Turn a single image into separate, editable layers. Upload your
            image and let AI do the careful work.
          </p>
        </section>

        <section className="workspace" aria-label="Image layer separator">
          <form className="upload-card" onSubmit={handleSubmit}>
            <div className="card-heading">
              <div>
                <p className="step-label">01 / UPLOAD</p>
                <h2>Your starting image</h2>
              </div>
              {file && (
                <button
                  className="text-button"
                  type="button"
                  onClick={removeFile}
                  disabled={isSubmitting}
                >
                  Remove
                </button>
              )}
            </div>

            {file && previewUrl ? (
              <div className="image-preview">
                <img src={previewUrl} alt={`Preview of ${file.name}`} />
                <div className="file-details">
                  <span className="file-badge">IMAGE</span>
                  <div className="file-copy">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <span className="check-mark" aria-label="Image selected">
                    ✓
                  </span>
                </div>
              </div>
            ) : (
              <label className="drop-area" htmlFor="image-file">
                <span className="upload-icon">
                  <UploadIcon />
                </span>
                <span className="drop-title">Choose an image to begin</span>
                <span className="drop-description">
                  Select a JPG, PNG, or WebP from your device
                </span>
                <span className="browse-button">Browse files</span>
                <input
                  ref={inputRef}
                  id="image-file"
                  name="file"
                  type="file"
                  accept="image/*"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                  disabled={isSubmitting}
                />
              </label>
            )}

            <div className="options-heading">
              <div>
                <p className="step-label">02 / OPTIONS</p>
                <h2>Make it yours</h2>
              </div>
            </div>
            <div className="options-grid">
              <label className="option-field" htmlFor="layers">
                <span>Layers</span>
                <input
                  id="layers"
                  name="layers"
                  type="number"
                  min="2"
                  max="10"
                  step="1"
                  value={layers}
                  onChange={(event) => setLayers(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <small>2–10 layers</small>
              </label>
              <label className="option-field" htmlFor="seed">
                <span>Seed</span>
                <input
                  id="seed"
                  name="seed"
                  type="number"
                  step="1"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <small>Controls variation</small>
              </label>
              <label className="option-field" htmlFor="steps">
                <span>Steps</span>
                <input
                  id="steps"
                  name="steps"
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={steps}
                  onChange={(event) => setSteps(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <small>1–50 steps</small>
              </label>
            </div>

            {error && (
              <p className="feedback error-message" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </p>
            )}
            {success && (
              <p className="feedback success-message" role="status">
                <span aria-hidden="true">✓</span>
                {success}
              </p>
            )}

            <button
              className="submit-button"
              type="submit"
              disabled={!file || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner" />
                  Separating your image…
                </>
              ) : (
                <>
                  <SparkleIcon />
                  Separate into layers
                  <span className="button-arrow" aria-hidden="true">
                    →
                  </span>
                </>
              )}
            </button>
            <p className="privacy-note">
              Your image is processed securely and isn’t stored.
            </p>
          </form>

          <aside className="process-card" aria-label="How it works">
            <div className="process-art" aria-hidden="true">
              <div className="art-glow" />
              <div className="art-image art-image-back">
                <span />
                <span />
              </div>
              <div className="art-image art-image-middle">
                <span />
                <span />
              </div>
              <div className="art-image art-image-front">
                <span />
                <span />
              </div>
              <div className="art-sparkle sparkle-one">✳</div>
              <div className="art-sparkle sparkle-two">✦</div>
            </div>
            <div className="process-copy">
              <p className="step-label">A LITTLE MAGIC</p>
              <h2>One image in.<br />A world of layers out.</h2>
              <p>
                Your image is thoughtfully separated into transparent PNG
                layers, bundled together and ready to use.
              </p>
            </div>
            <div className="output-chip">
              <span className="chip-icon">↓</span>
              <span>Transparent PNG layers</span>
              <span className="chip-type">.ZIP</span>
            </div>
          </aside>
        </section>

        <footer className="page-footer">
          <span>Made for the details that make an image yours.</span>
          <span className="footer-mark">LAYERED IMAGE STUDIO</span>
        </footer>
      </main>
    </div>
  )
}

export default App
