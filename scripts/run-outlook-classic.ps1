[CmdletBinding()]
param(
    [switch]$Send,
    [switch]$Display,
    [switch]$Force,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$resultsDirectory = Join-Path $projectDirectory 'run-results'
$manifestPath = Join-Path $resultsDirectory 'email-manifest.json'
$lastEmailPath = Join-Path $resultsDirectory 'last-email.json'
$lastDraftPath = Join-Path $resultsDirectory 'last-draft.json'
. (Join-Path $PSScriptRoot 'runtime.ps1')
$node = Resolve-ProjectNode

if ($ValidateOnly -and ($Send -or $Display -or $Force)) {
    throw '-ValidateOnly no se puede combinar con -Send, -Display o -Force.'
}

& $node (Join-Path $projectDirectory 'src\email\prepare-access-email.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
if ([bool]$manifest.testMode) {
    $lastEmailPath = Join-Path $resultsDirectory 'last-test-email.json'
    $lastDraftPath = Join-Path $resultsDirectory 'last-test-draft.json'
}

function Test-SameEmailAddresses {
    param($Left, $Right)
    $leftValues = @($Left | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object)
    $rightValues = @($Right | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object)
    return (($leftValues -join ';') -eq ($rightValues -join ';'))
}

function Test-OrderedRequestIds {
    param($Left, $Right)
    if ($null -eq $Left -or $null -eq $Right) { return $false }
    $leftValues = @($Left | ForEach-Object { [string]$_ })
    $rightValues = @($Right | ForEach-Object { [string]$_ })
    return (($leftValues -join ',') -ceq ($rightValues -join ','))
}

function Get-RequestIdsFingerprint {
    param($Values)
    $canonical = (@($Values | ForEach-Object { [string]$_ } | Sort-Object) -join "`n")
    $bytes = [Text.Encoding]::UTF8.GetBytes($canonical)
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $hash.Dispose()
    }
}

function Test-MailMatchesManifest {
    param(
        $Item,
        [string]$ExpectedSubject,
        $RequestIds,
        [DateTime]$CreatedAfter
    )
    try {
        if ([int]$Item.Class -ne 43) { return $false }
        if ([DateTime]$Item.CreationTime -lt $CreatedAfter) { return $false }
        if ([string]$Item.Subject -ne $ExpectedSubject) { return $false }
        $body = [string]$Item.HTMLBody
        foreach ($requestId in @($RequestIds)) {
            if (-not $body.Contains([string]$requestId)) { return $false }
        }
        return $true
    }
    catch {
        return $false
    }
}

function Test-FolderContainsMatchingMail {
    param($Folder, $ExpectedSubject, $RequestIds, [DateTime]$CreatedAfter)
    $items = $null
    try {
        $items = $Folder.Items
        [void]$items.Sort('[CreationTime]', $true)
        $limit = [Math]::Min(100, [int]$items.Count)
        for ($index = 1; $index -le $limit; $index++) {
            $item = $null
            try {
                $item = $items.Item($index)
                if (Test-MailMatchesManifest $item $ExpectedSubject $RequestIds $CreatedAfter) {
                    return $true
                }
            }
            finally {
                if ($item) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
            }
        }
        return $false
    }
    finally {
        if ($items) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($items) }
    }
}

function Move-MatchingMailToDrafts {
    param($OutboxFolder, $DraftsFolder, $ExpectedSubject, $RequestIds, [DateTime]$CreatedAfter)
    $items = $null
    try {
        $items = $OutboxFolder.Items
        [void]$items.Sort('[CreationTime]', $true)
        $limit = [Math]::Min(100, [int]$items.Count)
        for ($index = 1; $index -le $limit; $index++) {
            $item = $null
            $movedItem = $null
            try {
                $item = $items.Item($index)
                if (Test-MailMatchesManifest $item $ExpectedSubject $RequestIds $CreatedAfter) {
                    $movedItem = $item.Move($DraftsFolder)
                    return $true
                }
            }
            finally {
                if ($movedItem) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($movedItem) }
                if ($item) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
            }
        }
        return $false
    }
    finally {
        if ($items) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($items) }
    }
}

function Move-StaleSubjectMailToDrafts {
    param($OutboxFolder, $DraftsFolder, [string]$ExpectedSubject)
    $items = $null
    $movedCount = 0
    try {
        $items = $OutboxFolder.Items
        for ($index = [int]$items.Count; $index -ge 1; $index--) {
            $item = $null
            $movedItem = $null
            try {
                $item = $items.Item($index)
                if ([int]$item.Class -ne 43) { continue }
                if ([string]$item.Subject -ne $ExpectedSubject) { continue }
                $movedItem = $item.Move($DraftsFolder)
                $movedCount += 1
            }
            finally {
                if ($movedItem) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($movedItem) }
                if ($item) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
            }
        }
        return $movedCount
    }
    finally {
        if ($items) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($items) }
    }
}

