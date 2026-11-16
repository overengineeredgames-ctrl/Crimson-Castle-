$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$portableDir = Join-Path $root "dist\portable"
$distDir = Join-Path $root "dist"

$gameExe = Get-ChildItem -Path $portableDir -Filter "*.exe" -File |
    Select-Object -First 1

if (-not $gameExe) {
    throw "Portable game EXE not found in $portableDir. Build the portable target first."
}

$shortcutHelper = Join-Path $root "Create Desktop Shortcut.bat"
if (-not (Test-Path $shortcutHelper)) {
    throw "Create Desktop Shortcut.bat is missing."
}

$zipPath = Join-Path $distDir ($gameExe.BaseName + "-Desktop.zip")
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path @($gameExe.FullName, $shortcutHelper) -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host ""
Write-Host "Portable ZIP created:"
Write-Host $zipPath
