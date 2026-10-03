# Quick Highlight — Stage 1 Analysis

更新日: 2026-10-04 JST

## 状態

**工程1「現状把握と再現」: 進行中**

静的解析、上流事例の照合、変更範囲ロジックの合成再現、コア処理の簡易ベンチマークまで実施した。

VS Code Extension Development Host をこの実行環境から起動できないため、実機上の最終再現だけ未完了。製品コードは変更していない。

## 参照した現行情報

- `MGMT.md`
- `PROCESS_CHART.md`
- `package.json`
- `src/index.ts`
- `src/decoration.ts`
- `src/utils.ts`
- `src/commands.ts`
- `src/types.ts`
- `src/constants.ts`
- `Dropbox\ai\etc\sources.md`
- GitHub `satsuki-thyme/Quick-Highlight` の現行ソース・最新コミット
- フォーク元 `fabiospampinato/vscode-highlight` の既存 issue
- VS Code Extension API の現行仕様
- `vscode-extras`, `mild-map`, `lomemo` の実装

## 1. 現行処理フロー

### 起動

`src/index.ts`

1. `getOptions()` で設定を読む。
2. visible editor を `decorateAll(options)` で装飾する。
3. 次のイベントを購読する。
   - `onDidChangeActiveTextEditor`
   - `onDidChangeVisibleTextEditors`
   - `onDidChangeTextDocument`
   - `onDidChangeConfiguration`

### テキスト変更

`onDidChangeTextDocument` は、変更された `TextDocument` を現在表示している editor だけを取得する。

`getChange(event.contentChanges)` で次を生成する。

- `rangesPrev`: 変更前に無効化すべき行範囲
- `rangesNext`: 変更後に再走査すべき行範囲
- `shifts`: 変更前 Range を変更後位置へずらす行シフト表

その後、各 visible editor へ `decorate(editor, options, change)` を行う。

### intraline 正規表現

前回キャッシュが存在する場合:

- `rangesNext` だけ正規表現を再評価する。
- `rangesPrev` と交差しない既存 Range は保持する。
- 行増減があれば `shifts` で既存 Range をずらす。
- 最後に DecorationType ごとの Range 配列を `setDecorations` し直す。

### interline 正規表現

変更のたびに文書全体を再走査する。

### 設定変更

`onDidChangeConfiguration` で `highlight` または `workbench.colorTheme` が変わった場合:

1. `undecorateAll()`
2. `options = getOptions()`
3. `decorateAll(options)`

という流れになっている。

`vscode-extras` の `getConfig` 自体はキャッシュせず、その都度 VS Code の configuration API を読む。

---

## 2. 編集後に装飾が失われる問題

### 発見 A: 複数変更時の `rangesNext` が最終座標へ変換されない

**確度: 高**

`getChangeRangesNext` は、各 `TextDocumentContentChangeEvent.range.start.line` をそのまま変更後範囲の開始行として使っている。

しかし、一つの `TextDocumentChangeEvent` に複数の変更が含まれ、先行する変更で行数が増減した場合、後続の変更位置は最終文書上では移動する。

現行コードは、その行シフトを「古い装飾 Range の保持」には使うが、`rangesNext` 自体には適用していない。

### 合成再現

変更前:

```text
0: AAA
1: BBB
2: CCC
3: DDD
4: EEE
```

同じ transaction 内で、旧 line 1 と旧 line 3 にそれぞれ改行を挿入する。

現行計算:

```text
rangesNext:
1..2
3..4
```

ところが最初の挿入により旧 line 3 は最終文書では line 4 に移るため、2つ目の実際の再走査対象は:

```text
4..5
```

である。

そのため最終 line 5 が再走査されず、変更された位置の装飾が欠ける可能性がある。

### 影響しやすい操作

- 複数カーソル編集
- 複数箇所への貼り付け
- 行移動
- 一部の「行複製」操作
- formatter
- import sorter
- refactoring
- `WorkspaceEdit` で複数編集を一括適用する拡張機能
- Undo / Redo で複数変更が一つの event にまとまる場合

