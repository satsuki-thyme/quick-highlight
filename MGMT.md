# management

Quick Hilight

## task

- [x] 不要なファイルを削除し、刷新の必要なファイルを刷新する
- [ ] 改造
  - [x] stage 1
  - [x] stage 2
    - 2026-10-05: テスト基盤整備完了。32件中21合格、既知不具合11件を失敗として検出。`STAGE2_ACCEPTANCE.md`、`TESTING.md` 参照。
  - [x] stage 3
    - 2026-10-05: 工程3完了。検証済み版との11ファイルのSHA-256一致、起動・実機3項目すべてok（Undo/Redoは約10回）を照合。自動検証は44件中42合格、工程4のQH-05の2件はTODO。`STAGE3_COMPLETION.md`、`STAGE3_ACCEPTANCE.md`、`STAGE3_PHYSICAL_DEVICE_CHECK.md` 参照。
  - [ ] stage 4
    - 2026-10-08: 設定更新・装飾寿命管理を実装し、自動66件全合格、型検査・compile・bundle成功。Windows実機確認待ち。`STAGE4_ACCEPTANCE.md`、`STAGE4_PHYSICAL_DEVICE_CHECK.md` 参照。
  - [ ] stage 5
  - [ ] stage 6
  - [ ] stage 7
  - [ ] stage 8
  - [ ] stage 9
- [ ] マーケットプレイスに登録する

## requirements

- [ ] 高速化。
- [ ] 設定編集後に編集した設定が再起動するまで範囲されなくなる問題の解消。
  - 2026-10-08: 自動検証では設定保存後の反映と静的・動的装飾型の解放を確認。工程1の言語フィルター報告を含む実機確認後に完了判定する。
- [x] 書式が適用された行をコピーなどした際に書式が反映されなくなる問題の解消。
  - 2026-10-05: 工程3の自動検証と実機報告により達成。網羅的な設定互換性と実性能は工程5・6で確認する。
- [ ] ワークスペース内の全文検索の結果をエディタで開いた画面にハイライトを適用させたい。 new! 2026-10-09

## purpose

- フォークした VS Code 拡張機能 Highlight をまず自分のために VS Code 拡張機能 Quick Highlight として改造し、完成したものは公開提供する。

## meta setting

- development and operations model: IDAD
- git: `https://github.com/satsuki-thyme/Quick-Highlight`
