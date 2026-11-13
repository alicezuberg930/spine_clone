import { useEffect, useRef, useState } from 'react'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

function isSupportedImage(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_IMAGE_TYPES.has(file.type) || SUPPORTED_IMAGE_EXTENSIONS.has(extension)
}

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

function waitForNextPoll(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Request cancelled', 'AbortError'))
      return
    }

    function handleAbort() {
      window.clearTimeout(timeout)
      reject(new DOMException('Request cancelled', 'AbortError'))
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function startArchiveDownload(archive) {
  const downloadUrl = URL.createObjectURL(archive)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = 'see-through-layers.zip'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
}

function App() {
  const inputRef = useRef(null)
  const requestRef = useRef(null)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [resolution, setResolution] = useState('1024')
  const [splitLeftRight, setSplitLeftRight] = useState(false)
  const [includeIntermediates, setIncludeIntermediates] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobStatus, setJobStatus] = useState(null)
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

  useEffect(() => {
    return () => requestRef.current?.abort()
  }, [])

  function chooseFile(nextFile) {
    setError('')
    setSuccess('')
    setJobStatus(null)
    if (!nextFile) return

    if (!isSupportedImage(nextFile)) {
      setFile(null)
      setError('Choose a PNG, JPG, or WebP character image.')
      return
    }

    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setFile(null)
      setError('Choose an image smaller than 25 MB.')
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
    formData.append('resolution', resolution)
    formData.append('split_left_right', String(splitLeftRight))
    formData.append('include_intermediates', String(includeIntermediates))
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setIsSubmitting(true)
    setJobStatus({
      status: 'uploading',
      stage: 'uploading',
      message: 'Uploading and validating the image',
      progress: 1,
      stage_progress: null,
      current: null,
      total: null
    })

    try {
      const response = await fetch('/api/v1/characters/decompose', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      let snapshot = await response.json()
      setJobStatus(snapshot)

      while (snapshot.status === 'queued' || snapshot.status === 'running') {
        await waitForNextPoll(snapshot.retry_after_ms ?? 1000, controller.signal)
        const statusResponse = await fetch(snapshot.status_url, {
          signal: controller.signal,
          cache: 'no-store'
        })
        if (!statusResponse.ok) {
          throw new Error(await getErrorMessage(statusResponse))
        }
        snapshot = await statusResponse.json()
        setJobStatus(snapshot)
      }

      if (snapshot.status === 'failed') {
        throw new Error(snapshot.error || 'Character decomposition failed.')
      }
      if (snapshot.status !== 'complete' || !snapshot.download_url) {
        throw new Error('The decomposition job ended without a download.')
      }

      const downloadResponse = await fetch(snapshot.download_url, {
        signal: controller.signal,
        cache: 'no-store'
      })
      if (!downloadResponse.ok) {
        throw new Error(await getErrorMessage(downloadResponse))
      }
      const archive = await downloadResponse.blob()
      if (
        archive.size === 0 ||
        !['application/zip', 'application/x-zip-compressed'].includes(
          downloadResponse.headers.get('content-type')?.split(';')[0].trim() ?? ''
        )
      ) {
        throw new Error('The server did not return a valid layers ZIP file.')
      }

      startArchiveDownload(archive)
      setSuccess('Your character layers are ready. The ZIP download has started.')
    } catch (requestError) {
      if (requestError?.name === 'AbortError') {
        return
      }
      const failureMessage =
        requestError instanceof Error
          ? requestError.message
          : 'Something went wrong while separating the character.'
      setJobStatus((current) => {
        if (current?.status === 'complete' || current?.status === 'failed') {
          return current
        }
        return {
          ...current,
          status: 'failed',
          stage: 'failed',
          message: failureMessage,
          error: failureMessage,
          stage_progress: null,
          current: null,
          total: null
        }
      })
      setError(failureMessage)
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setIsSubmitting(false)
      }
    }
  }

  function removeFile() {
    setFile(null)
    setError('')
    setSuccess('')
    setJobStatus(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="app-shell">
      <main className="main-content">
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow">
            <SparkleIcon />
            <span>CHARACTER TO LAYERS</span>
          </div>
          <h1 id="page-title">
            One character.
            <br />
            <span>Every part editable.</span>
          </h1>
          <p className="intro-copy">
            Separate an anime character into semantically named, depth-ordered
            layers with reconstructed hidden regions.
          </p>
        </section>

        <section aria-label="Character layer separator">
          <form
            className="upload-card"
            onSubmit={handleSubmit}
            aria-busy={isSubmitting}
          >
            <div className="card-heading">
              <div>
                <p className="step-label">01 / UPLOAD</p>
                <h2>Your character artwork</h2>
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
                  <span className="file-badge">CHARACTER</span>
                  <div className="file-copy">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatFileSize(file.size)}</span>
                  </div>
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
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                  disabled={isSubmitting}
                />
              </label>
            )}

            <div className="options-heading">
              <div>
                <p className="step-label">02 / OPTIONS</p>
                <h2>Character output</h2>
              </div>
            </div>
            <div className="options-grid">
              <label className="option-field" htmlFor="resolution">
                <span>Output quality</span>
                <select
                  id="resolution"
                  name="resolution"
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="768">Fast · 768 px</option>
                  <option value="1024">Detailed · 1024 px</option>
                </select>
                <small>1024 px recommended</small>
              </label>
              <label className="option-toggle" htmlFor="split-left-right">
                <input
                  id="split-left-right"
                  name="split_left_right"
                  type="checkbox"
                  checked={splitLeftRight}
                  onChange={(event) => setSplitLeftRight(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span>
                  <strong>Split paired features</strong>
                  <small>Separate left and right details</small>
                </span>
              </label>
              <label className="option-toggle" htmlFor="include-intermediates">
                <input
                  id="include-intermediates"
                  name="include_intermediates"
                  type="checkbox"
                  checked={includeIntermediates}
                  onChange={(event) => setIncludeIntermediates(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span>
                  <strong>Include intermediate files</strong>
                  <small>Add PNG layers and supporting files</small>
                </span>
              </label>
            </div>

            {jobStatus && (
              <section
                className={`progress-panel progress-${jobStatus.status}`}
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="progress-heading">
                  <div>
                    <span className="progress-kicker">LIVE PROGRESS</span>
                    <strong>{jobStatus.message}</strong>
                  </div>
                  <span className="progress-percent">
                    {Math.round(jobStatus.progress ?? 0)}%
                  </span>
                </div>
                <div
                  className={`progress-bar ${isSubmitting && jobStatus.stage_progress == null
                    ? 'is-indeterminate'
                    : ''
                    }`}
                  role="progressbar"
                  aria-label={jobStatus.message}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={
                    isSubmitting && jobStatus.stage_progress == null
                      ? undefined
                      : Math.round(jobStatus.progress ?? 0)
                  }
                >
                  <span
                    className="progress-fill"
                    style={
                      isSubmitting && jobStatus.stage_progress == null
                        ? undefined
                        : { width: `${Math.round(jobStatus.progress ?? 0)}%` }
                    }
                  />
                </div>
                <div className="progress-meta">
                  <span>{jobStatus.stage?.replaceAll('_', ' ')}</span>
                  <span>
                    {jobStatus.current != null && jobStatus.total != null
                      ? `${jobStatus.current} / ${jobStatus.total} steps`
                      : jobStatus.status === 'complete'
                        ? 'Download ready'
                        : 'Working…'}
                  </span>
                </div>
                {jobStatus.status === 'complete' && jobStatus.download_url && (
                  <a
                    className="progress-download"
                    href={jobStatus.download_url}
                    download="see-through-layers.zip"
                  >
                    Download ZIP again
                  </a>
                )}
              </section>
            )}

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
                  <span className="spinner" aria-hidden="true" />
                  Processing layers…
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
            <p className="privacy-note" role="status" aria-live="polite">
              {isSubmitting
                ? 'Live progress refreshes every second. Keep this tab open for the download.'
                : 'Completed job files remain available temporarily for download.'}
            </p>
          </form>
        </section>

        <footer className="page-footer">
          <span>Prepared for editing, rigging, and animation workflows.</span>
          <span className="footer-mark">LAYERED IMAGE STUDIO</span>
        </footer>
      </main>
    </div>
  )
}

export default App
