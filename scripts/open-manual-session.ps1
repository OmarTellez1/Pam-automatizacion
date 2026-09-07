[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$nodeExecutable = Resolve-ProjectNode
$envPath = Join-Path $projectDirectory '.env'
$totpEntryPoint = Join-Path $projectDirectory 'src\auth\current-totp.mjs'
$loginUrl = 'https://10.30.17.117/webconsole/dashboard'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class PamNativeKeyboard
{
    private const byte VirtualKeyControl = 0x11;
    private const uint KeyUp = 0x0002;

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    public static void SendControlKey(byte virtualKey)
    {
        keybd_event(VirtualKeyControl, 0, 0, UIntPtr.Zero);
        keybd_event(virtualKey, 0, 0, UIntPtr.Zero);
        keybd_event(virtualKey, 0, KeyUp, UIntPtr.Zero);
        keybd_event(VirtualKeyControl, 0, KeyUp, UIntPtr.Zero);
    }
}
'@

function Resolve-ChromeExecutable {
    $candidatePaths = [Collections.Generic.List[string]]::new()
    foreach ($registryPath in @(
        'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
        'Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
        'Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
    )) {
        try {
            $candidate = (Get-Item -LiteralPath $registryPath -ErrorAction Stop).GetValue('')
            if ($candidate) { $candidatePaths.Add([string]$candidate) }
        }
        catch {}
    }
    if ($env:LOCALAPPDATA) {
        $candidatePaths.Add((Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
    }
    if ($env:ProgramFiles) {
        $candidatePaths.Add((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'))
    }
    $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($programFilesX86) {
        $candidatePaths.Add((Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe'))
    }
    foreach ($command in @(Get-Command chrome.exe -All -ErrorAction SilentlyContinue)) {
        $candidatePaths.Add($command.Source)
    }
    foreach ($candidatePath in @($candidatePaths | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidatePath).Path
        }
    }
    throw 'No se encontró Google Chrome instalado.'
}

function Get-ChromeProfileName {
    if (-not $env:LOCALAPPDATA) { return 'Default' }
    $localStatePath = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Local State'
    if (-not (Test-Path -LiteralPath $localStatePath -PathType Leaf)) { return 'Default' }
    try {
        $localState = Get-Content -LiteralPath $localStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $lastUsed = [string]$localState.profile.last_used
        if ($lastUsed) { return $lastUsed }
    }
    catch {}
    return 'Default'
}

function Read-ProjectEnvironment {
    $values = @{}
    $lineNumber = 0
    foreach ($line in Get-Content -LiteralPath $envPath -Encoding UTF8) {
        $lineNumber += 1
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        if ($line -notmatch '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            throw "Línea inválida en .env: $lineNumber."
        }
        $key = $Matches[1]
        $rawValue = $Matches[2].Trim()
        if ($rawValue.StartsWith('"')) {
            $values[$key] = $rawValue | ConvertFrom-Json
        }
        elseif ($rawValue.StartsWith("'")) {
            if (-not $rawValue.EndsWith("'")) {
                throw "Valor entre comillas inválido en .env, línea $lineNumber."
            }
            $values[$key] = $rawValue.Substring(1, $rawValue.Length - 2)
        }
        else {
            $values[$key] = ($rawValue -replace '\s+#.*$', '').Trim()
        }
    }
    return $values
}

function Get-ChromeWindows {
    $windowCondition = [Windows.Automation.PropertyCondition]::new(
        [Windows.Automation.AutomationElement]::ControlTypeProperty,
        [Windows.Automation.ControlType]::Window
    )
    $windows = [Windows.Automation.AutomationElement]::RootElement.FindAll(
        [Windows.Automation.TreeScope]::Children,
        $windowCondition
    )
    $results = [Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt $windows.Count; $index += 1) {
        $window = $windows.Item($index)
        try {
            $process = Get-Process -Id $window.Current.ProcessId -ErrorAction Stop
            if ($process.ProcessName -ne 'chrome') { continue }
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction Stop
            if ($processInfo.CommandLine -match '--user-data-dir') { continue }
            $results.Add([pscustomobject]@{
                Handle = [IntPtr]$window.Current.NativeWindowHandle
                Name = [string]$window.Current.Name
            })
        }
        catch {}
    }
    return $results
}

function Wait-NewChromeWindow([Collections.Generic.HashSet[int]]$PreviousHandles, [int]$TimeoutSeconds = 30) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        foreach ($window in Get-ChromeWindows) {
            if (-not $PreviousHandles.Contains($window.Handle.ToInt32())) {
                return $window.Handle
            }
        }
        Start-Sleep -Milliseconds 200
    }
    throw 'Google Chrome no abrió una ventana nueva para PAM.'
}

function Find-Control([IntPtr]$WindowHandle, [string]$Name, [Windows.Automation.ControlType]$ControlType) {
    $window = [Windows.Automation.AutomationElement]::FromHandle($WindowHandle)
    if (-not $window) { return $null }
    $nameCondition = [Windows.Automation.PropertyCondition]::new(
        [Windows.Automation.AutomationElement]::NameProperty,
        $Name
    )
    $typeCondition = [Windows.Automation.PropertyCondition]::new(
        [Windows.Automation.AutomationElement]::ControlTypeProperty,
        $ControlType
    )
    $condition = [Windows.Automation.AndCondition]::new($nameCondition, $typeCondition)
    return $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
}

function Find-AddressBar([IntPtr]$WindowHandle) {
    foreach ($name in @(
        'Address and search bar',
        'Barra de direcciones y de búsqueda',
        'Barra de direcciones y búsqueda'
    )) {
        $control = Find-Control -WindowHandle $WindowHandle -Name $name -ControlType ([Windows.Automation.ControlType]::Edit)
        if ($control) { return $control }
    }

    $window = [Windows.Automation.AutomationElement]::FromHandle($WindowHandle)
    $editCondition = [Windows.Automation.PropertyCondition]::new(
        [Windows.Automation.AutomationElement]::ControlTypeProperty,
        [Windows.Automation.ControlType]::Edit
    )
    $edits = $window.FindAll([Windows.Automation.TreeScope]::Descendants, $editCondition)
    for ($index = 0; $index -lt $edits.Count; $index += 1) {
        $candidate = $edits.Item($index)
        if ($candidate.Current.BoundingRectangle.Top -lt 200) { return $candidate }
    }
    return $null
}

function Wait-AddressBar([IntPtr]$WindowHandle, [int]$TimeoutSeconds = 30) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $addressBar = Find-AddressBar -WindowHandle $WindowHandle
            if ($addressBar -and $addressBar.Current.IsEnabled) { return $addressBar }
        }
        catch {}
        Start-Sleep -Milliseconds 200
    }
    throw 'No apareció la barra de direcciones de Google Chrome.'
}

function Wait-Control(
    [IntPtr]$WindowHandle,
    [string]$Name,
    [Windows.Automation.ControlType]$ControlType,
    [int]$TimeoutSeconds = 30
) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $control = Find-Control -WindowHandle $WindowHandle -Name $Name -ControlType $ControlType
            if ($control -and $control.Current.IsEnabled) { return $control }
        }
        catch {}
        Start-Sleep -Milliseconds 200
    }
    throw "No apareció el control '$Name' en la página de PAM."
}

