param(
    [switch]$Headed,
    [switch]$KeepOpen
)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$nodeExecutable = Resolve-ProjectNode
$envPath = Join-Path $projectDirectory '.env'
$entryPoint = Join-Path $projectDirectory 'src\login.mjs'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Falta $envPath. Configure las credenciales desde INICIAR_INTERFAZ.cmd."
}

try {
    $env:BI_HEADED = $Headed.IsPresent.ToString().ToLowerInvariant()
    $env:BI_KEEP_OPEN = $KeepOpen.IsPresent.ToString().ToLowerInvariant()

    & $nodeExecutable $entryPoint
    exit $LASTEXITCODE
}
finally {
    Remove-Item Env:BI_HEADED -ErrorAction SilentlyContinue
    Remove-Item Env:BI_KEEP_OPEN -ErrorAction SilentlyContinue
}
