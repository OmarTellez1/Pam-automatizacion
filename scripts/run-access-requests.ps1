param(
    [string]$Date,
    [string]$StartTime,
    [ValidateSet('S', 'N')]
    [string]$Email,
    [switch]$Execute,
    [switch]$TestRun,
    [switch]$Headed
)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$nodeExecutable = Resolve-ProjectNode
$envPath = Join-Path $projectDirectory '.env'
$entryPoint = Join-Path $projectDirectory 'src\request-access.mjs'
$logsDirectory = Join-Path $projectDirectory 'logs'
$executionMode = if ($Execute) { 'real' } elseif ($TestRun) { 'test' } else { 'preview' }
$logTimestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
$logPath = Join-Path $logsDirectory "powershell-$executionMode-$logTimestamp.log"
$transcriptStarted = $false

[void](New-Item -ItemType Directory -Path $logsDirectory -Force)
try {
    Start-Transcript -LiteralPath $logPath -Force | Out-Null
    $transcriptStarted = $true
    Write-Host "Log de ejecución: $logPath"
}
catch {
    Write-Warning "No se pudo iniciar el log de ejecución: $($_.Exception.Message)"
}

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Falta $envPath. Configure las credenciales desde INICIAR_INTERFAZ.cmd."
}
if ($Execute -and $TestRun) {
    throw 'Los modos real y de prueba no pueden ejecutarse al mismo tiempo.'
}

try {
    $env:BI_HEADED = $Headed.IsPresent.ToString().ToLowerInvariant()

    $arguments = @($entryPoint)
    if ($Date) { $arguments += @('--date', $Date) }
    if ($StartTime) { $arguments += @('--time', $StartTime) }
    if ($Email) { $arguments += @('--email', $Email) }
    if ($Execute) { $arguments += '--execute' }
    if ($TestRun) { $arguments += '--test-run' }
    if ($Headed) { $arguments += '--headed' }

    & $nodeExecutable @arguments
    $automationExitCode = $LASTEXITCODE
    if ($automationExitCode -ne 0) { exit $automationExitCode }

    if ($Execute -or $TestRun) {
        $resultPath = Join-Path $projectDirectory 'run-results\last-run.json'
        if (-not (Test-Path -LiteralPath $resultPath)) {
            throw "No se encontró el resultado esperado: $resultPath"
        }
        $result = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
        $requestIds = @($result.requestIds)
        if ($TestRun) {
            $simulatedIds = @('137288', '137287', '137286', '137284', '137283', '137282', '137281', '137280', '137278', '137276', '137275', '137274', '137273', '137271')
            $favoriteCount = [int]$result.favoriteCount
            if (-not [bool]$result.testMode -or [int]$result.submitted -ne 0 -or $favoriteCount -lt 1 -or [int]$result.validatedFavoriteCount -ne $favoriteCount) {
                throw 'El resultado no corresponde a una prueba segura.'
            }
            if (($requestIds -join ',') -ne ($simulatedIds -join ',')) {
                throw 'Los Request ID de prueba no coinciden con la lista simulada autorizada.'
            }
        }
        else {
            $favoriteCount = [int]$result.favoriteCount
            if ($favoriteCount -lt 1) {
                throw 'El resultado no contiene una cantidad válida de cuentas favoritas.'
            }
            if ($requestIds.Count -ne $favoriteCount) {
                throw "Se esperaban $favoriteCount Request ID; se encontraron $($requestIds.Count)."
            }
        }

        if ([bool]$result.sendEmail) {
            if ($TestRun) {
                & (Join-Path $PSScriptRoot 'run-outlook-classic.ps1') -Send -Force
            }
            else {
                & (Join-Path $PSScriptRoot 'run-outlook-classic.ps1') -Send
            }
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        else {
            Write-Host 'Los Request ID están disponibles en la interfaz web local.'
        }
    }
    else {
        Write-Host 'Vista previa: se validó un formulario sin publicar resultados.'
    }
    exit 0
}
finally {
    Remove-Item Env:BI_HEADED -ErrorAction SilentlyContinue
    if ($transcriptStarted) { Stop-Transcript | Out-Null }
}
