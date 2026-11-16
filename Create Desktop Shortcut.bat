@echo off
setlocal
set "GAME_EXE="
for %%F in ("%~dp0*.exe") do set "GAME_EXE=%%~fF"

if not defined GAME_EXE (
    echo Could not find the Crimson Castle portable EXE.
    echo Keep this file in the same folder as the game EXE.
    pause
    exit /b 1
)

set "GAME_ICON=%~dp0CrimsonCastle.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$exe=$env:GAME_EXE; $icon=$env:GAME_ICON; $desktop=[Environment]::GetFolderPath('Desktop'); $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut((Join-Path $desktop 'Crimson Castle.lnk')); $shortcut.TargetPath=$exe; $shortcut.WorkingDirectory=(Split-Path -Parent $exe); if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation=$icon + ',0' }; $shortcut.Description='Crimson Castle'; $shortcut.Save()"

if errorlevel 1 (
    echo Could not create the desktop shortcut.
    pause
    exit /b 1
)

echo Desktop shortcut created! You can now launch Crimson Castle from your desktop.
if not exist "%GAME_ICON%" echo Note: CrimsonCastle.ico was not found, so Windows will use the default app icon.
pause
