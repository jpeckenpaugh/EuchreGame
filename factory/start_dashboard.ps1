$ErrorActionPreference = "Stop"

$VenvPython = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment Python not found at $VenvPython. Run .\factory\setup_venv.ps1 first."
}

& $VenvPython -m uvicorn factory.server:app --host 127.0.0.1 --port 8001 --reload
