# R-17〜19 テスト設計・実装レビュー

工程はPhase 3、製品基準は`4945de0`である。対象はidentity/ranking/storage単体、ranking結合・システム、identity-layout UI、および既存QR画像試験の新形式期待値である。

独立test_reviewの指摘により、Undo selector、QRスタブの残留競合、再読込fixtureの上書き、KDFキャッシュによる保留試験不成立を修正した。左右ペインと操作到達、受付の名前更新・解除・削除・XSS、未達成、同名別IDと登録/有効照合の和集合、受付確定中と閉じた照合の非同期原子性を追加した。

## 修正前の再現

`node --test --test-name-pattern='R-19: 320|R-19: 768|R-19: PC' test/ui/identity-layout.test.js`は5件中1合格・4失敗である。320×568で可視reset数2（期待1）、768×1024で開催者幅448px（利用可能768px）、縦長・横長セルでstrokeがSVG/セル範囲をはみ出した。自然形状は合格した。

新identity/rankingモジュールの単体は未実装importで失敗する。これは新機能の未実装であり、不具合再現4件と区別する。最初のUI試験にはreload fixtureの問題があり、試験原因を修正して上記再現を再取得した。ローカルHTTP/Chromiumはsandboxのlisten制限を避けた環境で実行した。

是正後の独立再レビュー結果は`PASS`である。製品の受入合格を示す記録ではない。

## 追加の実touchと再入場

32絵文字の名前編集・取消、順位全文、開催者準備/受付の横幅を320×568、844×390、640×280、820×1180の4実touchケースで追加した。全文はtextContentだけでなく全クリップ祖先とscroll/client寸法で検証する。追加分の独立テスト再レビューは`PASS`である。

自己点検でモードBの旧保存registeredChildSeedsを順位へ混入する欠陥を発見した。末尾の専用試験は、verifiedがABCDのみの場合に実際はZZZZ・ABCDを表示し、期待ABCDのみとの比較で失敗した。E-16の契約は変更せずPhase 3へ再入場し、対象の絞り込みを是正する。
