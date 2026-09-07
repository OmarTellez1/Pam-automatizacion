$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationTypes
$sourcePath = Join-Path $PSScriptRoot 'open-manual-session.ps1'
$parseErrors = $null
$tokens = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'El lanzador contiene errores de sintaxis.' }
$functionAst = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Complete-TotpAuthentication'
}, $true)
Invoke-Expression $functionAst.Extent.Text

# Exercise the launcher orchestration without opening Chrome or loading secrets.
function Wait-Control { param($WindowHandle, $Name, $ControlType) return $Name }
function Get-CurrentTotp {
    param([switch]$NextWindow)
    $script:windows.Add($NextWindow.IsPresent)
    if ($script:clockFailure) { throw 'No se pudo consultar la hora de PAM.' }
    return '123456'
}
function Set-ControlValue { param($Control, $Value) }
function Test-TotpRejected { param($WindowHandle) return ($script:submitted -gt 0) }
function Invoke-Control { param($Control) $script:submitted += 1 }
function Wait-AuthenticatedAddress {
    param($WindowHandle, [switch]$IgnorePreviousRejection)
    if ($IgnorePreviousRejection.IsPresent -ne ($script:submitted -gt 1)) { throw 'Rechazo anterior mal identificado.' }
    $outcome = $script:outcomes[$script:submitted - 1]
    if ($outcome -eq 'accepted') { return 'https://10.30.17.117/webconsole/ps/portal' }
    if ($outcome -eq 'timeout') { throw 'El portal no confirmó el inicio de sesión.' }
    $rejection = [InvalidOperationException]::new('Rechazo simulado')
    $rejection.Data['TotpRejected'] = $true
    throw $rejection
}

foreach ($scenario in @(
    @{ Outcomes = @('accepted'); Expected = 1; Error = ''; ClockFailure = $false },
    @{ Outcomes = @('rejected', 'accepted'); Expected = 2; Error = ''; ClockFailure = $false },
    @{ Outcomes = @('rejected', 'rejected'); Expected = 2; Error = 'dos códigos'; ClockFailure = $false },
    @{ Outcomes = @('timeout'); Expected = 1; Error = 'no confirmó'; ClockFailure = $false },
    @{ Outcomes = @(); Expected = 0; Error = 'hora de PAM'; ClockFailure = $true }
)) {
    $script:outcomes = $scenario.Outcomes
    $script:clockFailure = $scenario.ClockFailure
    $script:submitted = 0
    $script:windows = [Collections.Generic.List[bool]]::new()
    $caught = ''
    try { $null = Complete-TotpAuthentication -WindowHandle ([IntPtr]1) }
    catch { $caught = $_.Exception.Message }
    if ($script:submitted -ne $scenario.Expected) { throw 'Cantidad de envíos incorrecta.' }
    if ($scenario.Error) {
        if ($caught -notmatch $scenario.Error) { throw "Error inesperado: $caught" }
    } elseif ($caught) { throw $caught }
    if ($script:windows[0]) { throw 'El primer intento no debe forzar otra ventana.' }
    if ($scenario.Expected -eq 2 -and -not $script:windows[1]) { throw 'El reintento debe esperar un código nuevo.' }
    Write-Host "PASS: $($scenario.Outcomes -join '/'); envíos=$script:submitted; fallo de reloj=$script:clockFailure"
}
