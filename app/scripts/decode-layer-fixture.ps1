param(
  [Parameter(Mandatory = $true)]
  [string] $ManifestPath,

  [Parameter(Mandatory = $true)]
  [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$resolvedManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
$manifestDirectory = Split-Path -Parent $resolvedManifest
$manifest = Get-Content -LiteralPath $resolvedManifest -Raw | ConvertFrom-Json

[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

for ($index = 0; $index -lt $manifest.layers.Count; $index++) {
  $layer = $manifest.layers[$index]
  $sourcePath = Join-Path $manifestDirectory ([string] $layer.file)
  $resolvedSource = (Resolve-Path -LiteralPath $sourcePath).Path
  $sourceBitmap = [System.Drawing.Bitmap]::FromFile($resolvedSource)

  try {
    $sourceBounds = [System.Drawing.Rectangle]::new(0, 0, $sourceBitmap.Width, $sourceBitmap.Height)
    $targetWidth = if ($null -ne $layer.width) {
      [int] $layer.width
    } elseif ($null -ne $layer.scale) {
      [int] [Math]::Round($sourceBitmap.Width * [double] $layer.scale)
    } elseif ($null -ne $manifest.dpi) {
      [int] [Math]::Round($sourceBitmap.Width * [double] $manifest.dpi / $sourceBitmap.HorizontalResolution)
    } else {
      $sourceBitmap.Width
    }
    $targetHeight = if ($null -ne $layer.height) {
      [int] $layer.height
    } elseif ($null -ne $layer.scale) {
      [int] [Math]::Round($sourceBitmap.Height * [double] $layer.scale)
    } elseif ($null -ne $manifest.dpi) {
      [int] [Math]::Round($sourceBitmap.Height * [double] $manifest.dpi / $sourceBitmap.VerticalResolution)
    } else {
      $sourceBitmap.Height
    }

    if ($targetWidth -eq $sourceBitmap.Width -and $targetHeight -eq $sourceBitmap.Height) {
      $bitmap = $sourceBitmap.Clone(
        $sourceBounds,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
      )
    } else {
      $bitmap = [System.Drawing.Bitmap]::new(
        $targetWidth,
        $targetHeight,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
      )
      if ($null -ne $manifest.dpi) {
        $bitmap.SetResolution([single] $manifest.dpi, [single] $manifest.dpi)
      }
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $targetBounds = [System.Drawing.Rectangle]::new(0, 0, $targetWidth, $targetHeight)
        $graphics.DrawImage(
          $sourceBitmap,
          $targetBounds,
          0,
          0,
          $sourceBitmap.Width,
          $sourceBitmap.Height,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }
    }

    try {
      $bounds = [System.Drawing.Rectangle]::new(0, 0, $bitmap.Width, $bitmap.Height)
      $bitmapData = $bitmap.LockBits(
        $bounds,
        [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
      )

      try {
        $stride = [Math]::Abs($bitmapData.Stride)
        $sourceBytes = [byte[]]::new($stride * $bitmap.Height)
        [System.Runtime.InteropServices.Marshal]::Copy(
          $bitmapData.Scan0,
          $sourceBytes,
          0,
          $sourceBytes.Length
        )

        $rgba = [byte[]]::new($bitmap.Width * $bitmap.Height * 4)
        for ($y = 0; $y -lt $bitmap.Height; $y++) {
          $sourceRow = if ($bitmapData.Stride -ge 0) {
            $y * $stride
          } else {
            ($bitmap.Height - 1 - $y) * $stride
          }
          $targetRow = $y * $bitmap.Width * 4

          for ($x = 0; $x -lt $bitmap.Width; $x++) {
            $sourceOffset = $sourceRow + ($x * 4)
            $targetOffset = $targetRow + ($x * 4)
            $rgba[$targetOffset] = $sourceBytes[$sourceOffset + 2]
            $rgba[$targetOffset + 1] = $sourceBytes[$sourceOffset + 1]
            $rgba[$targetOffset + 2] = $sourceBytes[$sourceOffset]
            $rgba[$targetOffset + 3] = $sourceBytes[$sourceOffset + 3]
          }
        }

        $outputPath = Join-Path $OutputDirectory ('{0:D3}.rgba' -f $index)
        [System.IO.File]::WriteAllBytes($outputPath, $rgba)

        [pscustomobject]@{
          index = $index
          width = $bitmap.Width
          height = $bitmap.Height
          raw = [System.IO.Path]::GetFileName($outputPath)
        } | ConvertTo-Json -Compress
      } finally {
        $bitmap.UnlockBits($bitmapData)
      }
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $sourceBitmap.Dispose()
  }
}
