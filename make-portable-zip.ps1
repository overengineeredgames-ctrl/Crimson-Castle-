$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$portableDir = Join-Path $root "dist\portable"
$distDir = Join-Path $root "dist"

$gameExe = Get-ChildItem -Path $portableDir -Filter "*.exe" -File |
    Where-Object { $_.Name -notlike "*uninstaller*" } |
    Sort-Object Length -Descending |
    Select-Object -First 1

if (-not $gameExe) {
    throw "Portable game EXE not found in $portableDir. Build the portable target first."
}

$shortcutHelper = Join-Path $root "Create Desktop Shortcut.bat"
if (-not (Test-Path $shortcutHelper)) {
    throw "Create Desktop Shortcut.bat is missing."
}

$gameIcon = Join-Path $root "CrimsonCastle.ico"
if (-not (Test-Path $gameIcon)) {
    throw "CrimsonCastle.ico is missing. Download the icon and place it beside this script before creating the ZIP."
}

$zipPath = Join-Path $distDir ($gameExe.BaseName + "-Desktop.zip")
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("CrimsonCastle-" + [guid]::NewGuid().ToString("N"))

try {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    Copy-Item -LiteralPath $gameExe.FullName -Destination $tempDir
    Copy-Item -LiteralPath $shortcutHelper -Destination $tempDir
    Copy-Item -LiteralPath $gameIcon -Destination $tempDir

    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }

    Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
    Write-Host ""
    Write-Host "Portable ZIP created:"
    Write-Host $zipPath
}
finally {
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
    }
}