function Set-ControlValue([Windows.Automation.AutomationElement]$Control, [string]$Value) {
    $pattern = $Control.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
    $pattern.SetValue($Value)
}

function Invoke-Control([Windows.Automation.AutomationElement]$Control) {
    $pattern = $Control.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
}

function Get-WindowAddress([IntPtr]$WindowHandle) {
    try {
        $addressBar = Find-AddressBar -WindowHandle $WindowHandle
        if (-not $addressBar) { return '' }
        $pattern = $addressBar.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
        return [string]$pattern.Current.Value
    }
    catch {
        return ''
    }
}

function Find-AuthenticatedPamWindow {
    foreach ($window in Get-ChromeWindows) {
        $address = Get-WindowAddress -WindowHandle $window.Handle
        if ($address.StartsWith('https://10.30.17.117/') -and -not $address.Contains('/login')) {
            return [pscustomobject]@{ Handle = $window.Handle; Address = $address }
        }
    }
    return $null
}

function Get-CurrentTotp([switch]$NextWindow) {
    $totpArguments = @($totpEntryPoint)
    if ($NextWindow) { $totpArguments += '--next-window' }
    $totp = [string](& $nodeExecutable @totpArguments)
    if ($LASTEXITCODE -ne 0 -or $totp -notmatch '^\d{6}$') {
        throw 'No se pudo generar el código temporal de Microsoft Authenticator.'
    }
    return $totp
}

