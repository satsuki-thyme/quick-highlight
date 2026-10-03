# Quick Highlight — Stage 1 Physical Device Check

更新日: 2026-10-04 JST

## 目的

工程1「現状把握と再現」のうち、ChatGPT の実行環境では確認できない VS Code Extension Development Host 上の挙動を固定条件で確認する。

この確認では **Quick Highlight の製品コードは変更しない**。
`STAGE1_LAUNCH_TEST.ps1` が一時テスト用ワークスペースと診断用の小さな補助拡張を `%TEMP%` 以下へ作り、Quick Highlight を Extension Development Host で起動する。

診断補助拡張は次を `STAGE1_EVENT_LOG.jsonl` に記録する。

- `onDidChangeTextDocument` の `contentChanges`
- active / visible editor の変化
- `highlight.*` と `workbench.colorTheme` の設定変更
- VS Code バージョンと開始時設定

製品コードには診断ログを埋め込まない。

---

## 0. 開始前

1. VS Code で `Dropbox\www\studio\Quick-Highlight` を開く。
2. 統合ターミナルを **PowerShell** で開く。
3. 次を実行する。

```powershell
powershell -ExecutionPolicy Bypass -File .\STAGE1_LAUNCH_TEST_WIN.ps1
```

スクリプトは必要なら `npm install --no-package-lock` を実行し、その後 `npm run bundle:dev` を実行する。

新しく **Extension Development Host** が開いたら、そのウィンドウだけで以下の確認を行う。

ワークスペース信頼の確認が出た場合は、今回の一時テストワークスペースを信頼して続行する。

### 起動確認

- [x] Extension Development Host が起動した
- [x] `STAGE1_TEST_FIXTURE.md` が開ける
- [x] `QH_RED` が装飾される
- [x] 小文字の `qh_red` も装飾される
- [x] `QH_BLUE` は初期状態では装飾されない
- [x] `COLOR:#ffcc00` と `COLOR:#00ccff` の色部分が各色で装飾される
- [x] `BEGIN` から `END` までの interline 用ルールが装飾される

結果:

```text
起動確認: ok
メモ:
```

---

## 1. 通常編集

`STAGE1_TEST_FIXTURE.md` を使用する。

### 1-1. 1文字編集

`EDIT_ONE QH_RED` の `EDIT_ONE` 部分に1文字追加する。

期待:
- `QH_RED` の装飾が消えない。
- 他の行の装飾がずれない。

- [x] ok
- [ ] ng

メモ:

```text

```

### 1-2. 行コピー → 貼り付け

`COPY_SOURCE QH_RED` の行全体をコピーし、その直下へ貼り付ける。

期待:
- 元の行と貼り付けた行の両方で `QH_RED` が装飾される。

- [x] ok
- [ ] ng

メモ:

```text

```

### 1-3. 行複製

`DUP_SOURCE QH_RED` の行にカーソルを置き、VS Code の **Copy Line Down**（既定では `Shift+Alt+Down`）を実行する。

期待:
- 複製された行にも即座に装飾される。

- [x] ok
- [ ] ng

メモ:

```text

```

### 1-4. 行移動

`MOVE_SOURCE QH_RED` を **Move Line Up / Down** で上下へ移動する。

期待:
- 移動後も `QH_RED` の装飾が維持される。
- 元の位置に装飾だけが残らない。

- [x] ok
- [ ] ng

メモ:

```text

```

### 1-5. 複数行貼り付け

`PASTE_TARGET` の直後へ次を貼り付ける。

```text
PASTED_A QH_RED
PASTED_B QH_RED
PASTED_C COLOR:#ffcc00
```

期待:
- 3行とも即座に正しい装飾になる。

- [x] ok
- [ ] ng

メモ:

```text

```

---

## 2. 複数変更を1イベントにまとめやすい操作

この節は工程1で特に重要。

### 2-1. 複数カーソル + 複数行貼り付け

1. `MULTI_A` 行にカーソルを置く。
2. `Ctrl+Alt+Down` を2回押し、`MULTI_A` / `MULTI_B` / `MULTI_C` の3行にカーソルを作る。
3. `End` を押す。
4. 次の **2行** を貼り付ける。

```text
 QH_RED
INSERTED QH_RED
```

期待:
- 3箇所すべての新しい `QH_RED` が装飾される。
- 下方にある `AFTER_MULTI QH_RED` の装飾が正しい文字列上に残る。
- 一部だけ未装飾にならない。

- [ ] ok
- [x] ng

メモ:

```text
以下が未装飾

MULTI_C QH_RED
INSERTED QH_RED
```

