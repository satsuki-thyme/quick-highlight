param()

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

foreach ($CommandName in @('node', 'code')) {
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Required command '$CommandName' was not found in PATH."
    }
}
if (-not (Test-Path (Join-Path $RepoRoot 'node_modules\esbuild\bin\esbuild'))) {
    throw 'Dependencies are missing. Run npm install --no-package-lock in this repository first.'
}

# A new directory on every run: previous tests, profiles and logs are retained.
$RunRoot = Join-Path $env:TEMP ('quick-highlight-stage3-' + [Guid]::NewGuid().ToString('N'))
$WorkspaceRoot = Join-Path $RunRoot 'workspace'
$ExtensionRoot = Join-Path $RunRoot 'extension'
$UserDataRoot = Join-Path $RunRoot 'user-data'
$ExtensionsRoot = Join-Path $RunRoot 'extensions'
foreach ($Directory in @($RunRoot, $WorkspaceRoot, $ExtensionRoot, $UserDataRoot, $ExtensionsRoot,
    (Join-Path $WorkspaceRoot '.vscode'), (Join-Path $ExtensionRoot 'dist'))) {
    New-Item -ItemType Directory -Path $Directory | Out-Null
}

Copy-Item (Join-Path $RepoRoot 'package.json') (Join-Path $ExtensionRoot 'package.json')
Copy-Item (Join-Path $RepoRoot 'resources') (Join-Path $ExtensionRoot 'resources') -Recurse
$EsbuildScript = Join-Path $RepoRoot 'node_modules\esbuild\bin\esbuild'
& node $EsbuildScript (Join-Path $RepoRoot 'src\index.ts') --bundle --external:vscode `
    --format=cjs --platform=node --target=es2020 "--outfile=$(Join-Path $ExtensionRoot 'dist\index.js')"
if ($LASTEXITCODE -ne 0) { throw 'Stage 3 bundle failed.' }

$Settings = [ordered]@{
    'highlight.enabled' = $true
    'highlight.debugging' = $false
    'highlight.regexFlags' = 'gi'
    'highlight.regexes' = [ordered]@{
        '(QH_RED)' = @([ordered]@{ backgroundColor = 'rgba(255,0,0,0.35)'; fontWeight = 'bold' })
    }
    'workbench.startupEditor' = 'none'
}
$Settings | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $WorkspaceRoot '.vscode\settings.json') -Encoding UTF8
@'
# Stage 3 fixture

MULTI_A
MULTI_B
MULTI_C
AFTER_MULTI QH_RED

SAME_LINE_LEFT QH_RED | SAME_LINE_RIGHT QH_RED
AFTER_SAME_LINE QH_RED

COPY QH_RED
TAIL QH_RED
'@ | Set-Content (Join-Path $WorkspaceRoot 'STAGE3_TEST_FIXTURE.md') -Encoding UTF8
'Other editor tab for the hidden-editor check.' | Set-Content (Join-Path $WorkspaceRoot 'STAGE3_OTHER.md') -Encoding UTF8

$NodeVersion = (& node --version)
if ($LASTEXITCODE -ne 0) { throw 'Node version check failed.' }
$CodeVersion = @(& code --version)
if ($LASTEXITCODE -ne 0) { throw 'VS Code version check failed.' }
$SourceHashes = [ordered]@{}
Get-ChildItem (Join-Path $RepoRoot 'src') -Filter '*.ts' | Sort-Object Name | ForEach-Object {
    $SourceHashes[$_.Name] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
[ordered]@{
    started_at = (Get-Date).ToString('o')
    repository = $RepoRoot
    run_directory = $RunRoot
    node = $NodeVersion
    vscode = $CodeVersion
    sources_sha256 = $SourceHashes
    bundle_sha256 = (Get-FileHash (Join-Path $ExtensionRoot 'dist\index.js') -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $RunRoot 'RUN_INFO.json') -Encoding UTF8

Write-Host "Stage 3 test directory: $RunRoot"
Write-Host 'Use STAGE3_PHYSICAL_DEVICE_CHECK.md for the three checks.'
Write-Host 'If VS Code asks, trust this generated test workspace to activate the extension.'
& code --new-window --user-data-dir $UserDataRoot --extensions-dir $ExtensionsRoot `
    --extensionDevelopmentPath $ExtensionRoot $WorkspaceRoot (Join-Path $WorkspaceRoot 'STAGE3_TEST_FIXTURE.md')
if ($LASTEXITCODE -ne 0) { throw 'VS Code could not start the Extension Development Host.' }
