'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHarness, defaultConfig, Document, Range, snapshot } = require('./stage2-support.cjs');

function started(text = 'QH_RED qh_red QH_BLUE', config = defaultConfig()) {
  const h = createHarness(config), doc = new Document(text), editor = h.editor(doc);
  h.show([editor]); h.activate();
  return { h, doc, editor };
}
const live = h => h.state.types.filter(type => !type.disposed);
const cleanup = h => { for (const disposable of h.context.subscriptions) disposable.dispose(); };

test('30 setting replacements release every old generation and refresh both editors without text edits', () => {
  const { h, doc, editor } = started('QH_RED');
  const right = h.editor(doc); h.show([editor, right]);
  for (let i = 0; i < 30; i++) {
    const old = [...live(h)], config = defaultConfig();
    const color = i % 2 ? '#ff0000' : '#00ff00';
    config.regexes['(QH_RED)'][0].backgroundColor = color;
    doc.reads = []; h.changeConfig(config);
    assert.equal(doc.version, 1);
    assert.ok(old.every(type => type.disposed && type.disposeCount === 1));
    assert.equal(live(h).length, 1);
    assert.equal(snapshot(editor)[0].style.backgroundColor, color);
    assert.deepEqual(snapshot(right), snapshot(editor));
    assert.equal(doc.reads.length, 2);
  }
  cleanup(h);
  assert.equal(live(h).length, 0);
  assert.ok(h.state.types.every(type => type.disposeCount === 1));
});

test('dynamic generations release types that disappeared from text and reuse only live resolved styles', () => {
  const config = defaultConfig();
  config.regexes = { '(#[0-9a-f]{6})': [{ backgroundColor: '$1' }] };
  const { h, doc, editor } = started('#ff0000 #00ff00 #0000ff', config);
  h.edit(doc, [{ range: new Range(0, 0, 0, 7), text: '#ffffff' }]);
  assert.equal(live(h).length, 4);
  const old = [...live(h)]; h.changeConfig(config);
  assert.ok(old.every(type => type.disposeCount === 1));
  assert.equal(live(h).length, 3);
  for (let i = 0; i < 20; i++) {
    const removed = [...live(h)];
    h.changeConfig({ ...config, regexes: {} });
    assert.equal(live(h).length, 0); assert.deepEqual(snapshot(editor), []);
    assert.ok(removed.every(type => type.disposeCount === 1));
    h.changeConfig(config);
    assert.equal(live(h).length, 3);
  }
});

test('disabled extension and disabled or filtered rules allocate no DecorationTypes', () => {
  const config = defaultConfig(); config.enabled = false;
  const { h, editor } = started('QH_RED', config);
  assert.equal(h.state.types.length, 0);
  config.enabled = true; config.regexes['(QH_RED)'] = { enabled: false, decorations: [{ color: '#fff' }] };
  h.changeConfig(config); assert.equal(h.state.types.length, 0);
  config.regexes['(QH_RED)'].enabled = true;
  config.regexes['(QH_RED)'].filterFileRegex = 'NEVER';
  h.changeConfig(config); assert.equal(h.state.types.length, 0);
  delete config.regexes['(QH_RED)'].filterFileRegex;
  h.changeConfig(config); assert.equal(snapshot(editor).length, 1);
  config.enabled = false; h.changeConfig(config);
  assert.equal(live(h).length, 0); assert.deepEqual(snapshot(editor), []);
});

test('ordinary edits reuse static types and preserve intraline single-line scanning after a rebuild', () => {
  const { h, doc, editor } = started(Array.from({ length: 100 }, () => 'QH_RED').join('\n'));
  h.changeConfig(defaultConfig());
  const types = h.state.types.length, active = live(h)[0]; doc.reads = [];
  h.edit(doc, [{ range: new Range(50, 0, 50, 0), text: 'x' }]);
  assert.equal(h.state.types.length, types); assert.equal(live(h)[0], active);
  assert.deepEqual(doc.reads, [[50, 0, 50, Infinity]]);
  assert.equal(snapshot(editor)[0].ranges.length, 100);
});

