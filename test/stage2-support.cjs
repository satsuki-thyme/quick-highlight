'use strict';

// A deliberately small VS Code API boundary. Product code and npm dependencies
// are bundled unchanged; each fixture gets a fresh module/cache/event lifetime.
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = buildSync({
  absWorkingDir: root,
  stdin: {
    contents: "export * from './src/utils'; export * from './src/decoration'; export {activate} from './src/index';",
    resolveDir: root, sourcefile: 'stage2-entry.ts', loader: 'ts'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  target: 'node20', external: ['vscode'], logLevel: 'silent'
}).outputFiles[0].text;

class Position {
  constructor(line, character) {
    assert.ok(line >= 0 && character >= 0, 'negative position');
    this.line = line; this.character = character;
  }
  compareTo(other) {
    if (this.line !== other.line) return this.line < other.line ? -1 : 1;
    return this.character === other.character ? 0 : this.character < other.character ? -1 : 1;
  }
  isEqual(other) { return this.compareTo(other) === 0; }
  isBefore(other) { return this.compareTo(other) < 0; }
  isBeforeOrEqual(other) { return this.compareTo(other) <= 0; }
  isAfter(other) { return this.compareTo(other) > 0; }
  translate(lines = 0, characters = 0) {
    return new Position(this.line + lines, this.character + characters);
  }
}

class Range {
  constructor(a, b, c, d) {
    const start = typeof a === 'number' ? new Position(a, b) : a;
    const end = typeof a === 'number' ? new Position(c, d) : b;
    [this.start, this.end] = start.compareTo(end) <= 0 ? [start, end] : [end, start];
  }
  get isEmpty() { return this.start.isEqual(this.end); }
  intersection(other) {
    const start = this.start.compareTo(other.start) >= 0 ? this.start : other.start;
    const end = this.end.compareTo(other.end) <= 0 ? this.end : other.end;
    return start.compareTo(end) <= 0 ? new Range(start, end) : undefined;
  }
}

const coords = range => [range.start.line, range.start.character, range.end.line, range.end.character];
const plain = value => JSON.parse(JSON.stringify(value));

class Document {
  constructor(text, languageId = 'markdown', fsPath = '/fixture/STAGE1_TEST_FIXTURE.md') {
    this.text = text; this.languageId = languageId; this.version = 1;
    this.uri = { fsPath, toString: () => `file://${fsPath}` };
    this.reads = [];
  }
  lines() {
    const starts = [0], ends = [];
    for (const match of this.text.matchAll(/\r\n|\r|\n/g)) {
      ends.push(match.index); starts.push(match.index + match[0].length);
    }
    ends.push(this.text.length);
    return { starts, ends };
  }
  get lineCount() { return this.lines().starts.length; }
  offsetAt(position) {
    const { starts, ends } = this.lines();
    if (position.line >= starts.length) return this.text.length;
    return Math.min(starts[position.line] + position.character, ends[position.line]);
  }
  positionAt(offset) {
    offset = Math.max(0, Math.min(offset, this.text.length));
    const { starts, ends } = this.lines();
    let line = starts.length - 1;
    while (line > 0 && starts[line] > offset) line--;
    return new Position(line, Math.min(offset, ends[line]) - starts[line]);
  }
  getText(range) {
    this.reads.push(range ? coords(range) : null);
    return range ? this.text.slice(this.offsetAt(range.start), this.offsetAt(range.end)) : this.text;
  }
  // Every edit is expressed in OLD-document coordinates. Applying from the end
  // constructs final text independently of the product's line-shift algorithm.
  edit(specs, order = 'descending') {
    const changes = specs.map(({ range, text }) => {
      const rangeOffset = this.offsetAt(range.start);
      return { range, text, rangeOffset, rangeLength: this.offsetAt(range.end) - rangeOffset };
    });
    const sorted = [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].rangeOffset + sorted[i].rangeLength <= sorted[i - 1].rangeOffset, 'overlapping edits');
    }
    let result = this.text;
    for (const change of sorted) {
      result = result.slice(0, change.rangeOffset) + change.text + result.slice(change.rangeOffset + change.rangeLength);
    }
    this.text = result; this.version++;
    return order === 'ascending' ? sorted.reverse() : sorted;
  }
}

function signal() {
  const listeners = new Set();
  return {
    subscribe(fn) { listeners.add(fn); return { dispose: () => listeners.delete(fn) }; },
    fire(value) { for (const fn of [...listeners]) fn(value); },
    get size() { return listeners.size; }
  };
}

