param(
    [int]$Games = 1000,
    [int]$BatchSize = 50,
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

if ($Games -lt 1) {
    throw "Games must be at least 1."
}

if ($BatchSize -lt 1) {
    throw "BatchSize must be at least 1."
}

$BackendM4 = "m4-mlx|openai|http://192.168.1.107:8080|mlx-community/gemma-4-e4b-it-8bit|1.0"
$BackendLocal = "win-ollama|ollama|http://127.0.0.1:11434|gemma4:latest|1.0"

$BatchCount = [Math]::Ceiling($Games / $BatchSize)

function New-BatchArgumentList {
    param(
        [int]$BatchGames,
        [int]$BatchSeed
    )

    return @(
        "-m",
        "factory.run_trajectory_pool",
        "--games", $BatchGames,
        "--seed", $BatchSeed,
        "--winning-score", $WinningScore,
        "--timeout", $Timeout,
        "--retries", $Retries,
        "--backend", $BackendM4,
        "--backend", $BackendLocal
    )
}

function Format-CommandPreview {
    param(
        [string[]]$ArgumentList
    )

    return (@(
        $VenvPython
        $ArgumentList
    ) -join " ")
}

Write-Host "Project root: $ProjectRoot"
Write-Host "Batching: $Games total games in $BatchCount batch(es) of up to $BatchSize."
Write-Host "First batch command:"
Write-Host (Format-CommandPreview -ArgumentList (New-BatchArgumentList -BatchGames ([Math]::Min($Games, $BatchSize)) -BatchSeed $Seed))

if ($PreviewOnly) {
    Write-Host "Preview only; no run was started."
    return
}

if ($Detached) {
    $DetachedArgs = @(
        "-NoExit",
        "-File", (Join-Path $PSScriptRoot "start_trajectory_pool.ps1"),
        "-Games", $Games,
        "-BatchSize", $BatchSize,
        "-Seed", $Seed,
        "-WinningScore", $WinningScore,
        "-Timeout", $Timeout,
        "-Retries", $Retries
    )
    Start-Process powershell -ArgumentList $DetachedArgs | Out-Null
    Write-Host "Detached chunked trajectory pool run started in a new PowerShell window."
    return
}

Push-Location $ProjectRoot
try {
    $RemainingGames = $Games
    $BatchIndex = 0

    while ($RemainingGames -gt 0) {
        $BatchIndex += 1
        $BatchGames = [Math]::Min($RemainingGames, $BatchSize)
        $BatchSeed = $Seed + ($BatchIndex - 1)
        $ArgumentList = New-BatchArgumentList -BatchGames $BatchGames -BatchSeed $BatchSeed

        Write-Host ""
        Write-Host "Starting batch $BatchIndex/$BatchCount ($BatchGames games, seed=$BatchSeed)."
        & $VenvPython @ArgumentList

        if ($LASTEXITCODE -ne 0) {
            throw "Trajectory pool batch $BatchIndex failed with exit code $LASTEXITCODE."
        }

        $RemainingGames -= $BatchGames
    }
}
finally {
    Pop-Location
}
