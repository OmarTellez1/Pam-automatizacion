[CmdletBinding()]
param(
    [switch]$Send,
    [switch]$AllowInteractive,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$node = Resolve-ProjectNode
$arguments = @((Join-Path $projectDirectory 'src\send-access-email.mjs'))
if ($Send) { $arguments += '--send' }
if ($AllowInteractive) { $arguments += '--allow-interactive' }
if ($Force) { $arguments += '--force' }

& $node @arguments
exit $LASTEXITCODE
