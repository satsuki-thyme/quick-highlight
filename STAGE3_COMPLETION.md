# Quick Highlight — 工程3 完了判定

判定日: 2026-10-05 JST。

**工程3「再装飾の正しさ修正」は完了。次は工程4「設定変更の即時反映」。**

## 判定根拠

2026-10-05の `STAGE3_PHYSICAL_DEVICE_CHECK.md` と、現行のDropboxソース・テスト・自動検証記録を照合した。

| 確認 | 結果 |
|---|---|
| 起動 | 利用者報告: ok |
| 複数カーソル貼付け・Undo/Redo | 利用者報告: ok |
| 同一行の複数改行・Undo/Redo | 利用者報告: ok |
| 左右表示・非表示からの復帰 | 利用者報告: ok |
| 反復操作 | 利用者の追伸: 「Undo/Redo は10回くらいやった。」 |
| 現行ファイルと検証済み版の照合 | 製品ソース6件、テスト3件、package、起動スクリプトの計11件でSHA-256が一致 |
| 自動検証の原記録 | 44件中42合格・2 TODO・通常失敗0・スキップ0、終了コード0 |
| 厳密モードの原記録 | 30合格・2失敗、終了コード1。工程4のQH-05のみ |

実機報告の試験日は2026-10-05。記録された試験フォルダー:

`C:\Users\camellia\AppData\Local\Temp\quick-highlight-stage3-dea66aa78257431cb7df10db35c34336`

QH-01〜QH-04の9件と追加12試験の合格、通常intralineの部分走査維持は `STAGE3_RESULTS.json` と `STAGE3_ACCEPTANCE.md` の既存記録による。今回、製品コードは変更せず、同じ自動試験を再実行していない。利用者報告をAI自身のWindows実行・画面観察と置き換えない。

## 完了条件との対応

| 工程3の完了条件 | 根拠 |
|---|---|
| コピー・貼付け・移動・複製・通常編集後の装飾 | 関連自動試験と今回の実機確認1・2 |
| Undo/Redo後の正しさ | 自動試験と実機確認1・2・3、約10回の操作報告 |
| 複数エディタの一致 | キャッシュ復帰などの自動試験と実機確認3 |
| intralineの部分更新維持 | 検証済みソースとの一致、通常編集は1行読込の測定記録 |
| 工程2の関連試験が合格 | QH-01〜QH-04の9件が通常テストに昇格。残るQH-05の2件は工程4 |

## 未取得事項と後続工程

- `RUN_INFO.json` は未取得。実行時のNode・VS Code版番号、ソース・バンドルハッシュは未照合。現行Dropboxソースの一致と、実行時ファイルそのものの一致は区別する。今回の3項目にngや矛盾はないため、これだけを理由に合格済み試験のやり直しは求めない。
- 実機の変更イベントログは未取得。合成データによる自動試験を実機ログの再生とは扱わない。
- 工程4: QH-05の静的・動的DecorationTypeの解放、設定変更の即時反映、言語フィルター4-7の未確定な実機結果。
- 工程5・6: 大規模文書、多数規則、非globalを含む網羅的な互換性、長時間利用、実Extension Hostの性能とUI遅延。

## 記録更新の反映

完了記録は本ファイル。管理文書5件の更新は `STAGE3_COMPLETION_MANAGEMENT.patch` として提供する。Dropbox連携には既存ファイルをその場で更新する機能がなく、プロジェクト指示はGit管理下への独自バックアップ作成を禁止しているため、既存文書を改名・削除せずGit適用用の差分にした。**パッチ提供と、利用者の既存管理文書への反映は区別する。**

| 更新対象 | 内容 |
|---|---|
| `MGMT.md` | stage 3とコピーなどで装飾が失われる問題の解消を完了にする |
| `PROCESS_CHART.md` | 工程3完了、工程4への引継ぎと実行指示 |
| `STAGE3_ACCEPTANCE.md` | 完了根拠を追記、実装パッチ手順を履歴として明示 |
| `TESTING.md` | 実機の確認済み範囲と後続工程の未確認範囲を整理 |
| `STAGE3_PHYSICAL_DEVICE_CHECK.md` | 冒頭の「未実施」を修正。利用者の結果欄・試験日・試験フォルダー・追伸はそのまま保持 |

`STAGE3_RESULTS.json`、工程1・2の原記録、`STAGE3_UPDATE.patch`、`Quick-Highlight-STAGE3-REPORT-2026-10-05.md` は実装時点の履歴として変更しない。これらの当時の「未実施」等を現在の工程状態と取り違えない。最新版の判定は本ファイルを参照する。

Dropbox同期後、`Dropbox\www\studio\Quick-Highlight` で一度だけ実行:

```powershell
git apply STAGE3_COMPLETION_MANAGEMENT.patch
```