function Test-TotpRejected([IntPtr]$WindowHandle) {
    $window = [Windows.Automation.AutomationElement]::FromHandle($WindowHandle)
    if (-not $window) { return $false }
    $condition = [Windows.Automation.PropertyCondition]::new(
        [Windows.Automation.AutomationElement]::NameProperty,
        'The provided token was rejected. Please try again or contact your administrator if you cannot login.'
    )
    $message = $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
    return ($message -and -not $message.Current.IsOffscreen)
}

function Wait-AuthenticatedAddress([IntPtr]$WindowHandle, [int]$TimeoutSeconds = 40, [switch]$IgnorePreviousRejection) {
    $waitingForPreviousRejection = $IgnorePreviousRejection.IsPresent
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $address = Get-WindowAddress -WindowHandle $WindowHandle
            if ($address.StartsWith('https://10.30.17.117/') -and -not $address.Contains('/login')) {
                return $address
            }
        }
        catch {}
        $rejected = Test-TotpRejected -WindowHandle $WindowHandle
        if (-not $rejected) { $waitingForPreviousRejection = $false }
        if ($rejected -and -not $waitingForPreviousRejection) {
            $totpRejectionError = [InvalidOperationException]::new('El PAM rechazó el código de Microsoft Authenticator.')
            $totpRejectionError.Data['TotpRejected'] = $true
            throw $totpRejectionError
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'El portal no confirmó el inicio de sesión.'
}

function Complete-TotpAuthentication([IntPtr]$WindowHandle) {
    for ($attempt = 0; $attempt -lt 2; $attempt += 1) {
        $responseField = Wait-Control -WindowHandle $WindowHandle -Name 'Enter Response' -ControlType ([Windows.Automation.ControlType]::Edit)
        $submitButton = Wait-Control -WindowHandle $WindowHandle -Name 'Submit' -ControlType ([Windows.Automation.ControlType]::Button)
        $totp = Get-CurrentTotp -NextWindow:($attempt -eq 1)
        Set-ControlValue -Control $responseField -Value $totp
        $ignorePreviousRejection = Test-TotpRejected -WindowHandle $WindowHandle
        Invoke-Control -Control $submitButton
        $totp = $null
        try {
            return Wait-AuthenticatedAddress -WindowHandle $WindowHandle -IgnorePreviousRejection:$ignorePreviousRejection
        }
        catch {
            if (-not $_.Exception.Data['TotpRejected']) { throw }
            if ($attempt -eq 1) {
                throw 'El PAM rechazó dos códigos consecutivos de Microsoft Authenticator. Revise la clave Base32 configurada.'
            }
            Write-Host 'El PAM rechazó el código. Se esperará al siguiente intervalo del portal y se intentará una vez más.'
        }
    }
}

