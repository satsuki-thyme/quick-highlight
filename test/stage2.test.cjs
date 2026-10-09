'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createHarness, defaultConfig, Document, Position, Range, coords, snapshot, fullSnapshot
} = require('./stage2-support.cjs');

function started(text, config = defaultConfig(), language, fsPath) {
  const h = createHarness(config);
  const doc = new Document(text, language, fsPath);
  const editor = h.editor(doc);
  h.show([editor]); h.activate();
  return { h, doc, editor };
}
function sameAsFull(h, doc, editor, message) {
  assert.deepEqual(snapshot(editor), fullSnapshot(h, doc), message);
}
const insert = (line, character, text) => ({ range: new Range(line, character, line, character), text });
const multiText = 'MULTI_A\nMULTI_B\nMULTI_C\nAFTER_MULTI QH_RED';
const multiEdits = () => [0, 1, 2].map(line => insert(line, 7, ' QH_RED\nINSERTED QH_RED'));

test('fixture coordinates preserve CRLF, UTF-16 offsets and trailing empty lines', () => {
  const doc = new Document('A😀\r\nQH_RED\r\n');
  assert.equal(doc.lineCount, 3);
  assert.equal(doc.offsetAt(new Position(0, Infinity)), 3);
  assert.equal(doc.offsetAt(new Position(1, 0)), 5);
  assert.equal(doc.positionAt(4).character, 3);
  assert.equal(doc.positionAt(5).line, 1);
  doc.edit([insert(0, 3, '!'), insert(1, 6, '?')]);
  assert.equal(doc.text, 'A😀!\r\nQH_RED?\r\n');
});

test('initial matching has explicit expected ranges, including case-insensitivity', () => {
  const { editor } = started('QH_RED qh_red\nQH_BLUE');
  assert.deepEqual(snapshot(editor), [{
    style: { rangeBehavior: 3, backgroundColor: '#ff0000' },
    ranges: [[0, 0, 0, 6], [0, 7, 0, 13]]
  }]);
});

test('single change exposes whole old/new lines and shifts unaffected ranges', () => {
  const h = createHarness();
  const change = h.api.getChange([insert(1, 2, 'X\nY')]);
  assert.deepEqual(Array.from(change.rangesPrev, coords), [[1, 0, 1, Infinity]]);
  assert.deepEqual(Array.from(change.rangesNext, coords), [[1, 0, 2, Infinity]]);
  assert.deepEqual(coords(h.api.getRangeShifted(new Range(4, 1, 4, 7), change.shifts)), [5, 1, 5, 7]);
});

test('line counting supports LF, CRLF and CR; no-op changes have no shift map', () => {
  const h = createHarness();
  for (const eol of ['\n', '\r\n', '\r']) assert.equal(h.api.getStringLinesNr(`a${eol}b${eol}`), 3);
  assert.equal(h.api.getChange([]).shifts, undefined);
  assert.equal(h.api.getChange([insert(0, 0, 'x')]).shifts, undefined);
});

test('QH-01-ranges: multiple insertions use final-document rescan coordinates', () => {
  const h = createHarness();
  const changes = [insert(1, 0, 'X\n'), insert(3, 0, 'Y\n')];
  assert.deepEqual(Array.from(h.api.getChangeRangesNext(changes), coords), [
    [1, 0, 2, Infinity], [4, 0, 5, Infinity]
  ]);
});

test('QH-02-shift: two newline insertions on the same old line accumulate', () => {
  const h = createHarness();
  const change = h.api.getChange([insert(0, 1, '\n'), insert(0, 3, '\n')]);
  assert.deepEqual(coords(h.api.getRangeShifted(new Range(1, 0, 1, 6), change.shifts)), [3, 0, 3, 6]);
});

for (const eol of ['\n', '\r\n']) {
  test(`single-line copy/paste preserves ranges (${JSON.stringify(eol)})`, () => {
    const { h, doc, editor } = started(`SOURCE QH_RED${eol}TAIL QH_RED`);
    h.edit(doc, [insert(1, 0, `SOURCE QH_RED${eol}`)]);
    sameAsFull(h, doc, editor);
  });
}

