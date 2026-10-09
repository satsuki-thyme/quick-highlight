'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness, defaultConfig, Document, Range, snapshot, fullSnapshot } = require('./stage2-support.cjs');

const insert = (line, character, text) => ({ range: new Range(line, character, line, character), text });
function started(text, config = defaultConfig()) {
  const h = createHarness(config), doc = new Document(text), editor = h.editor(doc);
  h.show([editor]); h.activate();
  return { h, doc, editor };
}

// An independent literal oracle, rather than the product's full/partial paths.
function expectedRed(doc) {
  const ranges = [...doc.text.matchAll(/QH_RED/gi)].map(match => {
    const a = doc.positionAt(match.index), b = doc.positionAt(match.index + match[0].length);
    return [a.line, a.character, b.line, b.character];
  });
  return ranges.length ? [{ style: { rangeBehavior: 3, backgroundColor: '#ff0000' }, ranges }] : [];
}

test('mixed insertion, deletion and replacement use final coordinates in both editors', () => {
  const { h, doc, editor } = started(Array.from({ length: 12 }, (_, i) => `${i} QH_RED`).join('\n'));
  const right = h.editor(doc); h.show([editor, right]);
  h.edit(doc, [
    insert(1, 0, 'INSERT QH_RED\n'),
    { range: new Range(3, 0, 6, 0), text: 'REPLACED QH_RED\n' },
    { range: new Range(8, 0, 9, 0), text: '' },
    insert(11, 0, 'LAST QH_RED\n')
  ]);
  assert.deepEqual(snapshot(editor), expectedRed(doc));
  assert.deepEqual(snapshot(right), expectedRed(doc));
});

test('overlapping rescan lines are read once and distant unchanged lines are not read', () => {
  const { h, doc, editor } = started(Array.from({ length: 100 }, () => 'QH_RED QH_RED').join('\n'));
  doc.reads = [];
  h.edit(doc, [insert(10, 0, '!'), insert(10, 13, '!'), insert(80, 0, '!')]);
  assert.deepEqual(doc.reads, [[10, 0, 10, Infinity], [80, 0, 80, Infinity]]);
  assert.deepEqual(snapshot(editor), expectedRed(doc));
});

test('mixed newlines on the same line cover the entire final changed region once', () => {
  const { h, doc, editor } = started('QH_RED | QH_RED | QH_RED\nTAIL QH_RED');
  doc.reads = [];
  h.edit(doc, [insert(0, 7, '\nQH_RED\n'), insert(0, 16, '\n')]);
  assert.deepEqual(doc.reads, [[0, 0, 3, Infinity]]);
  assert.deepEqual(snapshot(editor), expectedRed(doc));
});

test('an entirely hidden document refreshes once after several transactions', () => {
  const { h, doc, editor } = started('QH_RED\nTAIL');
  h.show([]);
  h.edit(doc, [insert(0, 0, 'NEW QH_RED\n')]);
  h.edit(doc, [insert(2, 4, ' QH_RED')]);
  doc.reads = [];
  h.show([editor]);
  assert.deepEqual(doc.reads, [[0, 0, 2, Infinity]]);
  assert.deepEqual(snapshot(editor), expectedRed(doc));
  doc.reads = [];
  h.show([editor]);
  assert.deepEqual(doc.reads, []);
});

test('a cache that missed a transaction cannot use only the latest edit', () => {
  const { h, doc, editor } = started('QH_RED\nTAIL');
  // Simulate an unavailable intermediate event while retaining the editor.
  doc.edit([insert(0, 0, 'NEW QH_RED\n')]);
  doc.reads = [];
  h.edit(doc, [insert(2, 4, ' QH_RED')]);
  assert.deepEqual(doc.reads, [[0, 0, 2, Infinity]]);
  assert.deepEqual(snapshot(editor), expectedRed(doc));
});

test('document identity prevents reuse after reopening the same URI at the same version', () => {
  const { h, doc, editor } = started('QH_RED');
  const replacement = new Document('OTHER\nQH_RED', doc.languageId, doc.uri.fsPath);
  editor.document = replacement;
  h.show([editor]);
  assert.deepEqual(snapshot(editor), expectedRed(replacement));
});

