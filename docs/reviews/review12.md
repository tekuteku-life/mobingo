# アプリ更新の独立テストレビュー

工程はPhase 3、基準製品は`ae2de3c`、設計は`aebf40c`である。対象はupdates単体、ui-copy単体、service-worker結合、実2版のupdatesシステム、updates UI、およびHTTP/CDP fixtureである。

修正前の`node --test test/unit/ui-copy.test.js test/unit/updates.test.js`では、案内の常体が検出され、更新モジュールは未実装importで失敗した。新機能の未実装と既存文言の不具合を区別する。

独立test_reviewの指摘により、HTTP fixtureでの更新取得失敗の観測、CDP Worker状態通知による自然有効化待ち、新版表示/取消/適用/復元までのnative4サイズ、抽選の回転・球表示・完了後の適用を追加した。MessagePort個体・期限タイマー・getEventListenersによる実登録数で成功/失敗後の資源解放を検証する。版要素の最大6桁・数値上限をE-17へ追記し、独立設計再レビューも`PASS`である。

リスナー観測はoptionsやonceの意味を変えないgetEventListenersへ是正し、別タブの操作対象を明示した。旧版の画面離脱はabout:blankへ遷移して対象versionIdのactivatedを待ち、固定時間待ちを使わない。テストの最終独立再レビュー結果は`PASS`である。製品の受入合格を示す記録ではない。

## 実行後の再入場

ブラウザ試験の最初の13件は12合格・1失敗であり、失敗は試験fixtureのRuntime.evaluate内でtop-level awaitを使ったSyntaxErrorであった。async IIFEへ修正し、専用試験で旧DOM不変・再表示の状態反映まで実行した。修正後の独立テスト再レビューは`PASS`である。

コードレビューで、切替・版返信待ち中に情報画面を閉じて抽選を始めると無条件reloadする欠陥が見つかった。単体でcontroller/reply待ち中の操作開始と再試行を追加し、修正前にreload回数1（期待0）で失敗した。実2版Workerの返信を保留して同操作を再現するUI試験も追加した。独立テストレビューは`PASS`である。reload直前の再確認を追加して是正する。

## 句点なしの参加者案内

横断点検で参加者の「タップで穴を開ける / 長押しで元に戻す」が残っていた。静的検出へ追加し、child.js:233を検出するREDを取得した。縦画面の案内と横画面の共通/詳細案内を、実touchで可視範囲へ出して「開けます」「戻せます」とassertする試験を追加した。独立テストレビューは`PASS`である。測定中のソースを変えないため、実行中の測定は変更前に停止した。
