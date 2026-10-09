# Quick Highlight — テスト実行手順

更新日: 2026-10-08 JST。工程2で追加し、工程3・4で更新。

## 実行

リポジトリ直下で実行する。Node.js 20以上と、既存の開発依存パッケージを使用する。今回の実行環境は Node.js 24.19.0 / npm 11.9.0。

依存関係がまだなければ:

```powershell
npm install --no-package-lock
```

通常の回帰確認:

```powershell
node --test --test-reporter=tap test/stage2.test.cjs test/stage3.test.cjs test/stage4.test.cjs
```

現行の工程4基準は **66件、66合格、失敗0、TODO0、スキップ0、終了コード0**。工程3の44件（42合格・2 TODO）からQH-05の2件を通常試験へ昇格し、22件を追加した。`node test/stage2.test.cjs --strict` も32件全合格で終了コード0となる。現在は既知失敗の例外処理がないため、すべてのアサーション失敗が通常の失敗になる。

新しい22件を工程3の未修正ソースと同じAPI代替境界へ接続した比較は4合格・18失敗。工程4では22件すべて合格。正規表現不正・装飾寿命・設定世代・言語変更などの問題を検出することを確認した。

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
- `test/stage4.test.cjs`: 設定の30回反復、動的規則の削除・再追加20回、テーマ往復10回、無効化、無効設定からの復帰、文書言語変更、動的文字列のエスケープ、g/yフィルター、終了時の解放など22件。
- `test/stage3.test.cjs`: 混合編集、再走査の重複除去、古いキャッシュの復帰、版の欠落、同一URIの文書交換、表示イベントと変更イベントの順序、繰り返しUndo/Redo、動的装飾・interline、LF/CRLF各200回の決定的な連続編集を追加。連続編集では製品の再走査コードと独立した文字列検索で正しい装飾位置を求める。
- `test/stage2.test.cjs`: Node標準テストランナーを使用。各試験は別のモジュール・設定・イベント・キャッシュ状態で実行する。実際の `mild-map`、`regexp-is-intraline`、`vscode-extras` を使う。工程4でモジュール全体に残るmemoizeを製品コードから除き、型の所有範囲を設定の世代へ限定した。依存定義自体は変更していない。
- 編集は旧文書のUTF-16座標から末尾順に適用する。部分更新の結果を、同じ最終文書に対する新規エディタの全文再計算と比較する。初回表示やキャプチャなどには固定座標の期待値も置く。
- 変更行だけの読込とinterlineの全文読込を観測する。実UI描画時間や実Extension Hostの性能測定とは区別する。
- 動的・静的DecorationTypeの生成とdisposeを観測する。GCのタイミングやVS Code内部メモリー使用量は再現しない。
- テスト実行では `dist`、ユーザー設定、通常の作業文書へ書き込まない。製品依存・識別子・公開情報・既存ビルドスクリプトは変更していない。

## 既知の失敗と次工程

| グループ | ケース数 | 受入条件 | 現在の状態 |
|---|---:|---|---|
| QH-01 | 5 | 複数編集後の再走査位置、行移動、複数行貼付け、Redoが全文再計算に一致 | 工程3で修正・通常合格 |
| QH-02 | 2 | 同一旧行での複数改行を合算し、下方の装飾位置を維持 | 工程3で修正・通常合格 |
| QH-03 | 1 | 非表示中に変わった文書を再表示すると更新 | 工程3で修正・通常合格 |
| QH-04 | 1 | 同一行への複数編集で装飾範囲を重複させない | 工程3で修正・通常合格 |
| QH-05 | 2 | 不要な静的／動的DecorationTypeをdisposeする | 工程4で修正・通常合格 |


通常合格の対象には、LF/CRLF・UTF-16、単一編集、コピー・複製・複数行貼付け、行削除、合成Undo、複数表示エディタ、intraline/interline、設定の色・source・flags・規則増減・enabled・コマンド、言語・ファイル・テーマフィルター、キャプチャ・動的装飾を含む。網羅的な互換性検証は工程6で行う。

## 実機確認の結果と残る確認

この工程で使う変更イベントは合成データ。`STAGE1_EVENT_LOG.jsonl` は2026-10-05 JSTのDropbox直下一覧に存在しなかったため、実機ログの再生とは呼ばない。

工程3は2026-10-05 JSTに完了。`STAGE3_PHYSICAL_DEVICE_CHECK.md` の利用者報告で起動・3項目すべてok、Undo/Redo約10回を確認した。現行ソース・テスト・package・起動スクリプトの計11件は自動検証済み版のSHA-256と一致した。詳細は `STAGE3_COMPLETION.md`。今回は記録と現行内容の照合であり、自動試験を再実行した結果ではない。