### 2-2. 同一行の複数カーソル + 改行

`SAME_LINE_LEFT QH_RED | SAME_LINE_RIGHT QH_RED` の行で、`|` の前後2箇所に `Alt+Click` でカーソルを置く。

両方のカーソルで同時に `Enter` を1回押す。

期待:
- その下にある `AFTER_SAME_LINE QH_RED` が正しく装飾されたままになる。
- 装飾位置が1行ずれる、消える、別文字列へ移る、といった現象が起きない。

- [ ] ok
- [ｘ] ng

メモ:

```text
ランダムに装飾位置が1行ずれる、消える、別文字列へ移る、といった現象が起きる。
```

### 2-3. Undo / Redo

2-1 または 2-2 の直後に Undo、その後 Redo を行う。

期待:
- Undo 後も Redo 後も表示とテキストが一致する。
- 再装飾漏れがない。

- [ ] ok
- [x] ng

メモ:

```text
2-2 についてランダムな変化がある。
```

---

## 3. 同一文書・複数 editor と非表示 cache

1. `STAGE1_TEST_FIXTURE.md` を開く。
2. **Split Editor Right** で同じ文書を左右2 editor に表示する。
3. 左側で `QH_RED` を1箇所追加し、左右両方が同じ表示になるか確認する。
4. 右側 editor で `STAGE1_OTHER.md` を開き、右側の `STAGE1_TEST_FIXTURE.md` を非表示にする。
5. 左側の `STAGE1_TEST_FIXTURE.md` に `QH_RED` を追加する。
6. 右側で再び `STAGE1_TEST_FIXTURE.md` を表示する。

期待:
- 左右2 editor の表示が一致する。
- 再表示した側だけ古い装飾状態に戻らない。
- 非表示中に追加した `QH_RED` が再表示側でも装飾される。

- [x] ok
- [ ] ng

メモ:

```text
2-3 を行うと 2-2 部分について左右の表示が異なる場合がある。
```

---

## 4. 設定変更の即時反映

Extension Development Host で **Preferences: Open Workspace Settings (JSON)** を実行する。

テスト用設定は一時ワークスペースの `.vscode/settings.json` にあるため、通常の VS Code ユーザー設定は変更しない。

各項目で、**設定ファイルを保存した直後**の状態を確認する。
テキスト編集、editor 切替、Window Reload をする前にまず観察する。

### 4-1. 色だけ変更

`QH_RED` ルールの:

```json
"backgroundColor": "rgba(255, 0, 0, 0.35)"
```

を:

```json
"backgroundColor": "rgba(0, 255, 0, 0.35)"
```

へ変更して保存する。

期待:
- 保存直後に赤系から緑系へ変わる。

- [x] ok
- [ ] ng
- [ ] 文字を編集すると反映
- [ ] editor を切り替えると反映
- [ ] Window Reload / 再起動でのみ反映

メモ:

```text

```

### 4-2. regex source 変更

設定キー:

```json
"(QH_RED)"
```

を:

```json
"(QH_BLUE)"
```

へ変更して保存する。

期待:
- `QH_RED` の装飾が消える。
- `QH_BLUE` が装飾される。

- [x] ok
- [ ] ng

メモ:

```text

```

変更後、キーを `(QH_RED)` に戻して保存する。

### 4-3. regex flags 変更

トップレベルの:

```json
"highlight.regexFlags": "gi"
```

を:

```json
"highlight.regexFlags": "g"
```

へ変更する。

期待:
- 大文字 `QH_RED` は装飾される。
- 小文字 `qh_red` は装飾されなくなる。

- [x] ok
- [ ] ng

確認後 `"gi"` に戻す。

### 4-4. rule 追加

`highlight.regexes` に次を追加する。

```json
"(QH_BLUE)": [
  {
    "backgroundColor": "rgba(0, 80, 255, 0.35)"
  }
]
```

期待:
- 保存直後に `QH_BLUE` が装飾される。

- [x] ok
- [ ] ng

### 4-5. rule 削除

4-4 で追加した `(QH_BLUE)` ルールを削除して保存する。

期待:
- 保存直後に `QH_BLUE` の装飾が消える。

- [x] ok
- [ ] ng

### 4-6. enabled

```json
"highlight.enabled": true
```

を `false` にして保存し、その後 `true` に戻す。

期待:
- `false` で全装飾が消える。
- `true` に戻すと全装飾が再表示される。
- どちらも Window Reload 不要。

- [x] ok
- [ ] ng

メモ:

```text

```

### 4-7. filterLanguageRegex

`(QH_RED)` ルールを配列形式から次のオブジェクト形式へ一時変更する。

