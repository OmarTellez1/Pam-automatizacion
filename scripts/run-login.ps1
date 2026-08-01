param(
    [switch]$Headed,
    [switch]$KeepOpen
)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$nodeExecutable = Resolve-ProjectNode
$passwordPath = Join-Path $projectDirectory 'state\password.dpapi'
$totpPath = Join-Path $projectDirectory 'state\totp.dpapi'
$entryPoint = Join-Path $projectDirectory 'src\login.mjs'

foreach ($requiredPath in @($passwordPath, $totpPath, (Join-Path $projectDirectory 'state\config.json'))) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Falta $requiredPath. Ejecute scripts\setup-secrets.ps1 primero."
    }
}

function Convert-SecureStringToPlainText([Security.SecureString]$secureValue) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

$password = (Get-Content -Raw -LiteralPath $passwordPath).Trim() | ConvertTo-SecureString
$totpSecret = (Get-Content -Raw -LiteralPath $totpPath).Trim() | ConvertTo-SecureString

try {
    $env:BI_PASSWORD = Convert-SecureStringToPlainText $password
    $env:BI_TOTP_SECRET = Convert-SecureStringToPlainText $totpSecret
    $env:BI_HEADED = $Headed.IsPresent.ToString().ToLowerInvariant()
    $env:BI_KEEP_OPEN = $KeepOpen.IsPresent.ToString().ToLowerInvariant()

    & $nodeExecutable $entryPoint
    exit $LASTEXITCODE
}
finally {
    Remove-Item Env:BI_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:BI_TOTP_SECRET -ErrorAction SilentlyContinue
    Remove-Item Env:BI_HEADED -ErrorAction SilentlyContinue
    Remove-Item Env:BI_KEEP_OPEN -ErrorAction SilentlyContinue
}