test('ordinary character insertion and deletion preserve neighboring highlights', () => {
  const { h, doc, editor } = started('EDIT QH_RED\nTAIL QH_RED');
  h.edit(doc, [insert(0, 2, 'x')]);
  sameAsFull(h, doc, editor);
  h.edit(doc, [{ range: new Range(0, 2, 0, 3), text: '' }]);
  sameAsFull(h, doc, editor);
});

test('line duplication and single multiline paste match full recomputation', () => {
  const { h, doc, editor } = started('DUP QH_RED\nTAIL QH_RED');
  h.edit(doc, [insert(1, 0, 'DUP QH_RED\n')]);
  sameAsFull(h, doc, editor);
  h.edit(doc, [insert(1, 0, 'PASTE_A QH_RED\nPASTE_B QH_RED\n')]);
  sameAsFull(h, doc, editor);
});

test('single deletion of complete lines shifts surviving ranges correctly', () => {
  const { h, doc, editor } = started('A QH_RED\nB QH_RED\nC QH_RED\nD QH_RED');
  h.edit(doc, [{ range: new Range(1, 0, 2, 0), text: '' }]);
  sameAsFull(h, doc, editor);
});

test('QH-01-move: line move expressed as delete plus insert matches full recomputation', () => {
  const { h, doc, editor } = started('A QH_RED\nB QH_RED\nC QH_RED\nD QH_RED');
  h.edit(doc, [
    { range: new Range(1, 0, 2, 0), text: '' },
    insert(3, 0, 'B QH_RED\n')
  ]);
  assert.equal(doc.text, 'A QH_RED\nC QH_RED\nB QH_RED\nD QH_RED');
  sameAsFull(h, doc, editor);
});

for (const order of ['ascending', 'descending']) {
  test(`QH-01-${order}: multicursor multiline paste (${order} event order) matches full recomputation`, () => {
    const { h, doc, editor } = started(multiText);
    h.edit(doc, multiEdits(), { order });
    assert.equal(doc.text, 'MULTI_A QH_RED\nINSERTED QH_RED\nMULTI_B QH_RED\nINSERTED QH_RED\nMULTI_C QH_RED\nINSERTED QH_RED\nAFTER_MULTI QH_RED');
    sameAsFull(h, doc, editor);
  });
}

test('QH-02-decoration: same-line multicursor newlines preserve the lower highlight', () => {
  const { h, doc, editor } = started('LEFT QH_RED | RIGHT QH_RED\nAFTER_SAME_LINE QH_RED');
  h.edit(doc, [insert(0, 11, '\n'), insert(0, 14, '\n')]);
  sameAsFull(h, doc, editor);
});

test('Undo of multiline multicursor insertion matches full recomputation from a clean final state', () => {
  const doc = new Document(multiText);
  doc.edit(multiEdits());
  const h = createHarness(); const editor = h.editor(doc);
  h.show([editor]); h.activate();
  h.edit(doc, [0, 2, 4].map(line => ({ range: new Range(line, 7, line + 1, 15), text: '' })), { reason: 1 });
  assert.equal(doc.text, multiText);
  sameAsFull(h, doc, editor);
});

test('QH-01-redo: Redo carries the same acceptance requirement as the original transaction', () => {
  const { h, doc, editor } = started(multiText);
  h.edit(doc, multiEdits(), { reason: 2 });
  sameAsFull(h, doc, editor);
});

test('QH-04-overlap: two edits on one line do not emit duplicate decoration ranges', () => {
  const { h, doc, editor } = started('LEFT QH_RED RIGHT\nTAIL QH_RED');
  h.edit(doc, [insert(0, 1, 'x'), insert(0, 15, 'y')]);
  sameAsFull(h, doc, editor);
});

test('both visible editors receive consistent decoration updates', () => {
  const { h, doc, editor } = started('A QH_RED\nB QH_RED');
  const right = h.editor(doc); h.show([editor, right]);
  h.edit(doc, [insert(1, 0, 'NEW QH_RED\n')]);
  sameAsFull(h, doc, editor);
  assert.deepEqual(snapshot(right), snapshot(editor));
});

