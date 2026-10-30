# 不具合是正記録

基準実装は`061f8af`である。Phase 1の契約を先行定義し、Phase 2とPhase 3の独立レビューを経て、以下を赤試験で捕捉する。

| ID | 原因・期待契約 | 再現テスト | 横断確認対象 |
| --- | --- | --- | --- |
| D-01 | `parent`と`host`の不一致。E-01に統一する | unit/storage、system/gameの復元 | 両役割、保存キー |
| D-02 | `getBallLetter`の関数スコープ不整合 | system/gameの初回排出、静的型検査 | 投影と各球表示 |
| D-03 | キャンセルを通常終了として処理する | UI interactions/lifecycle | セル、スライダー、別pointer、移動境界 |
| D-04 | JSONの型・範囲を検査しない | unit/storage、UI不正保存 | 両ゲーム、DOMへの文字列挿入 |
| D-05 | 画面の生存確認と破棄処理がない | UI lifecycle、integration/canvas | KDF、カメラ、照合、演出、RAF、監視 |
| D-06 | SWが全キャッシュを削除する | integration/service-worker | current cache、Mobingo旧cache、他アプリ |
| D-07 | QRへ手入力の削除・切詰め補正を流用する | UI qr-input | 事前受付と当選照合 |
| D-08 | モード切替で未確定IDを捨てる | UI host | モードA/B往復 |
| D-09 | モードAの成立者ID表示がない | UI hostの独立集計 | 全員成立、未達成、次球予告 |

修正は契約を変えずに入力境界・状態の所有者・破棄を明確にする方針である。乱数v1と保存キー・既知フィールドを維持する。修正後に全試験と静的検査を再実行し、独立コードレビューへ進む。