```json
"(QH_RED)": {
  "filterLanguageRegex": "^javascript$",
  "decorations": [
    {
      "backgroundColor": "rgba(255, 0, 0, 0.35)",
      "fontWeight": "bold"
    }
  ]
},
```

現在のファイルは Markdown なので、期待は `QH_RED` が消えること。

その後 `filterLanguageRegex` を:

```json
"^markdown$"
```

に変更する。

期待:
- 保存直後に `QH_RED` が再表示される。

- [x] ok
- [ ] ng

メモ:

``` text
markdown に変更しても装飾されないが、行 "filterLanguageRegex": "^markdown$", を削除すると装飾される。
```

### 4-8. filterFileRegex

同じ `(QH_RED)` ルールで:

```json
"filterFileRegex": "DOES_NOT_MATCH$",
```

を追加する。

期待:
- `QH_RED` が消える。

次に:

```json
"filterFileRegex": "STAGE1_TEST_FIXTURE\\.md$",
```

へ変更する。

期待:
- `QH_RED` が再表示される。

- [x] ok
- [ ] ng

### 4-9. theme 変更

`filterLanguageRegex` / `filterFileRegex` を削除して通常状態へ戻したあと、VS Code の **Preferences: Color Theme** から別テーマへ変更し、その後元へ戻す。

期待:
- 変更時に装飾が消えたり重複したりしない。

- [x] ok
- [ ] ng

メモ:

```text

```

### 4-10. 動的 `$1` / `$2` decoration

`COLOR:#ffcc00` の `#ffcc00` を `#ff00ff` に書き換える。

期待:
- 色部分の背景色が新しい色へ即座に変わる。

その後、`COLOR` ルールの decoration 設定を別の値へ変更して保存する。

期待:
- 設定変更後も新しい decoration が即時反映される。
- 古い色や decoration が残らない。

- [x] ok
- [ ] ng

メモ:

```text

```

---

## 5. 実 Extension Host 上の簡易性能確認

1. `STAGE1_PERF_FIXTURE.txt` を開く。
2. Workspace Settings で:

```json
"highlight.debugging": true
```

に変更する。
3. 保存直後に Quick Highlight が表示する情報メッセージを記録する。
4. `STAGE1_PERF_FIXTURE.txt` の任意の1行で1文字だけ編集し、情報メッセージを記録する。
5. 1文字編集を合計5回行う。

記録する値:

```text
初回/全体再装飾:
例: 12.34ms - 10000 lines - 20000 decorations - ...

1.14ms - 38 lines - 4 decorations - 2 intralines - 1 interlines
1.14ms - 38 lines - 4 decorations - 2 intralines - 1 interlines
1.14ms - 38 lines - 4 decorations - 2 intralines - 1 interlines

1行編集 1:1.14ms - 38 lines - 4 decorations - 2 intralines - 1 interlines
7.94ms - 10001 lines - 30000 decorations - 2 intralines - 1 interlines
1行編集 2:6.65ms - 10001 lines - 30000 decorations - 2 intralines - 1 interlines
1行編集 3:7.48ms - 10001 lines - 30000 decorations - 2 intralines - 1 interlines
1行編集 4:5.67ms - 10001 lines - 30000 decorations - 2 intralines - 1 interlines
1行編集 5:5.28ms - 10001 lines - 30000 decorations - 2 intralines - 1 interlines
```

体感:

- [x] 入力遅延を感じない
- [ ] 少し感じる
- [ ] 明確に感じる
- [ ] 操作困難

メモ:

```text

```

確認後 `highlight.debugging` は `false` に戻してよい。

---

## 6. 終了時

テスト中のイベントは Quick Highlight リポジトリ直下の:

```text
STAGE1_EVENT_LOG.jsonl
```

へ自動記録される。

**このファイルは削除せず、そのまま残す。**
Dropbox 同期後、ChatGPT がチェック結果と event log を照合して工程1の完了判定を行う。

最後にこのファイルへ次を記入する。

```text
実施日: 2026-10-04
VS Code version:
  1.140.0
  07f806f999227108933c2e30515b26eecc1fda74
  x64
OS:
  エディション	Windows 11 Pro
  バージョン	26H2
  インストール日	‎2024-‎11-‎22
  OS ビルド	26300.9550
  エクスペリエンス	Windows 機能エクスペリエンス パック 1000.26100.372.0
総評: いつもの感じだった。
特に再現した不具合: 改行した際に表示がおかしくなるところ。
再現しなかった不具合: 気にならなかった。
その他:
```

工程1の確認が終わるまでは、Quick Highlight の製品コードを手で修正しない。
