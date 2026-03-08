Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectRoot 'assets'
if (-not (Test-Path $assetsDir)) {
  New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

$iconPath = Join-Path $assetsDir 'icon.ico'

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(15, 23, 42))

$rect = New-Object System.Drawing.RectangleF(28, 28, 200, 200)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(14, 165, 233))
$g.FillEllipse($brush, $rect)

$font = New-Object System.Drawing.Font('Segoe UI', 120, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.DrawString('I', $font, $textBrush, (New-Object System.Drawing.RectangleF(0, 0, $size, $size)), $format)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()

$icon.Dispose()
[System.Runtime.InteropServices.Marshal]::Release($hIcon) | Out-Null
$textBrush.Dispose()
$format.Dispose()
$font.Dispose()
$brush.Dispose()
$g.Dispose()
$bmp.Dispose()

Write-Output "[icon] Generated: $iconPath"