for (const kind of ['source', 'flags', 'filter']) {
  test(`invalid ${kind} retains the last valid view and a later correction applies without restart`, () => {
    const { h, doc, editor } = started('QH_RED QH_BLUE');
    const before = snapshot(editor), old = live(h)[0], invalid = defaultConfig();
    if (kind === 'source') invalid.regexes['['] = [{ color: '#fff' }];
    if (kind === 'flags') invalid.regexFlags = 'z';
    if (kind === 'filter') invalid.regexes['(QH_RED)'] = { filterLanguageRegex: '[', decorations: [{ color: '#fff' }] };
    assert.doesNotThrow(() => h.changeConfig(invalid));
    assert.deepEqual(snapshot(editor), before); assert.equal(old.disposed, false);
    assert.equal(live(h).length, 1); assert.equal(h.state.alerts.length, 1);
    const fixed = defaultConfig(); fixed.regexes = { '(QH_BLUE)': [{ color: '#0000ff' }] };
    h.changeConfig(fixed);
    assert.equal(old.disposed, true); assert.equal(doc.version, 1);
    assert.deepEqual(snapshot(editor)[0].ranges, [[0, 7, 0, 14]]);
  });
}

test('invalid settings at activation keep event subscriptions alive for recovery', () => {
  const config = defaultConfig(); config.regexes = { '[': [{ color: '#fff' }] };
  const { h, editor } = started('QH_RED', config);
  assert.equal(live(h).length, 0); assert.equal(h.state.alerts.length, 1);
  h.changeConfig(defaultConfig()); assert.equal(snapshot(editor).length, 1);
});

test('disable command still works when another setting is invalid', () => {
  const { h, editor } = started('QH_RED');
  const invalid = defaultConfig(); invalid.regexes = { '[': [{ color: '#fff' }] };
  h.changeConfig(invalid);
  h.state.commands.get('highlight.disable')();
  assert.equal(live(h).length, 0); assert.deepEqual(snapshot(editor), []);
  h.changeConfig(defaultConfig()); assert.equal(snapshot(editor).length, 1);
});

test('dynamic capture replacement preserves quotes, backslashes and newlines', () => {
  const config = defaultConfig();
  config.regexes = { '(BEGIN[\\s\\S]*END)': [{ after: { contentText: '$0 / $1' } }] };
  const value = 'BEGIN "quoted" \\path\nEND';
  const { h, editor } = started(value, config);
  assert.equal(snapshot(editor)[0].style.after.contentText, `${value} / ${value}`);
  const old = [...live(h)]; h.changeConfig(config);
  assert.ok(old.every(type => type.disposed));
  assert.equal(snapshot(editor)[0].style.after.contentText, `${value} / ${value}`);
});

test('dynamic cache does not collide when different captures have the same dash-joined key', () => {
  const config = defaultConfig();
  config.regexes = { '(a-b|a)(-?b?)': [{ after: { contentText: '$1|$2' } }] };
  // Direct factory matches isolate the previously ambiguous key encoding.
  const h = createHarness(config), options = h.api.getOptions();
  const factory = options.highlights[0].highlightDecorations[0];
  const first = factory(Object.assign(['a-b', 'a-b', ''], { index: 0, input: 'a-b' }));
  const second = factory(Object.assign(['a-b', 'a', 'b-'], { index: 0, input: 'a-b' }));
  assert.notEqual(first, second);
  assert.equal(first.options.after.contentText, 'a-b|');
  assert.equal(second.options.after.contentText, 'a|b-');
  options.dispose(); assert.equal(live(h).length, 0);
});

test('identical resolved decorations within one rule merge capture ranges and share one live type', () => {
  const config = defaultConfig();
  config.regexes = { '(QH_)(RED)': [{ color: '#ff0000' }, { color: '#ff0000' }] };
  const { h, editor } = started('QH_RED', config);
  assert.equal(live(h).length, 1);
  assert.deepEqual(snapshot(editor)[0].ranges, [[0, 0, 0, 3], [0, 3, 0, 6]]);
});

test('identical styles in separate rules retain all their ranges', () => {
  const config = defaultConfig();
  config.regexes = { '(QH_RED)': [{ color: '#fff' }], '(QH_BLUE)': [{ color: '#fff' }] };
  const { h, editor } = started('QH_RED QH_BLUE', config);
  assert.equal(live(h).length, 2);
  assert.deepEqual(snapshot(editor).flatMap(row => row.ranges).sort((a,b)=>a[1]-b[1]), [[0,0,0,6],[0,7,0,14]]);
});

for (const flag of ['g', 'y']) {
  test(`stateful /filter/${flag} flags remain deterministic across editors and repeated edits`, () => {
    const config = defaultConfig();
    config.regexes['(QH_RED)'] = {
      filterLanguageRegex: `/^markdown$/${flag}`, filterThemeRegex: `/^Default/${flag}`,
      filterFileRegex: `/^.*STAGE1_TEST_FIXTURE\\.md$/${flag}`, decorations: [{ color: '#ff0000' }]
    };
    const { h, doc, editor } = started('QH_RED', config);
    const right = h.editor(doc); h.show([editor, right]);
    assert.equal(snapshot(right).length, 1);
    for (let i=0;i<4;i++) {
      h.edit(doc, [{ range: new Range(0,0,0,0), text: 'x' }]);
      assert.equal(snapshot(editor).length, 1); assert.deepEqual(snapshot(right), snapshot(editor));
    }
  });
}

