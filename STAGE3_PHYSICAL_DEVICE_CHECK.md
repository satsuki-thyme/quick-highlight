# Quick Highlight — 工程3 実機確認

作成日: 2026-10-05 JST。状態: **実施済み・全項目ok（利用者報告）**。

2026-10-05 JST: 記入済みの結果と現行ソースを照合し、工程3を完了判定。`STAGE3_COMPLETION.md` を参照。以下の結果・試験日・試験フォルダー・追伸は利用者の記入を保持する。

工程3の修正箇所だけを確認する。前回の工程1報告はそのまま保存し、設定変更・言語フィルターの再確認は工程4で行う。

## 起動

`Dropbox\www\studio\Quick-Highlight` で、工程3パッチをまだ適用していない場合:

```powershell
git apply STAGE3_UPDATE.patch
```

エラーが出た場合はそこで止め、表示内容を知らせる。既存変更と衝突した場合も、強制上書き・`--reject`・`git reset --hard` は使わない。

適用後に起動:

```powershell
powershell -ExecutionPolicy Bypass -File .\STAGE3_LAUNCH_TEST_WIN.ps1
```

毎回新しい一時フォルダーにテスト環境を作る。工程1のデータや既存の試験ウィンドウは削除しない。通常のVS Code設定にも書き込まない。依存不足と表示された場合だけ、リポジトリ直下で `npm install --no-package-lock` を実行してから再実行する。

開いた **Extension Development Host** の `STAGE3_TEST_FIXTURE.md` を使う。信頼確認が表示された場合は、この生成されたテスト用ワークスペースを信頼する。初めに `AFTER_MULTI QH_RED` などの `QH_RED` に背景色が付くことを確認する。付かない場合は以降を進めず記録する。

作成時点ではAI環境にPowerShell・VS Code本体がなくWindows実行は未検証だった。2026-10-05の利用者報告で起動okを確認した。

## 結果の記入

試験日: 2026-10-05

起動結果（ok / ng）: ok

コンソールに表示された `Stage 3 test directory`: C:\Users\camellia\AppData\Local\Temp\quick-highlight-stage3-dea66aa78257431cb7df10db35c34336

同フォルダーの `RUN_INFO.json` にNode・VS Codeの版と実際にビルドしたソースのSHA-256が残る。問題があれば結果と一緒に提示する。テキスト編集イベントのログではない。

| 確認 | 結果（ok / ng） | メモ |
|---|---|---|
| 1. 複数カーソル貼付け・Undo/Redo | ok | |
| 2. 同一行の複数改行・Undo/Redo | ok | |
| 3. 左右表示・非表示からの復帰 | ok | |

追伸: Undo/Redo は10回くらいやった。

### 1. 複数カーソル貼付け・Undo/Redo

1. `MULTI_A`、`MULTI_B`、`MULTI_C` の各行末に `Alt+Click` で3つのカーソルを置く。
2. 次の2行を、先頭の空白も含めてコピーし、一度に貼り付ける。

```text
 QH_RED
INSERTED QH_RED
```

3. 各追加行と `AFTER_MULTI QH_RED` のすべてに背景色が付くことを確認する。
4. Undo、その後Redoを行い、どちらでも文字と装飾が一致することを確認する。

### 2. 同一行の複数改行・Undo/Redo

1. `SAME_LINE_LEFT QH_RED | SAME_LINE_RIGHT QH_RED` の `|` の直前・直後に2つのカーソルを置く。
2. Enterを1回押す。
3. 分割した行と、その下の `AFTER_SAME_LINE QH_RED` の装飾がずれないことを確認する。
4. Undo、その後Redoを行い、同じ状態を維持できることを確認する。

### 3. 左右表示・非表示からの復帰

1. **Split Editor Right** で同じファイルを左右に表示する。
2. 左側で確認1または2のUndo/Redoを行い、左右の装飾が一致することを確認する。
3. 右側で `STAGE3_OTHER.md` を開く。
4. 左側の `TAIL QH_RED` をコピーして新しい行に貼り付ける。
5. 右側を元のファイルへ戻し、追加した行も含めて左右が一致することを確認する。

2026-10-05に「工程3の実機確認を書いた」との報告を受け、反映内容・結果を照合して工程3を完了判定した。次の工程4は高性能モデル／高推論モードを推奨。