test('QH-03-hidden: an existing editor refreshes after its document changed while hidden', () => {
  const { h, doc, editor } = started('A QH_RED\nB');
  const right = h.editor(doc); h.show([editor, right]);
  h.show([editor]);
  h.edit(doc, [insert(1, 1, ' QH_RED')]);
  sameAsFull(h, doc, editor);
  h.show([editor, right]);
  assert.deepEqual(snapshot(right), snapshot(editor));
});

test('intraline edit reads only the changed line', () => {
  const { h, doc, editor } = started(Array.from({ length: 100 }, (_, i) => `${i} QH_RED`).join('\n'));
  doc.reads = [];
  h.edit(doc, [insert(50, 0, 'x')]);
  assert.deepEqual(doc.reads, [[50, 0, 50, Infinity]]);
  sameAsFull(h, doc, editor);
});

test('interline rule rescan spans the document while intraline stays partial', () => {
  const config = defaultConfig();
  config.regexes['(BEGIN[\\s\\S]*?END)'] = [{ color: '#00ff00' }];
  const { h, doc, editor } = started('BEGIN\ninside\nEND\nQH_RED', config);
  assert.equal(h.api.getOptions().highlights.filter(rule => !rule.isIntraline).length, 1);
  doc.reads = [];
  h.edit(doc, [insert(1, 0, 'x')]);
  assert.deepEqual(doc.reads, [[1, 0, 1, Infinity], [0, 0, 3, Infinity]]);
  sameAsFull(h, doc, editor);
});

test('empty contentChanges and unrelated configuration events cause no work', () => {
  const { h, doc, editor } = started('QH_RED');
  const count = editor.calls.length;
  h.events.text.fire({ document: doc, contentChanges: [] });
  h.changeConfig(h.state.config, 'editor.fontSize');
  assert.equal(editor.calls.length, count);
});

test('settings color/source/flags changes, rule addition and removal apply immediately', () => {
  const { h, doc, editor } = started('QH_RED qh_red QH_BLUE');
  const config = defaultConfig();
  config.regexes['(QH_RED)'][0].backgroundColor = '#00ff00';
  h.changeConfig(config);
  assert.equal(snapshot(editor)[0].style.backgroundColor, '#00ff00');
  config.regexFlags = 'g'; h.changeConfig(config);
  assert.deepEqual(snapshot(editor)[0].ranges, [[0, 0, 0, 6]]);
  config.regexes = { '(QH_BLUE)': [{ color: '#0000ff' }] }; h.changeConfig(config);
  assert.deepEqual(snapshot(editor)[0].ranges, [[0, 14, 0, 21]]);
  config.regexes['(QH_RED)'] = [{ color: '#ff0000' }]; h.changeConfig(config);
  assert.equal(snapshot(editor).length, 2);
  delete config.regexes['(QH_BLUE)']; h.changeConfig(config);
  sameAsFull(h, doc, editor);
  assert.equal(snapshot(editor).length, 1);
});

test('enable/disable/toggle command IDs use the existing configuration event path', () => {
  const { h, editor } = started('QH_RED');
  h.state.commands.get('highlight.disable')(); assert.deepEqual(snapshot(editor), []);
  h.state.commands.get('highlight.enable')(); assert.equal(snapshot(editor).length, 1);
  h.state.commands.get('highlight.toggle')(); assert.deepEqual(snapshot(editor), []);
  h.state.commands.get('highlight.toggle')(); assert.equal(snapshot(editor).length, 1);
});

test('language filter switches javascript -> markdown with an explicitly markdown document', () => {
  const config = defaultConfig();
  config.regexes['(QH_RED)'] = { filterLanguageRegex: '^javascript$', decorations: [{ color: '#ff0000' }] };
  const { h, doc, editor } = started('QH_RED', config);
  assert.equal(doc.languageId, 'markdown'); assert.deepEqual(snapshot(editor), []);
  config.regexes['(QH_RED)'].filterLanguageRegex = '^markdown$'; h.changeConfig(config);
  assert.equal(snapshot(editor).length, 1);
});