test('language change close/open events refresh filters at the same text version', () => {
  const config = defaultConfig();
  config.regexes['(QH_RED)'] = { filterLanguageRegex: '^markdown$', decorations: [{ color: '#fff' }] };
  const { h, doc, editor } = started('QH_RED', config);
  const right = h.editor(doc); h.show([editor,right]);
  h.events.close.fire(doc); doc.languageId = 'javascript'; h.events.open.fire(doc);
  assert.equal(doc.version, 1); assert.deepEqual(snapshot(editor), []); assert.deepEqual(snapshot(right), []);
  h.events.close.fire(doc); doc.languageId = 'markdown'; h.events.open.fire(doc);
  assert.equal(snapshot(editor).length, 1); assert.deepEqual(snapshot(right), snapshot(editor));
});

test('cache context detects a language change before the close/open events are delivered', () => {
  const config = defaultConfig();
  config.regexes['(QH_RED)'] = { filterLanguageRegex: '^markdown$', decorations: [{ color: '#fff' }] };
  const { h, doc, editor } = started('QH_RED', config);
  doc.languageId = 'javascript'; h.show([editor]); assert.deepEqual(snapshot(editor), []);
  doc.languageId = 'markdown'; h.show([editor]); assert.equal(snapshot(editor).length, 1);
});

test('new Options identity invalidates same-version ranges even without an event', () => {
  const { h, editor } = started('QH_RED QH_BLUE');
  h.state.config.regexes = { '(QH_BLUE)': [{ color: '#0000ff' }] };
  const options = h.api.getOptions(); h.api.decorate(editor, options);
  assert.deepEqual(snapshot(editor)[0].ranges, [[0, 7, 0, 14]]);
  options.dispose();
});

test('theme changes repeatedly update filters and nested ThemeColors without leaked generations', () => {
  const config = defaultConfig();
  config.regexes['(QH_RED)'] = { filterThemeRegex: 'Dark', decorations: [{ before: { color: 'theme.editor.foreground', contentText: '>' } }] };
  const { h, editor } = started('QH_RED', config);
  for (let i=0;i<10;i++) {
    h.state.theme = 'Default Light Modern'; h.changeConfig(config, 'workbench.colorTheme');
    assert.deepEqual(snapshot(editor), []); assert.equal(live(h).length, 0);
    h.state.theme = 'Default Dark Modern'; h.changeConfig(config, 'workbench.colorTheme');
    assert.deepEqual(snapshot(editor)[0].style.before.color, { id: 'editor.foreground' });
    assert.equal(live(h).length, 1);
  }
});

test('hidden editor loses disposed styles and returns with the new configuration', () => {
  const { h, doc, editor } = started('QH_RED QH_BLUE');
  const right = h.editor(doc); h.show([editor,right]); h.show([editor]);
  const old = [...live(h)], config = defaultConfig();
  config.regexes = { '(QH_BLUE)': [{ color: '#0000ff' }] }; h.changeConfig(config);
  assert.ok(old.every(type => type.disposed)); assert.deepEqual(snapshot(right), []);
  h.show([editor,right]); assert.deepEqual(snapshot(editor), snapshot(right));
});

test('unrelated configuration events cause neither reads nor allocations', () => {
  const { h, doc, editor } = started();
  doc.reads=[]; const count=h.state.types.length, calls=editor.calls.length;
  h.changeConfig(defaultConfig(), 'editor.fontSize');
  assert.equal(h.state.types.length,count); assert.equal(editor.calls.length,calls); assert.deepEqual(doc.reads,[]);
});

test('extension teardown releases commands, event handlers, all types and cached editor state', () => {
  const { h, doc, editor } = started('QH_RED');
  cleanup(h); cleanup(h);
  assert.equal(h.state.commands.size, 0); assert.equal(live(h).length, 0);
  assert.ok(Object.values(h.events).every(event => event.size === 0));
  assert.ok(h.state.types.every(type => type.disposeCount === 1));
  assert.deepEqual(snapshot(editor), []);
  // Fresh activation in the same module must not reuse a disposed type or cache.
  h.activate();
  assert.equal(snapshot(editor).length, 1); assert.equal(live(h).length, 1);
  h.edit(doc, [{range:new Range(0,0,0,0),text:'x'}]);
  assert.deepEqual(snapshot(editor)[0].ranges, [[0,1,0,7]]);
});
