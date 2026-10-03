param()

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TestRoot = Join-Path $env:TEMP "quick-highlight-stage1-test"
$UserDataRoot = Join-Path $env:TEMP "quick-highlight-stage1-user-data"
$ExtensionsRoot = Join-Path $env:TEMP "quick-highlight-stage1-extensions"
$DiagRoot = Join-Path $ExtensionsRoot "quick-highlight-stage1-diagnostics-0.0.0"
$LogPath = Join-Path $RepoRoot "STAGE1_EVENT_LOG.jsonl"

Set-Location $RepoRoot

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

Require-Command "node"
Require-Command "npm"
Require-Command "code"

Write-Host "Quick Highlight Stage 1 test preparation"
Write-Host "Repository: $RepoRoot"
Write-Host "Node: $(node --version)"
Write-Host "npm: $(npm --version)"
Write-Host "VS Code:"
code --version | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" }

if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
    Write-Host ""
    Write-Host "node_modules was not found. Installing dependencies without creating package-lock.json..."
    npm install --no-package-lock
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed."
    }
}

Write-Host ""
Write-Host "Building development bundle with esbuild directly (Windows-safe workaround for tsex)..."

$EsbuildScript = Join-Path $RepoRoot "node_modules\esbuild\bin\esbuild"
$EntryPoint = Join-Path $RepoRoot "src\index.ts"
$DistDir = Join-Path $RepoRoot "dist"
$OutputFile = Join-Path $DistDir "index.js"

if (-not (Test-Path $EsbuildScript)) {
    throw "esbuild script was not found at '$EsbuildScript'. Run npm install first."
}

Write-Host "esbuild:"
& node $EsbuildScript --version
if ($LASTEXITCODE -ne 0) {
    throw "esbuild could not start through Node."
}

if (Test-Path $DistDir) {
    Remove-Item -Recurse -Force $DistDir
}
New-Item -ItemType Directory -Force $DistDir | Out-Null