単一箇所の単純な文字入力や単一貼り付けは、この問題だけでは通常壊れない。

---

## 3. 行シフト表の問題

### 発見 B: 同じ shift line に複数変更があると後の値で上書きされる

**確度: 高**

`getChangeShiftMap` は現在:

```ts
shifts[shiftLine] = linesShift;
```

としている。

同じ行位置で複数の変更が行数を増減させた場合、本来は合計する必要があるが、現行コードは最後の値だけを残す。

例:

- 同じ旧 line の2箇所へ、それぞれ1行ずつ増える編集
- 本来: その下の Range は `+2`
- 現行: `+1`

この場合、保持した既存装飾 Range が誤った行へ移動する。

---

## 4. 非表示 editor のキャッシュ

### 発見 C: 非表示中に文書が変わると古いキャッシュを再利用する経路がある

**確度: 中〜高**

テキスト変更時は:

```ts
vscode.window.visibleTextEditors
```

に存在する editor だけを再装飾する。

一方 `decorateWithoutProfiler` は、`change` が無くキャッシュが存在すると:

```ts
if ( !change && highlightsPrev ) return 0;
```

で即終了する。

したがって次の条件で古いキャッシュを再利用する可能性がある。

1. editor A に装飾キャッシュがある。
2. editor A が非表示になる。
3. 同じ document が別 editor や別処理から変更される。
4. editor A は visible ではないためキャッシュが更新されない。
5. editor A が再表示される。
6. `onDidChangeVisibleTextEditors` → `decorate(editor, options)`。
7. `change` 無し + cache 有りなので何も再計算しない。

複数 editor・タブ切替の回帰試験に含めるべき。

---

## 5. 設定変更が再起動まで反映されない問題

### 現時点の結論

**単純な設定再読込経路そのものは存在し、静的解析だけでは「常に反映されない」原因は確認できなかった。**

`onDidChangeConfiguration` は存在し、変更時に:

- 旧装飾を外す
- `getOptions()` で設定を読み直す
- visible editor を再装飾する

という処理になっている。

また、`vscode-extras#getConfig` は設定値を内部キャッシュしていない。

したがって、工程4で単純に「設定変更イベントを追加する」だけでは根本修正にならない可能性が高い。

### 発見 D: DecorationType が一度も `dispose()` されない

**確度: 高**

`getDecoration()` は `createTextEditorDecorationType()` で DecorationType を生成する。

しかし現行コードでは:

- `setDecorations(type, [])` は行う
- `type.dispose()` は行わない

VS Code API 上、`TextEditorDecorationType.dispose()` は DecorationType と全 editor 上のその装飾を破棄するための API である。

設定を繰り返し変更すると、以前の設定用 DecorationType が残り続ける。

### 発見 E: 動的 decoration のメモ化が無期限

**確度: 高**

`$0`, `$1` 等を含む動的 decoration は、match 内容ごとに `TextEditorDecorationType` を生成し `lomemo` の Map に保持する。

`lomemo` の cache は通常の `Map` であり、自動削除されない。

現在は:

- unique match ごとに DecorationType が増える
- 設定変更後も古い memo cache が残る
- DecorationType も dispose されない

という構造。

これは再起動すると解消される種類の状態であり、「長時間利用後または設定編集後に再起動すると直る」症状の強い候補。

ただし、ユーザーが報告した設定反映不良と同一原因かは Extension Development Host での再現確認が必要。

### 発見 F: `options` が editor/resource 非依存

**確度: 中**

`getOptions()` は resource URI や languageId を渡さず一つの `options` を生成し、全 editor で共有する。

workspace-folder 固有設定や language override を利用した場合には、editor ごとの effective configuration と一致しない可能性がある。

今回の報告が通常の user settings だけで起きるなら主原因ではない。

---

## 6. 性能構造

### intraline の利点

intraline 正規表現では、正規表現評価そのものは原則として変更行だけに限定される。

これは残すべき既存最適化。

### 残る O(N) 処理

一方、部分再装飾でも既存の全 decoration Range を走査する。

