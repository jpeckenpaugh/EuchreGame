param(
    [int]$Games = 1000,
    [int]$Seed = 7,
    [int]$WinningScore = 10,
    [double]$Timeout = 180,
    [int]$Retries = 2,
    [switch]$Detached,
    [switch]$PreviewOnly
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment Python not found at $VenvPython. Run .\factory\setup_venv.ps1 first."
}

$BackendM4 = "m4-mlx|openai|http://192.168.1.107:8080|mlx-community/gemma-4-e4b-it-8bit|1.0"
$BackendLocal = "win-ollama|ollama|http://127.0.0.1:11434|gemma4:latest|1.0"

$ArgumentList = @(
    "-m",
    "factory.run_trajectory_pool",
    "--games", $Games,
    "--seed", $Seed,
    "--winning-score", $WinningScore,
    "--timeout", $Timeout,
    "--retries", $Retries,
    "--backend", $BackendM4,
    "--backend", $BackendLocal
)

$CommandPreview = @(
    $VenvPython
    $ArgumentList
) -join " "

Write-Host "Project root: $ProjectRoot"
Write-Host "Command:"
Write-Host $CommandPreview

if ($PreviewOnly) {
    Write-Host "Preview only; no run was started."
    return
}

if ($Detached) {
    $DetachedArgs = @(
        "-NoExit",
        "-Command",
        "Set-Location '$ProjectRoot'; & '$VenvPython' $($ArgumentList.ForEach({ if ($_ -match '\s') { "'$_'" } else { "$_" } }) -join ' ')"
    )
    Start-Process powershell -ArgumentList $DetachedArgs | Out-Null
    Write-Host "Detached trajectory pool run started in a new PowerShell window."
    return
}

Push-Location $ProjectRoot
try {
    & $VenvPython @ArgumentList
}
finally {
    Pop-Location
}
