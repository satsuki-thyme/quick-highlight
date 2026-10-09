'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { buildSync } = require('esbuild');
const repo = path.resolve(__dirname, '..');
const run = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-highlight-stage4-'));
const workspace = path.join(run, 'workspace');
const extension = path.join(run, 'extension');
for (const folder of [workspace, extension, path.join(workspace, '.vscode'), path.join(extension, 'dist'), path.join(run, 'user-data'), path.join(run, 'extensions')]) {
  fs.mkdirSync(folder, { recursive: true });
}
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
manifest.contributes.commands.push({ command: 'quickHighlight.stage4.nextCheck', title: 'Quick Highlight: Stage 4 Next Check' });
manifest.contributes.keybindings = [...(manifest.contributes.keybindings || []), { key: 'f6', command: 'quickHighlight.stage4.nextCheck' }];
fs.writeFileSync(path.join(extension, 'package.json'), JSON.stringify(manifest, null, 2));
if (fs.existsSync(path.join(repo, 'resources'))) fs.cpSync(path.join(repo, 'resources'), path.join(extension, 'resources'), { recursive: true });
buildSync({ absWorkingDir:repo, entryPoints:['test/stage4-dev-entry.ts'], bundle:true, external:['vscode'], format:'cjs', platform:'node', target:'node20', outfile:path.join(extension,'dist','index.js') });
const settings = {
  'highlight.enabled': true, 'highlight.debugging': false, 'highlight.regexFlags': 'gi',
  'highlight.regexes': {
    '(QH_RED)': { decorations: [{ backgroundColor:'rgba(255,0,0,0.45)', fontWeight:'bold' }] },
    '(#[0-9a-f]{6})': { decorations: [{ backgroundColor:'$1' }] }
  },
  'files.associations': { '*.md':'markdown' },
  'workbench.colorTheme': 'Default Dark Modern', 'workbench.startupEditor':'none'
};
fs.writeFileSync(path.join(workspace,'.vscode','settings.json'),JSON.stringify(settings,null,2));
fs.writeFileSync(path.join(workspace,'STAGE4_TEST_FIXTURE.md'), '# Stage 4 fixture\n\nQH_RED qh_red QH_BLUE\n\n#ff0000 #00ff00 #0000ff\n\nTAIL QH_RED\n');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashes = {};
for (const name of fs.readdirSync(path.join(repo,'src')).filter(name=>name.endsWith('.ts')&&!name.includes('.backup-')).sort()) hashes[`src/${name}`]=hash(path.join(repo,'src',name));
for (const name of ['test/stage4-dev-entry.ts','test/stage4-prepare.cjs','package.json']) hashes[name]=hash(path.join(repo,name));
let codeVersion;
try { codeVersion = execFileSync(process.platform==='win32' ? 'code.cmd' : 'code', ['--version'], {encoding:'utf8', shell:process.platform==='win32'}).trim(); }
catch { codeVersion = 'unavailable (preparation only)'; }
fs.writeFileSync(path.join(run,'RUN_INFO.json'),JSON.stringify({started_at:new Date().toISOString(),repository:repo,run_directory:run,node:process.version,vscode:codeVersion,sources_sha256:hashes,bundle_sha256:hash(path.join(extension,'dist','index.js')),diagnostics:'Test-only local RUN_EVENTS.jsonl; no document text and no external transmission.'},null,2));
console.log(run);