現在は各編集で:

1. 既存 Range を全件 filter
2. 必要なら全保持 Range を shift
3. DecorationType ごとに全 Range 配列を `setDecorations`

する。

そのため正規表現の再走査量が小さくても、装飾総数 N が大きいと編集コストは O(N) に近づく。

動的 decoration では DecorationType の種類数自体も大きくなりうる。

---

## 7. 合成ベンチマーク

環境:

- Node.js 22.16.0
- VS Code API 呼び出しを含まない
- 現行デフォルトの TODO / FIXME 正規表現を使用
- 3,000行
- 約80,862文字
- 450 match
- 900 capture range

結果:

| 処理 | 合成測定値 |
|---|---:|
| 文書全体をデフォルト2 regex で走査 | 約 0.54 ms / 回 |
| 変更1行だけを2 regex で走査 | 約 2.37 µs / 回 |
| 30,000 cached range の保持走査 | 約 0.68〜0.72 ms / 回 |

Range 保持処理の簡易スケーリング:

| cached ranges | 保持走査 |
|---:|---:|
| 1,000 | 約 0.008 ms |
| 10,000 | 約 0.114 ms |
| 30,000 | 約 0.681 ms |
| 100,000 | 約 2.31 ms |

### 注意

これは VS Code の:

- `Range.intersection`
- `TextEditor.setDecorations`
- Extension Host ↔ editor の通信
- 実レンダリング

を含まない。

したがって製品の実時間ではない。

ただし「正規表現を1行だけ走査するコスト」より「大量の既存装飾を保持・再送するコスト」が支配的になりうる構造は確認できる。

---

## 8. 工程2で必ず自動化するテスト

優先度 A:

1. 同一 transaction 内の複数改行挿入
2. 同じ shift line に複数変更
3. 行移動相当の delete + insert
4. 複数箇所 paste
5. Undo / Redo の複数変更
6. 非表示 editor → document change → 再表示
7. 設定変更後の旧 cache 消去
8. DecorationType の生成・破棄数
9. 動的 `$0` `$1` decoration の cache 寿命

優先度 B:

10. 同一行挿入・削除
11. 単一行 paste
12. 複数行 paste
13. 行複製
14. 同一 document の複数 visible editor
15. intraline / interline の混在
16. `filterFileRegex`
17. `filterLanguageRegex`
18. `filterThemeRegex`

---

## 9. 実機再現マトリクス

工程1完了判定のため、Extension Development Host では次を固定条件で確認する。

### 編集系

- 単純な1文字入力
- 1行コピー → 1箇所貼り付け
- 行複製
- 行を上へ移動
- 行を下へ移動
- 複数行貼り付け
- 複数カーソルで同時貼り付け
- Undo
- Redo
- formatter 実行
- 同じ document を2 editor で表示し片側で編集

### 設定系

装飾済みの文書を開いた状態で:

1. 色だけ変更
2. regex source 変更
3. regex flags 変更
4. rule の追加
5. rule の削除
6. `enabled` true → false → true
7. `filterLanguageRegex` 変更
8. `filterFileRegex` 変更
9. theme 変更
10. 動的 `$1` decoration の設定変更

各操作について:

- 保存直後に反映するか
- 文字を追加しないと反映しないか
- editor を切り替えると反映するか
- Window Reload / VS Code 再起動でだけ直るか

を記録する。

---

## 10. 工程1の残件

この実行環境には VS Code GUI / Extension Development Host がないため、次だけ未検証。

- ユーザー報告と同一条件での設定反映不良の実機再現
- 通常の1行コピー／行複製が単独でも失敗するか
- VS Code が各操作で実際に生成する `contentChanges` の実データ採取
- `setDecorations` を含む実 Extension Host 上の性能値

その他のコード経路、原因候補、合成再現、性能測定基準は整理済み。

## 現在地

工程1は **コード解析・合成再現まで完了、実機再現待ち**。

工程2へはまだ進めず、実機 event log を一度取得してからテスト仕様を固定するのが安全。