このパッチは管理文書だけを変更する。工程3の実装パッチを再適用する必要はない。衝突エラーが出たら適用せず、エラー内容を知らせる。`--reject`、強制上書き、`git reset --hard` は使わない。適用後は `git diff --check` と `git diff -- MGMT.md PROCESS_CHART.md STAGE3_ACCEPTANCE.md TESTING.md STAGE3_PHYSICAL_DEVICE_CHECK.md` で確認できる。追跡前のファイルは `git status --short` と実ファイルを確認する。commit・push・公開は行わない。

管理更新パッチの検証: 現行17ファイルのスナップショットに対する適用と期待内容の一致、実機記入欄の保持、再適用の拒否、競合時の全体非適用を確認した。製品ソース・テスト・package・起動スクリプト・自動検証結果は変化しない。

## 次の実行指示

推奨: 高性能モデル／高推論モード。

> `Dropbox\www\studio\Quick-Highlight` の工程4「設定変更の即時反映」を実行してください。最初に最新の `MGMT.md`、`PROCESS_CHART.md`、`STAGE3_COMPLETION.md`、`STAGE3_ACCEPTANCE.md`、`STAGE3_PHYSICAL_DEVICE_CHECK.md`、`STAGE3_RESULTS.json`、`TESTING.md` と現行ソース・未コミット差分を確認してください。工程3は2026-10-05 JSTに、検証済み版との11ファイルのSHA-256一致と、起動・実機3項目すべてokの利用者報告を根拠に完了判定済みです。管理文書がまだ実機確認待ちなら、`STAGE3_COMPLETION_MANAGEMENT.patch` の適用状況を照合し、ユーザーの変更を保持して記録を整えてください。QH-05の2試験を基準に、設定再読込、キャッシュ無効化、DecorationTypeの生成・再利用・破棄、表示中エディタへの再適用を整理してください。動的装飾も含めて不要な型を解放し、設定を繰り返し変更しても残留させないでください。工程3の部分再装飾・複数編集・複数エディタの正しさと `highlight.*`、既存コマンドIDを維持してください。言語フィルター4-7の実機結果は未確定として扱い、合成試験だけで解消済みにしないでください。関連テスト、型検査、ビルド、必要な記録更新を行い、実機手順は変更点に絞って用意してください。未取得の `RUN_INFO.json` の版番号や実行時ハッシュを推測で補わないでください。Git管理下に独自バックアップを作らず、commit・push・公開はしないでください。

完了後は、設定を繰り返し変更した場合の即時反映と不要な装飾型の解放、工程3の編集操作への退行がないことを確認する。実機手順は工程4の変更点に絞る。

## 検証済み版とのSHA-256照合

比較元は `STAGE3_RESULTS.json` の `source_sha256_after` と `other_sha256`。以下は今回取得した実ファイルの値で、11件すべてが一致した。取得データはDropboxのcontent_hashとも照合した。

| ファイル | SHA-256 | 検証済み版との比較 |
|---|---|---|
| `src/commands.ts` | `ac5db37f4911f83c2f58b240920d7519c1dc38cfc9c0512a7a4db50bd97c3402` | 一致 |
| `src/constants.ts` | `fb164937c38131b2fd6750d393bfbaa39ceb4495270647cdfca77cfe32464015` | 一致 |
| `src/decoration.ts` | `6f6476ec20fa89ac069266094e5742160c4a37bcd01ad3fe29b145dc5834d98b` | 一致 |
| `src/index.ts` | `1c61afd69d10724338980d8be2337d2d5f3d5f9db969c4d7a9a81395deee4f80` | 一致 |
| `src/types.ts` | `a768b8aa1e4d1724f21e0f9061119f0ef5aafb557eb68a2e8adf9f466fd9b881` | 一致 |
| `src/utils.ts` | `59bfa3cf4dc38ed1cbb8d112d27a4b22a9f26ead6f4b1e785bb21694b5f9f021` | 一致 |
| `package.json` | `22114f3ca190ed8567619c8a2d2f15d587a74904c90c6e7a37f68755f8650e6b` | 一致 |
| `test/stage2-support.cjs` | `7ba5e417155d0c19c8f51f60f47a01279742ee9f813a94b74507dad3deaddc71` | 一致 |
| `test/stage2.test.cjs` | `19b9efb2e1eb8493fa65a852aa6559dffdd695cfe977cef6852addf162661691` | 一致 |
| `test/stage3.test.cjs` | `fc2c28b3a38026e384699d8bef7a1e2d2b8b542afde8d11d59593a387ac89acd` | 一致 |
| `STAGE3_LAUNCH_TEST_WIN.ps1` | `3e50914d569ac313442070d0f6257c22b7188995a28f1b44cc5f5b37cd301677` | 一致 |

照合時の実機報告: Dropbox revision `65d0cfa5327f11bc8f115`、サーバー更新日時2026-10-05 09:29:41 JST、SHA-256 `83d86af8442a3728ee9e5f78b3ea7cd449ec83446b49d7c304ecde98da6075df`。

自動検証原記録 `STAGE3_RESULTS.json` のSHA-256: `54f55936570f0f80e591d3f6c20ea2088828cbd2e1fc6468fe502afb09dd0b88`。
