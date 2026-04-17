$ErrorActionPreference = "Stop"

$BundledPython = "C:\Users\Jarad\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$VenvPath = Join-Path $PSScriptRoot "..\.venv"
$Requirements = Join-Path $PSScriptRoot "..\requirements-dev.txt"

if (-not (Test-Path $BundledPython)) {
    throw "Bundled Python not found at $BundledPython"
}

& $BundledPython -m venv $VenvPath

$VenvPython = Join-Path $VenvPath "Scripts\python.exe"
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r $Requirements

Write-Host "Virtual environment ready at $VenvPath"
Write-Host "Use: .\\.venv\\Scripts\\Activate.ps1"
