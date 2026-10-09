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
$Prepared = @(& node (Join-Path $RepoRoot 'test\stage4-prepare.cjs'))
if ($LASTEXITCODE -ne 0) { throw 'Stage 4 test preparation failed.' }
$RunRoot = $Prepared[-1].Trim()
if (-not (Test-Path (Join-Path $RunRoot 'RUN_INFO.json'))) {
    throw 'Stage 4 preparation did not produce RUN_INFO.json.'
}
Write-Host "Stage 4 test directory: $RunRoot"
Write-Host 'Open the fixture in two editor groups, then press F6 for each of the 12 checks.'
Write-Host 'See STAGE4_PHYSICAL_DEVICE_CHECK.md. Prior test data and normal settings are retained.'
& code --new-window --user-data-dir (Join-Path $RunRoot 'user-data') `
    --extensions-dir (Join-Path $RunRoot 'extensions') `
    --extensionDevelopmentPath (Join-Path $RunRoot 'extension') `
    (Join-Path $RunRoot 'workspace') (Join-Path $RunRoot 'workspace\STAGE4_TEST_FIXTURE.md')
if ($LASTEXITCODE -ne 0) { throw 'VS Code could not start the Extension Development Host.' }
