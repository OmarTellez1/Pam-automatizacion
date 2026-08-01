param(
    [int]$Port = 4317,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$nodeExecutable = Resolve-ProjectNode
$entryPoint = Join-Path $projectDirectory 'src\local-server.mjs'
$arguments = @($entryPoint, '--port', $Port)
if ($NoOpen) { $arguments += '--no-open' }

& $nodeExecutable @arguments
exit $LASTEXITCODE
