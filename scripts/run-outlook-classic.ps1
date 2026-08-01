[CmdletBinding()]
param(
    [switch]$Send,
    [switch]$Display,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$resultsDirectory = Join-Path $projectDirectory 'run-results'
$manifestPath = Join-Path $resultsDirectory 'email-manifest.json'
$lastEmailPath = Join-Path $resultsDirectory 'last-email.json'
$lastDraftPath = Join-Path $resultsDirectory 'last-draft.json'
. (Join-Path $PSScriptRoot 'runtime.ps1')
$node = Resolve-ProjectNode

& $node (Join-Path $projectDirectory 'src\prepare-access-email.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

function Test-SameRequestIds {
    param($Left, $Right)
    if ($null -eq $Left -or $null -eq $Right) { return $false }
    $leftValues = @($Left | ForEach-Object { [string]$_ } | Sort-Object)
    $rightValues = @($Right | ForEach-Object { [string]$_ } | Sort-Object)
    return (($leftValues -join ',') -eq ($rightValues -join ','))
}

function Test-SameEmailAddresses {
    param($Left, $Right)
    $leftValues = @($Left | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object)
    $rightValues = @($Right | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object)
    return (($leftValues -join ';') -eq ($rightValues -join ';'))
}

if ($Send -and -not $Force -and (Test-Path -LiteralPath $lastEmailPath)) {
    $lastEmail = Get-Content -Raw -LiteralPath $lastEmailPath | ConvertFrom-Json
    $lastEmailRecipients = if ($lastEmail.toRecipients) { @($lastEmail.toRecipients) } elseif ($lastEmail.recipient) { @($lastEmail.recipient) } else { @() }
    $sameRecipients = Test-SameEmailAddresses $lastEmailRecipients $manifest.toRecipients
    $sameCc = Test-SameEmailAddresses $lastEmail.ccRecipients $manifest.ccRecipients
    $sameSubject = ([string]$lastEmail.subject -eq [string]$manifest.subject)
    $hasRecordedContentHash = $lastEmail.PSObject.Properties.Name -contains 'contentHash'
    $sameContent = (-not $hasRecordedContentHash) -or ([string]$lastEmail.contentHash -eq [string]$manifest.contentHash)
    if ($sameRecipients -and $sameCc -and $sameSubject -and $sameContent -and (Test-SameRequestIds $lastEmail.requestIds $manifest.requestIds)) {
        throw 'Este mismo conjunto de 14 ID ya fue enviado. Use -Force solo si el reenvío es intencional.'
    }
}

$outlook = $null
$namespace = $null
$mail = $null
$account = $null
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

    $reusedDraft = $false
    if ($Send -and (Test-Path -LiteralPath $lastDraftPath)) {
        $lastDraft = Get-Content -Raw -LiteralPath $lastDraftPath | ConvertFrom-Json
        $sameDraftRecipients = Test-SameEmailAddresses $lastDraft.toRecipients $manifest.toRecipients
        $sameDraftCc = Test-SameEmailAddresses $lastDraft.ccRecipients $manifest.ccRecipients
        $sameDraftSubject = ([string]$lastDraft.subject -eq [string]$manifest.subject)
        $hasDraftContentHash = $lastDraft.PSObject.Properties.Name -contains 'contentHash'
        $sameDraftContent = $hasDraftContentHash -and ([string]$lastDraft.contentHash -eq [string]$manifest.contentHash)
        if ($sameDraftRecipients -and $sameDraftCc -and $sameDraftSubject -and $sameDraftContent -and (Test-SameRequestIds $lastDraft.requestIds $manifest.requestIds)) {
            try {
                $mail = $namespace.GetItemFromID([string]$lastDraft.entryId)
                if ($mail.Sent) {
                    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($mail)
                    $mail = $null
                } else {
                    $reusedDraft = $true
                }
            } catch {
                $mail = $null
            }
        }
    }

    if (-not $mail) { $mail = $outlook.CreateItem(0) }
    $mail.SendUsingAccount = $account
    $mail.To = (@($manifest.toRecipients) -join ';')
    $mail.CC = (@($manifest.ccRecipients) -join ';')
    $mail.Subject = [string]$manifest.subject
    if (-not $reusedDraft) {
        foreach ($inlineImage in @($manifest.inlineImages)) {
            $attachment = $null
            $propertyAccessor = $null
            try {
                $attachment = $mail.Attachments.Add([string]$inlineImage.path)
                $propertyAccessor = $attachment.PropertyAccessor
                $propertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', [string]$inlineImage.contentId)
                $propertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x370E001F', [string]$inlineImage.mimeType)
                $propertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x37140003', 4)
                $propertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B', $true)
            } finally {
                if ($propertyAccessor) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($propertyAccessor) }
                if ($attachment) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($attachment) }
            }
        }
    }
    $mail.HTMLBody = Get-Content -Raw -LiteralPath ([string]$manifest.htmlPath)

    if ($Send) {
        $mail.Send()
        $audit = [ordered]@{
            acceptedAt = [DateTimeOffset]::UtcNow.ToString('o')
            transport = 'OutlookClassicCOM'
            sender = [string]$manifest.sender
            toRecipients = @($manifest.toRecipients)
            ccRecipients = @($manifest.ccRecipients)
            subject = [string]$manifest.subject
            contentHash = [string]$manifest.contentHash
            requestDate = [string]$manifest.requestDate
            startTime = [string]$manifest.startTime
            requestIds = @($manifest.requestIds)
            reusedDraft = $reusedDraft
        }
        $audit | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $lastEmailPath -Encoding UTF8
        if (Test-Path -LiteralPath $lastDraftPath) { Remove-Item -LiteralPath $lastDraftPath -Force }
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
    if ($account) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($account) }
    if ($mail) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($mail) }
    if ($namespace) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($namespace) }
    if ($outlook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) }
}