test('visible refresh before text callback does not apply the same shift twice', () => {
  const { h, doc, editor } = started('QH_RED\nTAIL QH_RED');
  const contentChanges = doc.edit([insert(0, 0, 'NEW QH_RED\n')]);
  h.show([editor]);
  doc.reads = [];
  h.events.text.fire({ document: doc, contentChanges });
  assert.deepEqual(doc.reads, []);
  assert.deepEqual(snapshot(editor), expectedRed(doc));
});

test('repeated multicursor edit, undo and redo leave both editors consistent', () => {
  const { h, doc, editor } = started('A QH_RED\nB QH_RED\nC QH_RED');
  const right = h.editor(doc); h.show([editor, right]);
  for (let cycle = 0; cycle < 8; cycle++) {
    h.edit(doc, [insert(0, 0, 'X QH_RED\n'), insert(2, 0, 'Y QH_RED\n')], { reason: cycle ? 2 : undefined });
    assert.deepEqual(snapshot(editor), expectedRed(doc));
    assert.deepEqual(snapshot(right), snapshot(editor));
    h.edit(doc, [
      { range: new Range(0, 0, 1, 0), text: '' },
      { range: new Range(3, 0, 4, 0), text: '' }
    ], { reason: 1 });
    assert.equal(doc.text, 'A QH_RED\nB QH_RED\nC QH_RED');
    assert.deepEqual(snapshot(editor), expectedRed(doc));
    assert.deepEqual(snapshot(right), snapshot(editor));
  }
});

test('dynamic capture styles and interline rules survive mixed edits', () => {
  const config = defaultConfig();
  config.regexes['(#[0-9a-f]{6})'] = [{ backgroundColor: '$1' }];
  config.regexes['(BEGIN[\\s\\S]*?END)'] = [{ color: '#008800' }];
  const { h, doc, editor } = started('BEGIN\n#ff0000 QH_RED\n#00ff00\nEND\n#0000ff', config);
  h.edit(doc, [insert(1, 0, '#ffffff\n'), { range: new Range(2, 0, 2, 7), text: '#123456\nQH_RED' }]);
  assert.deepEqual(snapshot(editor), fullSnapshot(h, doc));
  assert.ok(!snapshot(editor).some(row => row.style.backgroundColor === '#00ff00'));
});

for (const eol of ['\n', '\r\n']) {
  test(`seeded 200-transaction literal oracle with UTF-16 and ${JSON.stringify(eol)}`, () => {
    let seed = 0x514803;
    const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    const { h, doc, editor } = started(Array.from({ length: 10 }, (_, i) => `${i} 😀 QH_RED qh_red`).join(eol));
    const right = h.editor(doc); h.show([editor, right]);
    const pieces = ['', 'QH_RED', `x${eol}QH_RED${eol}`, '😀', eol, 'qh_red', 'x'];
    for (let step = 0; step < 200; step++) {
      const length = doc.text.length, edits = [], slots = 3;
      // Non-overlapping selections from independent thirds of the old text.
      for (let slot = 0; slot < slots; slot++) {
        const lo = Math.floor(length * slot / slots), hi = Math.floor(length * (slot + 1) / slots);
        if (hi - lo < 3) continue;
        const startOffset = lo + random(Math.max(1, hi - lo - 1));
        const endOffset = Math.min(hi - 1, startOffset + random(9));
        edits.push({ range: new Range(doc.positionAt(startOffset), doc.positionAt(endOffset)), text: pieces[random(pieces.length)] });
      }
      if (!edits.length) edits.push(insert(0, 0, `QH_RED${eol}QH_RED`));
      h.edit(doc, edits, { order: step % 2 ? 'ascending' : 'descending' });
      assert.deepEqual(snapshot(editor), expectedRed(doc), `seed 0x514803, step ${step}`);
      assert.deepEqual(snapshot(right), snapshot(editor), `right editor, step ${step}`);
    }
  });
}

test('debug line count includes the full refresh of a stale hidden cache', () => {
  const config = defaultConfig(); config.debugging = true;
  const { h, doc, editor } = started('QH_RED\nTAIL', config);
  h.show([]); h.edit(doc, [insert(0, 0, 'QH_RED\n')]);
  h.state.alerts.length = 0;
  h.show([editor]);
  assert.match(h.state.alerts[0], / - 3 lines - /);
  assert.match(h.state.alerts[1], / - 0 lines - /);
});