function Set-ChromeZoomTo67([IntPtr]$WindowHandle) {
    $addressBar = Wait-AddressBar -WindowHandle $WindowHandle
    $addressBar.SetFocus()
    Start-Sleep -Milliseconds 200

    [PamNativeKeyboard]::SendControlKey(0x30)
    Start-Sleep -Milliseconds 150
    for ($step = 0; $step -lt 4; $step += 1) {
        [PamNativeKeyboard]::SendControlKey(0x6D)
        Start-Sleep -Milliseconds 100
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    while ([DateTime]::UtcNow -lt $deadline) {
        $window = [Windows.Automation.AutomationElement]::FromHandle($WindowHandle)
        $buttonCondition = [Windows.Automation.PropertyCondition]::new(
            [Windows.Automation.AutomationElement]::ControlTypeProperty,
            [Windows.Automation.ControlType]::Button
        )
        $buttons = $window.FindAll([Windows.Automation.TreeScope]::Descendants, $buttonCondition)
        for ($index = 0; $index -lt $buttons.Count; $index += 1) {
            if ($buttons.Item($index).Current.Name -match '67%') {
                $documentCondition = [Windows.Automation.PropertyCondition]::new(
                    [Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [Windows.Automation.ControlType]::Document
                )
                $document = $window.FindFirst([Windows.Automation.TreeScope]::Descendants, $documentCondition)
                if ($document) { try { $document.SetFocus() } catch {} }
                return
            }
        }
        Start-Sleep -Milliseconds 150
    }
    throw 'Google Chrome no confirmó el zoom de la página al 67%.'
}

function Show-LoginError([string]$Message) {
    try {
        [void][Windows.Forms.MessageBox]::Show(
            $Message,
            'No se pudo abrir PAM',
            [Windows.Forms.MessageBoxButtons]::OK,
            [Windows.Forms.MessageBoxIcon]::Error
        )
    }
    catch {}
}

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    Show-LoginError "Falta $envPath. Configure primero las credenciales desde INICIAR_INTERFAZ.cmd."
    exit 1
}

try {
    $environment = Read-ProjectEnvironment
    $username = [string]$environment.BI_USERNAME
    $password = [string]$environment.BI_PASSWORD
    if (-not $username -or -not $password -or -not [string]$environment.BI_TOTP_SECRET) {
        throw 'Configure primero el usuario, la contraseña y la clave del Authenticator desde la interfaz.'
    }

    $existingSession = Find-AuthenticatedPamWindow
    if ($existingSession) {
        $windowHandle = $existingSession.Handle
        $authenticatedAddress = $existingSession.Address
    }
    else {
        $previousHandles = [Collections.Generic.HashSet[int]]::new()
        foreach ($window in Get-ChromeWindows) {
            [void]$previousHandles.Add($window.Handle.ToInt32())
        }

        $chromeExecutable = Resolve-ChromeExecutable
        $profileName = Get-ChromeProfileName
        $chromeArguments = @(
            "--profile-directory=`"$profileName`"",
            '--new-window',
            $loginUrl
        )
        [void](Start-Process -FilePath $chromeExecutable -ArgumentList $chromeArguments -PassThru)
        $windowHandle = Wait-NewChromeWindow -PreviousHandles $previousHandles

        $usernameField = Wait-Control -WindowHandle $windowHandle -Name 'Username' -ControlType ([Windows.Automation.ControlType]::Edit)
        $passwordField = Wait-Control -WindowHandle $windowHandle -Name 'Password' -ControlType ([Windows.Automation.ControlType]::Edit)
        Set-ControlValue -Control $usernameField -Value $username
        Set-ControlValue -Control $passwordField -Value $password
        $loginButton = Wait-Control -WindowHandle $windowHandle -Name 'Log In' -ControlType ([Windows.Automation.ControlType]::Button)
        Invoke-Control -Control $loginButton

        $authenticatedAddress = Complete-TotpAuthentication -WindowHandle $windowHandle
    }
    Set-ChromeZoomTo67 -WindowHandle $windowHandle
    Write-Host "Sesión manual de PAM abierta correctamente: $authenticatedAddress"
    Write-Host 'Se usó el perfil habitual de Google Chrome y se confirmó el zoom al 67%.'
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    Show-LoginError $_.Exception.Message
    exit 1
}