& node $EsbuildScript `
    $EntryPoint `
    --bundle `
    --external:vscode `
    --format=cjs `
    --platform=node `
    --target=es2020 `
    "--outfile=$OutputFile"

if ($LASTEXITCODE -ne 0) {
    throw "Direct esbuild bundle failed."
}

if (-not (Test-Path $OutputFile)) {
    throw "Bundle command completed but '$OutputFile' was not created."
}

Write-Host "Bundle created: $OutputFile"

foreach ($path in @($TestRoot, $UserDataRoot, $ExtensionsRoot)) {
    if (Test-Path $path) {
        Remove-Item -Recurse -Force $path
    }
    New-Item -ItemType Directory -Force $path | Out-Null
}

New-Item -ItemType Directory -Force (Join-Path $TestRoot ".vscode") | Out-Null
New-Item -ItemType Directory -Force $DiagRoot | Out-Null

$fixtureSource = Join-Path $RepoRoot "STAGE1_TEST_FIXTURE.md"
if (-not (Test-Path $fixtureSource)) {
    throw "STAGE1_TEST_FIXTURE.md was not found next to this script."
}

Copy-Item $fixtureSource (Join-Path $TestRoot "STAGE1_TEST_FIXTURE.md") -Force
Set-Content -Path (Join-Path $TestRoot "STAGE1_OTHER.md") -Encoding UTF8 -Value @'
# Other file

This file exists only to make one editor hide STAGE1_TEST_FIXTURE.md during the cache test.
'@

$perfPath = Join-Path $TestRoot "STAGE1_PERF_FIXTURE.txt"
$perfLines = for ($i = 1; $i -le 10000; $i++) {
    "PERF_$i QH_RED COLOR:#ffcc00"
}
Set-Content -Path $perfPath -Encoding UTF8 -Value $perfLines

if (Test-Path $LogPath) {
    Remove-Item -Force $LogPath
}

$settingsObject = [ordered]@{
    "highlight.debugging" = $false
    "highlight.enabled" = $true
    "highlight.regexFlags" = "gi"
    "highlight.regexes" = [ordered]@{
        "(QH_RED)" = @(
            [ordered]@{
                "backgroundColor" = "rgba(255, 0, 0, 0.35)"
                "fontWeight" = "bold"
            }
        )
        "(COLOR:)(#[0-9A-Fa-f]{6})" = [ordered]@{
            "regexFlags" = "gi"
            "decorations" = @(
                [ordered]@{
                    "fontWeight" = "bold"
                },
                [ordered]@{
                    "backgroundColor" = '$2'
                    "color" = "#000000"
                }
            )
        }
        "(BEGIN[\s\S]*?END)" = [ordered]@{
            "regexFlags" = "g"
            "decorations" = @(
                [ordered]@{
                    "outline" = "1px solid #ff00ff"
                }
            )
        }
    }
    "quickHighlightStage1Diagnostics.logPath" = $LogPath
}

$settingsJson = $settingsObject | ConvertTo-Json -Depth 20
Set-Content -Path (Join-Path $TestRoot ".vscode\settings.json") -Encoding UTF8 -Value $settingsJson

$diagPackage = @'
{
  "name": "quick-highlight-stage1-diagnostics",
  "displayName": "Quick Highlight Stage 1 Diagnostics",
  "description": "Temporary local diagnostics for Quick Highlight stage 1.",
  "version": "0.0.0",
  "publisher": "local",
  "engines": {
    "vscode": "^1.87.0"
  },
  "main": "./extension.js",
  "activationEvents": [
    "*"
  ],
  "contributes": {
    "configuration": {
      "title": "Quick Highlight Stage 1 Diagnostics",
      "properties": {
        "quickHighlightStage1Diagnostics.logPath": {
          "type": "string",
          "default": ""
        }
      }
    }
  }
}
'@
Set-Content -Path (Join-Path $DiagRoot "package.json") -Encoding UTF8 -Value $diagPackage

$diagExtension = @'
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

function activate(context) {
  const output = vscode.window.createOutputChannel('Quick Highlight Stage 1 Diagnostics');
  context.subscriptions.push(output);

  const configured = vscode.workspace.getConfiguration('quickHighlightStage1Diagnostics').get('logPath', '');
  const fallbackRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || context.logUri.fsPath;
  const logPath = configured || path.join(fallbackRoot, 'STAGE1_EVENT_LOG.jsonl');

  const append = (record) => {
    const row = {
      timestamp: new Date().toISOString(),
      ...record
    };

    const line = JSON.stringify(row);
    output.appendLine(line);

    try {
      fs.appendFileSync(logPath, line + '\n', 'utf8');
    } catch (error) {
      output.appendLine(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'diagnostic-write-error',
        message: String(error)
      }));
    }
  };

  const serializeEditor = (editor) => {
    if (!editor) return null;
    return {
      uri: editor.document.uri.toString(),
      fileName: editor.document.fileName,
      languageId: editor.document.languageId,
      viewColumn: editor.viewColumn ?? null
    };
  };

  append({
    type: 'diagnostic-activate',
    vscodeVersion: vscode.version,
    logPath,
    highlightConfig: vscode.workspace.getConfiguration('highlight'),
    colorTheme: vscode.workspace.getConfiguration('workbench').get('colorTheme', null),
    visibleEditors: vscode.window.visibleTextEditors.map(serializeEditor)
  });

  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (!event.contentChanges.length) return;

    append({
      type: 'text-change',
      document: {
        uri: event.document.uri.toString(),
        fileName: event.document.fileName,
        languageId: event.document.languageId,
        version: event.document.version,
        lineCount: event.document.lineCount
      },
      contentChanges: event.contentChanges.map((change, index) => ({
        index,
        range: {
          start: {
            line: change.range.start.line,
            character: change.range.start.character
          },
          end: {
            line: change.range.end.line,
            character: change.range.end.character
          }
        },
        rangeLength: change.rangeLength,
        text: change.text
      }))
    });
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    const highlightChanged = event.affectsConfiguration('highlight');
    const themeChanged = event.affectsConfiguration('workbench.colorTheme');

    if (!highlightChanged && !themeChanged) return;

    append({
      type: 'configuration-change',
      highlightChanged,
      themeChanged,
      highlightConfig: vscode.workspace.getConfiguration('highlight'),
      colorTheme: vscode.workspace.getConfiguration('workbench').get('colorTheme', null)
    });
  }));

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    append({
      type: 'active-editor-change',
      editor: serializeEditor(editor)
    });
  }));

  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
    append({
      type: 'visible-editors-change',
      editors: editors.map(serializeEditor)
    });
  }));

  append({
    type: 'diagnostic-ready'
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
'@
Set-Content -Path (Join-Path $DiagRoot "extension.js") -Encoding UTF8 -Value $diagExtension

Write-Host ""
Write-Host "Prepared:"
Write-Host "  Test workspace: $TestRoot"
Write-Host "  Diagnostic extension: $DiagRoot"
Write-Host "  Event log: $LogPath"
Write-Host ""
Write-Host "Launching Extension Development Host..."

& code `
    --new-window `
    --user-data-dir="$UserDataRoot" `
    --extensions-dir="$ExtensionsRoot" `
    --extensionDevelopmentPath="$RepoRoot" `
    "$TestRoot"

if ($LASTEXITCODE -ne 0) {
    throw "VS Code launch failed."
}

Write-Host ""
Write-Host "Extension Development Host launch command completed."
Write-Host "Follow STAGE1_PHYSICAL_DEVICE_CHECK.md in the repository."