test('configuration rebuild invalidates a hidden editor before it becomes visible again', () => {
  const { h, doc, editor } = started('QH_RED QH_BLUE');
  const right = h.editor(doc); h.show([editor, right]); h.show([editor]);
  const config = defaultConfig(); config.regexes = { '(QH_BLUE)': [{ color: '#0000ff' }] };
  h.changeConfig(config); h.show([editor, right]);
  assert.deepEqual(snapshot(right), snapshot(editor));
  assert.deepEqual(snapshot(right)[0].ranges, [[0, 7, 0, 14]]);
});

test('file and theme filters rebuild from current settings', () => {
  const config = defaultConfig();
  config.regexes['(QH_RED)'] = { filterFileRegex: 'NEVER$', filterThemeRegex: 'Dark', decorations: [{ color: 'theme.editor.foreground' }] };
  const { h, editor } = started('QH_RED', config);
  assert.deepEqual(snapshot(editor), []);
  config.regexes['(QH_RED)'].filterFileRegex = 'STAGE1_TEST_FIXTURE\\.md$'; h.changeConfig(config);
  assert.equal(snapshot(editor).length, 1);
  assert.deepEqual(snapshot(editor)[0].style.color, { id: 'editor.foreground' });
  h.state.theme = 'Default Light Modern'; h.changeConfig(config, 'workbench.colorTheme');
  assert.deepEqual(snapshot(editor), []);
  h.state.theme = 'Default Dark Modern'; h.changeConfig(config, 'workbench.colorTheme');
  assert.equal(snapshot(editor).length, 1);
});

test('multiple capture groups, dynamic placeholders and no-capture fallback have exact ranges', () => {
  const config = defaultConfig();
  config.regexes = {
    '(COLOR:)(#[0-9a-f]{6})': [{ color: '#888888' }, { backgroundColor: '$2', after: { contentText: '$0' } }],
    'QH_RED': [{ color: '#ff0000' }]
  };
  const { h, doc, editor } = started('COLOR:#ffcc00 QH_RED', config);
  const initial = snapshot(editor);
  assert.equal(initial.length, 3);
  assert.ok(initial.some(row => row.style.after?.contentText === 'COLOR:#ffcc00' && row.ranges[0].join(',') === '0,6,0,13'));
  h.edit(doc, [{ range: new Range(0, 6, 0, 13), text: '#ff00ff' }]);
  assert.ok(snapshot(editor).some(row => row.style.backgroundColor === '#ff00ff'));
  assert.ok(!snapshot(editor).some(row => row.style.backgroundColor === '#ffcc00'));
  sameAsFull(h, doc, editor);
});

test('non-global regex initially matches once and inline flags override fallback flags', () => {
  const config = defaultConfig();
  config.regexes = { '/QH_RED/': [{ color: '#ff0000' }] };
  const { editor } = started('qh_red QH_RED QH_RED', config);
  assert.deepEqual(snapshot(editor)[0].ranges, [[0, 7, 0, 13]]);
});

test('QH-05-static-lifetime: removed static DecorationTypes are disposed during config rebuild', () => {
  const { h, editor } = started('QH_RED');
  const oldType = h.state.types[0];
  const config = defaultConfig(); config.regexes = {};
  h.changeConfig(config);
  assert.deepEqual(snapshot(editor), []);
  assert.equal(oldType.disposed, true);
});

test('QH-05-dynamic-lifetime: removing a dynamic rule disposes all generated DecorationTypes', () => {
  const config = defaultConfig(); config.regexes = { '(#[0-9a-f]{6})': [{ backgroundColor: '$1' }] };
  const { h, editor } = started('#ff0000 #00ff00 #0000ff', config);
  assert.equal(h.state.types.length, 3);
  config.regexes = {}; h.changeConfig(config);
  assert.deepEqual(snapshot(editor), []);
  assert.equal(h.state.types.filter(type => !type.disposed).length, 0);
});
