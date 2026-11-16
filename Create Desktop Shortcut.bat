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

powershell -NoProfile -ExecutionPolicy Bypass -Command "$exe=$env:GAME_EXE; $desktop=[Environment]::GetFolderPath('Desktop'); $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut((Join-Path $desktop 'Crimson Castle.lnk')); $shortcut.TargetPath=$exe; $shortcut.WorkingDirectory=(Split-Path -Parent $exe); $shortcut.Description='Crimson Castle'; $shortcut.Save()"

if errorlevel 1 (
    echo Could not create the desktop shortcut.
    pause
    exit /b 1
)

echo Desktop shortcut created! You can now launch Crimson Castle from your desktop.
pause