$htmlBytes = [IO.File]::ReadAllBytes([string]$manifest.htmlPath)
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
    $calculatedContentHash = [BitConverter]::ToString(
        $sha256.ComputeHash($htmlBytes)
    ).Replace('-', '').ToLowerInvariant()
} finally {
    $sha256.Dispose()
}
if ($calculatedContentHash -cne [string]$manifest.contentHash) {
    throw "El cuerpo del correo cambió después de validarse. Esperado: $($manifest.contentHash); observado: $calculatedContentHash. No se enviará."
}
$strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
try {
    $htmlBody = $strictUtf8.GetString($htmlBytes)
} catch {
    throw 'El cuerpo del correo no contiene UTF-8 válido. No se enviará.'
}
if ($htmlBody.Contains('{{REQUEST_IDS}}')) {
    throw 'El marcador REQUEST_IDS no fue reemplazado. No se enviará.'
}
foreach ($requestId in @($manifest.requestIds)) {
    if (-not $htmlBody.Contains([string]$requestId)) {
        throw "El cuerpo del correo no contiene el Request ID validado $requestId. No se enviará."
    }
}
if ([bool]$manifest.testMode) {
    $expectedTestIds = @(
        '137288', '137287', '137286', '137284', '137283', '137282', '137281',
        '137280', '137278', '137276', '137275', '137274', '137273', '137271'
    )
    if (-not (Test-OrderedRequestIds $manifest.requestIds $expectedTestIds)) {
        throw 'El correo de prueba no contiene la lista fija autorizada de Request ID. No se enviará.'
    }
}

if ($ValidateOnly) {
    Write-Host 'Correo validado correctamente. No se abrió Outlook y no se envió ningún mensaje.'
    return
}

if ($Send -and -not $Force -and (Test-Path -LiteralPath $lastEmailPath)) {
    $lastEmail = Get-Content -Raw -Encoding UTF8 -LiteralPath $lastEmailPath | ConvertFrom-Json
    $legacyRequestIds = @($lastEmail.requestIds)
    if (-not $lastEmail.requestIdsFingerprint -and $legacyRequestIds.Count -gt 0) {
        $lastEmail | Add-Member -NotePropertyName requestIdCount -NotePropertyValue $legacyRequestIds.Count -Force
        $lastEmail | Add-Member -NotePropertyName requestIdsFingerprint -NotePropertyValue (Get-RequestIdsFingerprint $legacyRequestIds) -Force
        $lastEmail.PSObject.Properties.Remove('requestIds')
        $lastEmail | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $lastEmailPath -Encoding UTF8
    }
    $lastEmailRecipients = if ($lastEmail.toRecipients) { @($lastEmail.toRecipients) } elseif ($lastEmail.recipient) { @($lastEmail.recipient) } else { @() }
    $sameRecipients = Test-SameEmailAddresses $lastEmailRecipients $manifest.toRecipients
    $sameCc = Test-SameEmailAddresses $lastEmail.ccRecipients $manifest.ccRecipients
    $sameSubject = ([string]$lastEmail.subject -eq [string]$manifest.subject)
    $hasRecordedContentHash = $lastEmail.PSObject.Properties.Name -contains 'contentHash'
    $sameContent = (-not $hasRecordedContentHash) -or ([string]$lastEmail.contentHash -eq [string]$manifest.contentHash)
    $sameRequestIds = $lastEmail.requestIdsFingerprint -and
        ([string]$lastEmail.requestIdsFingerprint -eq (Get-RequestIdsFingerprint $manifest.requestIds))
    if ($sameRecipients -and $sameCc -and $sameSubject -and $sameContent -and $sameRequestIds) {
        throw 'Este mismo conjunto de Request ID ya fue enviado. Use -Force solo si el reenvío es intencional.'
    }
}

