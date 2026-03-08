$projectRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $projectRoot 'dist'
$portableDir = Join-Path $distDir 'InventoryApp-Portable'
$zipPath = Join-Path $distDir 'InventoryApp-Portable.zip'

if (-not (Test-Path $portableDir)) {
  Write-Error "[zip] Portable folder not found: $portableDir"
  exit 1
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path $portableDir -DestinationPath $zipPath -Force
Write-Output "[zip] Ready: $zipPath"
