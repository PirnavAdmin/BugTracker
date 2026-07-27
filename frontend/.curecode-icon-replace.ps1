Add-Type -AssemblyName System.Drawing

$sourcePath = 'C:\Users\ADMIN\Downloads\ChatGPT Image Jul 27, 2026, 04_33_13 PM.png'
$iconPath = Join-Path $PSScriptRoot 'public\icons'
$masterPath = Join-Path $iconPath 'curecode-icon-master.png'
$source = [System.Drawing.Bitmap]::FromFile($sourcePath)

# Preserve the supplied image exactly; it has visible RGB data with an empty alpha channel.
$rect = New-Object System.Drawing.Rectangle 0, 0, $source.Width, $source.Height
$data = $source.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$length = [Math]::Abs($data.Stride) * $source.Height
$pixels = New-Object byte[] $length
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $length)
for ($index = 3; $index -lt $length; $index += 4) { $pixels[$index] = 255 }
[System.Runtime.InteropServices.Marshal]::Copy($pixels, 0, $data.Scan0, $length)
$source.UnlockBits($data)
$source.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
$source.Dispose()

function Save-IconPng([int]$size, [string]$name) {
  $master = [System.Drawing.Image]::FromFile($masterPath)
  $icon = New-Object System.Drawing.Bitmap $size, $size
  $canvas = [System.Drawing.Graphics]::FromImage($icon)
  $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $canvas.DrawImage($master, 0, 0, $size, $size)
  $icon.Save((Join-Path $iconPath $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  $icon.Dispose()
  $master.Dispose()
}

Save-IconPng 16 'favicon-16x16.png'
Save-IconPng 32 'favicon-32x32.png'
Save-IconPng 48 'favicon-48x48.png'
Save-IconPng 180 'apple-touch-icon.png'
Save-IconPng 192 'icon-192x192.png'
Save-IconPng 512 'icon-512x512.png'

$favicon = New-Object System.Drawing.Bitmap (Join-Path $iconPath 'favicon-32x32.png')
$icon = [System.Drawing.Icon]::FromHandle($favicon.GetHicon())
foreach ($destination in @((Join-Path $iconPath 'favicon.ico'), (Join-Path $PSScriptRoot 'public\favicon.ico'))) {
  $stream = [System.IO.File]::Create($destination)
  $icon.Save($stream)
  $stream.Dispose()
}
$icon.Dispose()
$favicon.Dispose()