$outlook = $null
$namespace = $null
$mail = $null
$account = $null
$deliveryStore = $null
$sentFolder = $null
$outboxFolder = $null
$draftsFolder = $null
try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace('MAPI')
    $matchingAccounts = @($namespace.Accounts | Where-Object {
        $_.SmtpAddress -and $_.SmtpAddress.Equals([string]$manifest.sender, [StringComparison]::OrdinalIgnoreCase)
    })
    if ($matchingAccounts.Count -ne 1) {
        throw "Se esperaba una cuenta Outlook para $($manifest.sender); se encontraron $($matchingAccounts.Count)."
    }
    $account = $matchingAccounts[0]
    $deliveryStore = $account.DeliveryStore
    $sentFolder = $deliveryStore.GetDefaultFolder(5)
    $outboxFolder = $deliveryStore.GetDefaultFolder(4)
    $draftsFolder = $deliveryStore.GetDefaultFolder(16)

    $staleOutboxCount = Move-StaleSubjectMailToDrafts `
        $outboxFolder $draftsFolder ([string]$manifest.subject)
    if ($staleOutboxCount -gt 0) {
        Write-Warning "$staleOutboxCount correo(s) PAM pendiente(s) de una ejecución anterior se movieron de Bandeja de salida a Borradores antes de preparar el mensaje actual."
    }

    # Cada ejecución crea un mensaje nuevo. Así un borrador anterior nunca puede
    # conservar un cuerpo con Request ID obsoletos.
    $reusedDraft = $false
    $mail = $outlook.CreateItem(0)
    $mail.SendUsingAccount = $account

    $mail.To = (@($manifest.toRecipients) -join ';')
    $mail.CC = (@($manifest.ccRecipients) -join ';')
    $mail.Subject = [string]$manifest.subject
    foreach ($inlineImage in @($manifest.inlineImages)) {
        $attachment = $null
        $propertyAccessor = $null
        try {
            $attachment = $mail.Attachments.Add([string]$inlineImage.path)
            $propertyAccessor = $attachment.PropertyAccessor
            $propertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', [string]$inlineImage.contentId)
            $propertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x370E001F', [string]$inlineImage.mimeType)
            # Content-ID y MIME son suficientes para que el HTML haga referencia
            # a la imagen. Algunas versiones o políticas de Outlook bloquean las
            # propiedades MAPI opcionales para ocultar el adjunto; no se intentan
            # establecer porque no deben impedir el envío del correo.
        } finally {
            if ($propertyAccessor) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($propertyAccessor) }
            if ($attachment) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($attachment) }
        }
    }
    # La firma, si se desea, forma parte del contenido configurado desde la web.
    # No se inicializa el Inspector ni se concatena la firma automática de Outlook.
    $mail.HTMLBody = $htmlBody
    $composedHtml = [string]$mail.HTMLBody
    foreach ($requestId in @($manifest.requestIds)) {
        if (-not $composedHtml.Contains([string]$requestId)) {
            throw "Outlook eliminó el Request ID $requestId al preparar el mensaje. No se enviará."
        }
    }

    if ($Send) {
        $sendRequestedAt = [DateTime]::Now
        $mail.Send()

        $createdAfter = $sendRequestedAt.AddMinutes(-2)
        $deliveryDeadline = [DateTime]::UtcNow.AddSeconds(60)
        $deliveryConfirmed = $false
        do {
            if (Test-FolderContainsMatchingMail $sentFolder ([string]$manifest.subject) $manifest.requestIds $createdAfter) {
                $deliveryConfirmed = $true
                break
            }
            Start-Sleep -Milliseconds 1000
        } while ([DateTime]::UtcNow -lt $deliveryDeadline)

        if (-not $deliveryConfirmed) {
            $movedToDrafts = Move-MatchingMailToDrafts `
                $outboxFolder $draftsFolder ([string]$manifest.subject) $manifest.requestIds $createdAfter
            if ($movedToDrafts) {
                throw 'Outlook no confirmó el envío dentro de 60 segundos. El mensaje permanecía en Bandeja de salida y se movió a Borradores para evitar un envío tardío.'
            }
            throw 'Outlook no confirmó que el mensaje llegara a Enviados dentro de 60 segundos. Los Request ID no se marcaron como enviados.'
        }

        $audit = [ordered]@{
            acceptedAt = [DateTimeOffset]::UtcNow.ToString('o')
            confirmedSent = $true
            transport = 'OutlookClassicCOM'
            sender = [string]$manifest.sender
            toRecipients = @($manifest.toRecipients)
            ccRecipients = @($manifest.ccRecipients)
            subject = [string]$manifest.subject
            contentHash = [string]$manifest.contentHash
            requestDate = [string]$manifest.requestDate
            startTime = [string]$manifest.startTime
            requestIdCount = @($manifest.requestIds).Count
            requestIdsFingerprint = Get-RequestIdsFingerprint $manifest.requestIds
            testMode = [bool]$manifest.testMode
            reusedDraft = $reusedDraft
        }
        $audit | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $lastEmailPath -Encoding UTF8
        if (Test-Path -LiteralPath $lastDraftPath) { Remove-Item -LiteralPath $lastDraftPath -Force }
        & $node (Join-Path $projectDirectory 'src\requests\request-result-store.mjs') consume-email
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'El correo fue aceptado por Outlook, pero no se pudieron vaciar todos los Request ID temporales. La próxima ejecución volverá a invalidarlos antes de comenzar.'
        }
        Write-Host 'Correo enviado mediante Outlook clásico.'
    } else {
        $mail.Save()
        $draft = [ordered]@{
            createdAt = [DateTimeOffset]::UtcNow.ToString('o')
            transport = 'OutlookClassicCOM'
            entryId = [string]$mail.EntryID
            sender = [string]$manifest.sender
            toRecipients = @($manifest.toRecipients)
            ccRecipients = @($manifest.ccRecipients)
            subject = [string]$manifest.subject
            contentHash = [string]$manifest.contentHash
            requestIds = @($manifest.requestIds)
        }
        $draft | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $lastDraftPath -Encoding UTF8
        Write-Host 'Borrador creado en Outlook clásico. No se envió ningún correo.'
        if ($Display) { $mail.Display($false) }
    }
} finally {
    if ($draftsFolder) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($draftsFolder) }
    if ($outboxFolder) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outboxFolder) }
    if ($sentFolder) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sentFolder) }
    if ($deliveryStore) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($deliveryStore) }
    if ($account) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($account) }
    if ($mail) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($mail) }
    if ($namespace) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($namespace) }
    if ($outlook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) }
}
