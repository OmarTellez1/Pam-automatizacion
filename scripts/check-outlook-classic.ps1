[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Sender,
    [switch]$SendTest
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$outlook = $null
$namespace = $null
$account = $null
$mail = $null

try {
    try {
        $outlook = New-Object -ComObject Outlook.Application
        $namespace = $outlook.GetNamespace('MAPI')
    } catch {
        throw 'No se pudo abrir Outlook clásico. Confirme que está instalado y que el perfil del usuario ya fue configurado.'
    }

    $matchingAccounts = @($namespace.Accounts | Where-Object {
        $_.SmtpAddress -and $_.SmtpAddress.Equals($Sender, [StringComparison]::OrdinalIgnoreCase)
    })
    if ($matchingAccounts.Count -eq 0) {
        throw "Outlook clásico no tiene iniciada una cuenta cuyo correo sea $Sender."
    }
    if ($matchingAccounts.Count -gt 1) {
        throw "Outlook clásico contiene más de una cuenta con el correo $Sender."
    }
    $account = $matchingAccounts[0]

    $mail = $outlook.CreateItem(0)
    $mail.SendUsingAccount = $account

    if ($SendTest) {
        $mail.To = $Sender
        $mail.Subject = 'Prueba de envío - Accesos PAM'
        $mail.HTMLBody = @'
<p>Este es un correo de prueba de Accesos PAM.</p>
<p>Outlook clásico pudo crear y enviar un mensaje utilizando la cuenta configurada.</p>
'@
        $mail.Send()
        Write-Output "Outlook aceptó el correo de prueba enviado a $Sender."
    } else {
        $mail.Close(1)
        Write-Output "Outlook clásico y la cuenta $Sender se verificaron correctamente. No se envió ningún correo."
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if ($mail) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($mail) }
    if ($account) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($account) }
    if ($namespace) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($namespace) }
    if ($outlook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) }
}
