# Quick Highlight — テスト実行手順

更新日: 2026-10-05 JST。工程2で追加。

## 実行

リポジトリ直下で実行する。Node.js 20以上と、既存の開発依存パッケージを使用する。今回の実行環境は Node.js 24.19.0 / npm 11.9.0。

依存関係がまだなければ:

```powershell
npm install --no-package-lock
```

通常の回帰確認:

```powershell
node --test --test-reporter=tap test/stage2.test.cjs
```

工程2の基準結果は **32件、21合格、11件TODO、通常失敗0、スキップ0、終了コード0**。
TODOは実際にテストを実行して検出した既知の不具合であり、修正済み・全件合格という意味ではない。

修正完了条件を厳密に判定する場合:

```powershell
node test/stage2.test.cjs --strict
```

現行製品では **21合格、11失敗、終了コード1** になる。工程3・4では該当する失敗を解消する。
`known(...)` は、指定IDの付いた受入条件のアサーションに限りTODOとする。依存の読込失敗、予期しない例外、別のアサーション失敗は通常の失敗になる。既知の不具合が解消して予期せず合格した場合も通常モードは失敗し、通常テストへの昇格を促す。

修正したケースは `known(ID, name, message => ...)` から通常の `test(name, () => ...)` に移し、対応する `message` 引数と既知不具合記録を更新する。期待する正しい結果は変更しない。

型とバンドル:

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm run bundle:dev
```

既存 `tsex` のWindows起動問題がある場合のバンドル代替（同じesbuild依存のNode APIを使う）:

```powershell
node -e "require('esbuild').buildSync({entryPoints:['src/index.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],outfile:'dist/index.js'})"
```

## 仕組み

- `test/stage2-support.cjs`: `src/utils.ts`、`src/decoration.ts`、`src/index.ts`を既存esbuildでメモリー上にバンドルする。製品コードを書き換えず、VS Code APIの境界だけを小さな代替実装に接続する。
- `test/stage2.test.cjs`: Node標準テストランナーを使用。各試験は別のモジュール・設定・イベント・キャッシュ状態で実行する。実際の `lomemo`、`mild-map`、`regexp-is-intraline`、`vscode-extras` を使う。
- 編集は旧文書のUTF-16座標から末尾順に適用する。部分更新の結果を、同じ最終文書に対する新規エディタの全文再計算と比較する。初回表示やキャプチャなどには固定座標の期待値も置く。
- 変更行だけの読込とinterlineの全文読込を観測する。実UI描画時間や実Extension Hostの性能測定とは区別する。
- 動的・静的DecorationTypeの生成とdisposeを観測する。GCのタイミングやVS Code内部メモリー使用量は再現しない。
- テスト実行では `dist`、ユーザー設定、通常の作業文書へ書き込まない。製品依存・識別子・公開情報・既存ビルドスクリプトは変更していない。

## 既知の失敗と次工程

| グループ | ケース数 | 受入条件 | 主担当工程 |
|---|---:|---|---|
| QH-01 | 5 | 複数編集後の再走査位置、行移動、複数行貼付け、Redoが全文再計算に一致する | 3 |
| QH-02 | 2 | 同一旧行での複数改行を合算し、下方の装飾が正しい位置になる | 3 |
| QH-03 | 1 | 非表示中に変更された文書を再表示するとキャッシュが更新される | 3 |
| QH-04 | 1 | 同一行への複数編集で重複する装飾範囲を送らない | 3 |
| QH-05 | 2 | 規則削除・設定再構築で不要な静的／動的DecorationTypeをdisposeする | 4 |

通常合格の対象には、LF/CRLF・UTF-16、単一編集、コピー・複製・複数行貼付け、行削除、合成Undo、複数表示エディタ、intraline/interline、設定の色・source・flags・規則増減・enabled・コマンド、言語・ファイル・テーマフィルター、キャプチャ・動的装飾を含む。網羅的な互換性検証は工程6で行う。

## 実機で残す確認

この工程で使う変更イベントは合成データ。`STAGE1_EVENT_LOG.jsonl` は2026-10-05 JSTのDropbox直下一覧に存在しなかったため、実機ログの再生とは呼ばない。

工程3・4の修正後に `STAGE1_PHYSICAL_DEVICE_CHECK.md` の手順を使い、次を確認する。工程2のために同じ実機試験を繰り返す必要はない。

1. 2-1、2-2、2-3: 複数カーソル貼付け、同一行複数改行、Undo/Redo。
2. 3: 同一文書を左右表示し、編集・Undo/Redo・非表示と再表示で一致すること。
3. 4-7: 言語フィルター変更時に、実際の `document.languageId` と有効設定・設定変更イベントを記録する。原報告はok欄と「markdownにしても装飾されない」というメモが食い違うため未確定。`languageId=markdown` を固定した自動試験の合格だけで実機問題の解消としない。
4. 4-1〜4-10: 設定保存直後の反映。再起動・文字編集・タブ切替での回復を区別する。
5. 修正後の起動、見た目、長時間利用、実Extension Hostの性能。工程2では新たに実行していない。

## 参照

- [VS Code API: TextDocumentContentChangeEvent](https://code.visualstudio.com/api/references/vscode-api#TextDocumentContentChangeEvent)
- [VS Code API: TextEditor.setDecorations](https://code.visualstudio.com/api/references/vscode-api#TextEditor)
- [VS Code API: TextEditorDecorationType.dispose](https://code.visualstudio.com/api/references/vscode-api#TextEditorDecorationType)
- [Node.js test runner: TODO tests](https://nodejs.org/api/test.html#todo-tests)

参照確認日: 2026-10-05 JST。TODO試験は実行されるが終了コードに影響しないため、この基盤では上記の限定判定と厳密モードを併用する。
