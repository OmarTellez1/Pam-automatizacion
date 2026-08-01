function Resolve-ProjectNode {
    $candidatePaths = [Collections.Generic.List[string]]::new()

    if ($env:BI_NODE_EXE) {
        $candidatePaths.Add($env:BI_NODE_EXE)
    }

    if ($env:USERPROFILE) {
        $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
        $candidatePaths.Add($bundledNode)
    }

    foreach ($command in @(Get-Command node -All -ErrorAction SilentlyContinue)) {
        $candidatePaths.Add($command.Source)
    }

    foreach ($candidatePath in @($candidatePaths | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
            continue
        }

        $versionText = & $candidatePath --version 2>$null
        if ($versionText -match '^v(?<major>\d+)\.' -and [int]$Matches.major -ge 20) {
            return (Resolve-Path -LiteralPath $candidatePath).Path
        }
    }

    throw 'Se requiere Node.js 20 o posterior. Instálelo o defina BI_NODE_EXE con la ruta de un node.exe compatible.'
}
