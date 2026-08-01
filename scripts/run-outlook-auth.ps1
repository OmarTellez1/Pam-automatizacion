[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$node = Resolve-ProjectNode

& $node (Join-Path $projectDirectory 'src\authorize-outlook.mjs')
exit $LASTEXITCODE