const defaultConfig = () => ({
  enabled: true, debugging: false, regexFlags: 'gi',
  decorations: { rangeBehavior: 3 },
  regexes: { '(QH_RED)': [{ backgroundColor: '#ff0000' }] }
});

function createHarness(config = defaultConfig()) {
  const events = Object.fromEntries(['text', 'configuration', 'active', 'visible', 'close'].map(key => [key, signal()]));
  const state = {
    config: plain(config), theme: 'Default Dark Modern', types: [], editors: [], commands: new Map(), alerts: []
  };
  function readConfig(key) {
    if (!key) return { highlight: plain(state.config), workbench: { colorTheme: state.theme } };
    return key.split('.').reduce((value, part) => value?.[part], readConfig());
  }
  const vscode = {
    Position, Range,
    ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    TextDocumentChangeReason: { Undo: 1, Redo: 2 },
    window: {
      visibleTextEditors: [], activeTextEditor: undefined,
      onDidChangeActiveTextEditor: fn => events.active.subscribe(fn),
      onDidChangeVisibleTextEditors: fn => events.visible.subscribe(fn),
      showInformationMessage: value => state.alerts.push(value),
      showWarningMessage: value => state.alerts.push(value),
      showErrorMessage: value => state.alerts.push(value),
      createTextEditorDecorationType(options) {
        const type = {
          key: `decoration-${state.types.length}`, options: plain(options), disposed: false, disposeCount: 0,
          dispose() {
            this.disposed = true; this.disposeCount++;
            for (const editor of state.editors) editor.decorations.delete(this);
          }
        };
        state.types.push(type); return type;
      }
    },
    workspace: {
      onDidChangeTextDocument: fn => events.text.subscribe(fn),
      onDidChangeConfiguration: fn => events.configuration.subscribe(fn),
      onDidCloseTextDocument: fn => events.close.subscribe(fn),
      getConfiguration(section = '') {
        return {
          get(key, fallback) { return readConfig([section, key].filter(Boolean).join('.')) ?? fallback; },
          update(key, value) {
            assert.equal(section, 'highlight');
            state.config[key] = plain(value);
            events.configuration.fire({ affectsConfiguration: name => name === 'highlight' || name === `highlight.${key}` });
            return Promise.resolve();
          }
        };
      }
    },
    commands: {
      registerCommand(id, fn) {
        assert.ok(!state.commands.has(id), `duplicate command ${id}`);
        state.commands.set(id, fn);
        return { dispose: () => state.commands.delete(id) };
      }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, require: name => name === 'vscode' ? vscode : require(name),
    console, process, Buffer, performance, setTimeout, clearTimeout, setInterval, clearInterval
  }, { filename: 'quick-highlight-stage2-bundle.cjs' });
  const api = module.exports;
  const context = { subscriptions: [], globalState: { get: () => true, update: () => Promise.resolve() } };
  function editor(document) {
    const result = {
      document, decorations: new Map(), calls: [],
      setDecorations(type, ranges) {
        assert.ok(!type.disposed, 'using disposed DecorationType');
        this.calls.push({ type, ranges: [...ranges] });
        this.decorations.set(type, [...ranges]);
      }
    };
    state.editors.push(result); return result;
  }
  function show(editors) {
    vscode.window.visibleTextEditors = editors;
    vscode.window.activeTextEditor = editors[0];
    events.visible.fire(editors);
    events.active.fire(editors[0]);
  }
  function changeConfig(config, section = 'highlight') {
    state.config = plain(config);
    events.configuration.fire({ affectsConfiguration: name => name === section });
  }
  function edit(document, specs, { reason, order } = {}) {
    const contentChanges = document.edit(specs, order);
    events.text.fire({ document, contentChanges, reason });
    return contentChanges;
  }
  return { api, vscode, state, events, context, editor, show, edit, changeConfig, activate: () => api.activate(context) };
}

function snapshot(editor) {
  return [...editor.decorations].filter(([, ranges]) => ranges.length).map(([type, ranges]) => ({
    style: type.options,
    ranges: ranges.map(coords).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function fullSnapshot(harness, document) {
  const fresh = harness.editor(document);
  harness.api.decorate(fresh, harness.api.getOptions());
  return snapshot(fresh);
}

module.exports = { createHarness, defaultConfig, Document, Position, Range, coords, snapshot, fullSnapshot };