`STAGE3_LAUNCH_TEST_WIN.ps1` は毎回独立した一時環境を作成し、前回データ・通常設定を保持する。ソースハッシュと版情報は一時環境の `RUN_INFO.json` に保存するが、イベントログではない。そのファイルは未取得のため実行時のNode・VS Code版番号、ソース・バンドルハッシュは未照合。以下は工程3で確認した範囲と後続工程へ残す範囲。

1. 2-1、2-2、2-3相当: 工程3の実機確認1・2として複数カーソル貼付け、同一行複数改行、Undo/Redoを確認済み。原報告は保持する。
2. 3相当: 工程3の実機確認3として同一文書の左右表示、編集・Undo/Redo・非表示からの復帰の一致を確認済み。
3. 4-7: 言語フィルター変更時に、実際の `document.languageId` と有効設定・設定変更イベントを記録する。原報告はok欄と「markdownにしても装飾されない」というメモが食い違うため未確定。`languageId=markdown` を固定した自動試験の合格だけで実機問題の解消としない。
4. 4-1〜4-10: 設定保存直後の反映。再起動・文字編集・タブ切替での回復を区別する。
5. 工程3の起動・指定3項目の表示は利用者報告で確認済み。長時間利用、実Extension Hostの性能・UI遅延測定、広範な互換性は後続工程で確認する。AI自身による実機観察とは区別する。

## 参照

- [VS Code API: TextDocumentContentChangeEvent](https://code.visualstudio.com/api/references/vscode-api#TextDocumentContentChangeEvent)
- [VS Code API: TextEditor.setDecorations](https://code.visualstudio.com/api/references/vscode-api#TextEditor)
- [VS Code API: TextEditorDecorationType.dispose](https://code.visualstudio.com/api/references/vscode-api#TextEditorDecorationType)
- [Node.js test runner: TODO tests](https://nodejs.org/api/test.html#todo-tests)

参照確認日: 2026-10-05 JST。TODO試験は実行されるが終了コードに影響しないため、この基盤では上記の限定判定と厳密モードを併用する。

## 工程3の測定範囲

100行・1規則の単一行編集は、修正前後とも変更1行だけを読む。同一行2箇所と離れた1行を編集する例は、3回の行読込から2回へ減る。古い非表示キャッシュの復帰は、そのエディタに限り全文を1回読み直す。文書の同じ版を再表示しても追加走査しない。

これらは合成文書で観測した読込量であり、VS Codeの実描画時間や入力遅延の改善率ではない。文書版に連続性がない場合も古い座標を使わず再構築する。通常のintraline編集は部分再走査を維持する。範囲シフト表は既存の行単位の形式を保ち、広い変更間隔のコスト最適化は工程5で測定する。

## 工程4の実機手順と測定範囲

`powershell -ExecutionPolicy Bypass -File .\STAGE4_LAUNCH_TEST_WIN.ps1` で起動し、`STAGE4_PHYSICAL_DEVICE_CHECK.md` を使う。試験用F6コマンドで12段階の設定を保存する。`test/stage4-dev-entry.ts` は試験用バンドルだけに含まれ、製品の `src/index.ts` には診断コマンド・本文記録・外部通信を追加していない。

`test/stage4-prepare.cjs` が毎回新しい一時環境を作り、実ソースとバンドルのハッシュ・版番号を `RUN_INFO.json` に記録する。実行時には設定イベントと有効設定・言語IDを `RUN_EVENTS.jsonl` に記録する。AI環境では生成・型検査・バンドルまで確認。Windows実行と見た目は未確認。

100行・1規則の通常編集は設定再構築後も変更1行だけを読む。無関係な設定変更は走査・型生成とも0。設定変更時は表示中の各エディタを再走査する。30回設定を変えた試験で有効な静的型は常に1、無効化・終了時は0。動的型も設定削除時は0となる。

同じ設定のまま異なる動的値を大量に入力した場合、解決済みのスタイルは設定の世代内でキャッシュされる。世代をまたぐ残留は解消したが、このキャッシュの上限・編集に伴う回収は工程5で測定・検討する。実Extension Hostのメモリー量やUI遅延は未測定。

元ファイルの改名バックアップは `*.backup-*` として保持し、`tsconfig.json`、`.gitignore`、`.vscodeignore` でビルド・追跡・配布から除外する。試験コードの実行は上記のファイルを明示したコマンドを使う。
