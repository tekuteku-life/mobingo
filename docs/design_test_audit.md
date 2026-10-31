# 設計テスト監査

## 初期監査

対象基準コミットは`061f8af`である。自作JS、CSS、HTML、SW、manifest、README、`req.md`を確認した。既存のテストコードとテスト用npmコマンドは存在しない。設計書は受入契約であり、不足する実装まで実装済みとは扱わない。

| 要求 | 設計 | 必須のassert・操作 | 層 |
| --- | --- | --- | --- |
| R-01 | E-01、U-01、I-01 | 両役割選択、戻る確認、再読込後の開催者復元 | システム、UI |
| R-02 | E-02、I-02 | 補正、長さ、許容文字、32進往復、乱数ID | 単体、UI |
| R-03 | I-03、I-04 | 独立PBKDF2計算、ChaCha既知値、棄却、固定生成ベクトル | 単体、結合 |
| R-04 | E-03、I-05、U-03 | 全列範囲、24数字の一意性、FREE、再現性 | 単体、システム、UI |
| R-05 | E-04、U-03 | 短押し、600ms復元、400ms境界、10px移動、pointercancel、別pointer | UI |
| R-06 | I-05、U-03 | 12ライン、待ち数字と複数リーチ、成立・復元、QR自動表示 | 単体、UI |
| R-07 | E-06、I-08、I-09、U-05 | 75球の一意性、スライド、キャンセル、演出スキップ、連打、75手停止 | 結合、システム、UI |
| R-08 | E-07、U-05 | Undo取消・承認、0手、履歴、リセット、タイマー残留 | システム、UI |
| R-09 | E-08、U-04、U-05 | 受付・重複・削除・0人禁止、予告、総リーチ、ビンゴ成立者ID、逆順賞 | システム、UI |
| R-10 | E-09、E-10、I-05、U-06 | QR形式、未達成、独立算出の最初の成立手番と役、0/75手 | 単体、結合、システム、UI |
| R-11 | E-05、E-07、I-05 | 全3役、解禁前・同手番・後、Undoで解禁前へ | 単体、結合、UI |
| R-12 | E-11、I-06 | JSON破損・型・範囲・XSS拒否、保存例外、両役割リロード、リセット | 単体、結合、UI |
| R-13 | E-12、I-13 | precache完全性、通信遮断後の再訪、旧キャッシュのみ削除、GET以外 | 結合、システム |
| R-14 | U-03、U-05、U-06 | 縦横viewport内のカード・操作、ボード、投影開閉 | UI |
| R-15 | E-13、I-11、I-12、U-01 | API非対応・拒否、音声切替、情報開閉、権利表記 | 単体、結合、UI |
| R-16 | E-14、I-07〜10 | 遷移後のPromise・タイマー無効化、遅延stream停止、監視解放 | 結合、UI |

## 調査で見つかった差異候補

テストにより確定させ、製品不具合なら開発プロセスの再入場手順を適用する対象である。

- 役割保存で`host`を書き込む一方、復元で`parent`を受理している。
- 抽選演出の`getBallLetter`が別関数のスコープにあり、呼出し時に参照できない。
- カードとスライダーのpointercancelが通常終了処理を呼んでいる。
- 保存JSONのスキーマ検証がなく、不正値がHTML生成に到達する。
- 画面破棄、タイマー無効化、カメラ取得競合、Canvas監視解放が不足している。
- SWのactivateが他アプリのキャッシュまで削除する。

## 記録規則

試験追加後にテストファイル、実行コマンド、実測件数、具体的assert、カバレッジと不足観点を追記する。NodeのAPIモック、localhostのChromium、実機・本番配信の確認を区別する。いずれかの受入ゲートが未達の場合は未達のまま記録する。

## 実装・assertへの対応

| 要求 | 試験ファイル | 実際の検証内容 |
| --- | --- | --- |
| R-01 | `unit/storage.test.js`、`system/game.test.js`、`ui/additional.test.js` | host/child/selectの保存復元、開催者の再読込、ロゴ確認取消・承認後のDOM |
| R-02 | `unit/generation.test.js`、`ui/additional.test.js`、`ui/host.test.js` | 補正・不正ID・32進往復、ランダムIDの許容文字、モード切替後の入力ID保持 |
| R-03 | `unit/generation.test.js`、`helpers/v1-vectors.json` | Node標準PBKDF2/ChaCha20との比較、基準v1のカード25値・出目75値とのdeepEqual |
| R-04 | `unit/generation.test.js`、`ui/interactions.test.js` | 25セル、列範囲、重複なし、Map24件、FREEとカード再訪時のDOM一致 |
| R-05 | `ui/interactions.test.js`、`ui/lifecycle.test.js`、`ui/additional.test.js` | 399/400ms、599/600ms、長押し、移動10px、cancel、捕捉喪失、別pointer、保存座標の不変 |
| R-06 | `unit/rules.test.js`、`ui/additional.test.js`、`ui/lifecycle.test.js` | 全12標準ライン、待ち数字、複数リーチ枠、ビンゴQR表示・復元、同カード再描画後のQR予約保持 |
| R-07 | `unit/generation.test.js`、`integration/browser-components.test.js`、`system/game.test.js`、`ui/host.test.js` | 75球の一意性、スライド取消・無効化・再有効化、自然確定、連打後の1手保存、75手での無効表示 |
| R-08 | `system/game.test.js`、`ui/host.test.js` | 最新球、履歴件数上限20、点灯数、Undo取消・承認、0手保持、リセット後のキー削除 |
| R-09 | `system/game.test.js`、`ui/host.test.js`、`ui/lifecycle.test.js` | 受付重複排除・削除・0人禁止、独立算出の総リーチと予告人数、成立ID、逆ビンゴ上位3件、確定中の編集停止・保存時点 |
| R-10 | `integration/verification.test.js`、`ui/qr-input.test.js`、`ui/interactions.test.js`、`ui/host.test.js` | 独立ライン計算による最初の成立手番・全成立役・一致数、QR形式の受理/拒否、実QRCode画像のjsQRデコード、0/75手の結果表示 |
| R-11 | `unit/rules.test.js`、`integration/verification.test.js`、`ui/host.test.js` | 全3特殊役、解禁0/25/75手の独立照合、解禁取消、解禁後Undo、解禁済みモードA復元 |
| R-12 | `unit/storage.test.js`、`ui/interactions.test.js`、`system/game.test.js` | JSON破損・型・範囲・余分な属性・不正IDの拒否、保存API例外、両役割の再読込、DOMへの不正値非描画 |
| R-13 | `integration/service-worker.test.js`、`system/game.test.js` | 全自作実行資産のprecache、他アプリキャッシュ保持、GET以外の非介入、cache/network/fallback、実SW制御下の通信遮断再訪 |
| R-14 | `ui/interactions.test.js`、`ui/host.test.js` | 390×844と844×390のカード・主要操作のviewport内矩形、実wheel到達、クリック中心のhit-test、投影開閉 |
| R-15 | `unit/device.test.js`、`integration/browser-components.test.js`、`ui/additional.test.js` | 端末APIの非対応・拒否・例外、効果音呼出し、振動配列、Wake Lock復帰、ミュートtitle/icon/内部状態、情報・商標表示と背景終了 |
| R-16 | `unit/lifecycle.test.js`、`integration/canvas.test.js`、`ui/lifecycle.test.js`、`ui/additional.test.js` | 保留KDF・遅延streamの離脱、旧保存値不変、閉じた照合body不変・効果音0、RAF/監視解放、紙吹雪resetと実Canvas除去、旧DOMイベント再配送 |

テスト層の名称だけで確認済みとはせず、上表のassertと環境を証拠とする。基準入力以外の全組合せや全端末の保証を意味しない。

## 最終実測

製品・テストの基準は`4d06886`である。`npm run lint`はエラー0件、`npm run test:coverage`は単体・結合・システム62/62とUI45/45の計107/107合格・終了コード0である。全18自作対象ファイルのLine・Branchは97%以上であり、最小Lineは99.18%、最小Branchは97.26%である。

設計・テスト・コードの独立レビューはいずれも最終`PASS`である。実測表、環境、残余リスクは[最終受入記録](reviews/review4.md)、不具合の再入場は[是正記録](reviews/defects.md)を参照する。実機・本番配信、受付途中の復元、完全なアクセシビリティは確認済みとしない。

## モバイルUI指摘への再入場

基準`6d5f0b3`のUI試験はdesktop扱いのサイズ変更を含み、click補助のscrollIntoViewが到達不能を隠す余地があった。U-08として以下を追加した。

| 試験 | 実行環境・assert |
| --- | --- |
| `test/ui/mobile-layout.test.js`の各サイズ3シナリオ | mobile:true、DPR2、touch、向き情報を有効化する。320×568、360×640、390×844、568×320、640×360、844×390、640×280の7サイズで、開始・参加・受付・カード・全モーダル・投影へ実touchで到達する |
| 同ファイルの連続回転 | 開封0,0と1手抽選後に縦→横→縦を実行し、保存値・数字・開封class・最新球・手番を比較する |
| 同ファイルのtrack/thumb専用2ケース | 個別ページでスクロール余地・hit-testを確認し、縦panでscrollTop増加・誤抽選なしを検証する |
| `test/helpers/layout.js` | visualViewport、全クリップ祖先、中心hit-testを測り、はみ出し量に応じた実touch panで到達する。scrollTop代入とscrollIntoViewを使わない |
| `test/integration/service-worker.test.js` | manifest.orientation:anyを検証し、PWAの縦固定を再導入しない |

mobile UIは24ケースである。投影の全75数字の収容、5行構成、縦hero45%上限、樽の最小寸法、右上44px操作と位置近接、照合25マス・順位3件の到達、3回開閉後の監視/RAF解放を検証する。

最初の全体実行では高さ280pxの経路でUI66/67となり、スライダーの縦pan遮断を追加捕捉した。単独試験の通過で全体失敗を取り消さず、専用の失敗試験・設計追記・再レビューを経て修正した。最新の実測と残余境界は[review7](reviews/review7.md)へ記録する。

### モバイルUI是正の最終実測

製品は`d3e608d`である。`npm run lint`はエラー0件、`npm run test:coverage`は単体・結合・システム63/63とUI69/69、計132/132合格・終了コード0である。18対象の最小Lineは99.18%、最小Branchは97.29%であり、ファイル別97%ゲートを満たした。設計・テスト・コードの最終独立レビューはすべて`PASS`である。

[最新の受入記録と画面例](reviews/review7.md)を参照する。review4の107件は初期整備時の記録として保持する。

## PC/タブレット・表示名・当選順の不足観点（R-17〜19）

基準は`4945de0`である。既存132件とカバレッジは、以下の未確認境界を証明していなかった。

| 不足観点 | 追加するassert・環境 |
| --- | --- |
| 非正方形セルの復元リング | PCの実mouse down中に円のCTM・stroke込み矩形を全クリップ祖先と比較する。縦長と横長の強制セルを含む |
| iPad縦/正方形/超横長の開催者 | ヘッダーを除く主領域がviewport幅を使い、左右ペインと操作へ到達できること |
| 重複リセットとヘッダーの段落ち | 可視reset数=1、reset高さ<=36、QR高さ>=40、ID/リーチの中心Y差を実測する |
| 名前の入力・保存・編集 | Unicode/絵文字/空白/境界長/制御文字、名前だけの変更でカード・開封状態を保持すること |
| QR入力境界とXSS | 旧QR、新QR、JSON破損・余分な属性・prototypeキー・型・長文の拒否、受付/照合/トースト/当選順/復元で悪性文字列が文字として見えること |
| 順位の正しさ | 独立手番再生、同順位1/1/3、解禁、0/75手、未達成、重複、Undo/復元/新ゲーム、同名別ID |
| 非同期の名前/順位更新 | 受付確定中と閉じた照合のKDF完了で、名前・対象ID・保存値・旧DOMを部分更新しないこと |

### 追加後の要求と実assertの対応

| 要求・設計 | テスト層・ファイル | 具体的assert |
| --- | --- | --- |
| R-17／E-15／I-16 | unit/identity、unit/storage | NFC/空白/絵文字32・33/原文256・257、C0/C1/全方向制御文字、旧QR名前null・新空文字解除、型/不正JSON/余分な属性/prototype、5文字escape、旧保存返却形と関連状態全体拒否 |
| R-17／U-09 | ui/identity-layout | 入力値の実反映・不正値で非遷移/未保存、名前編集で開封維持、引用符を含む悪性文字列の入力属性・本文復元、実QR画像をjsQRで復号、新形式のseed/name一致 |
| R-17／E-08、E-15 | ui/identity-layout | 受付chip/toastの人数1・名前更新/旧QR保持/解除/削除、HTMLイベント属性非生成、受付確定中KDF保留で一覧/名前/保存不変、閉じた照合の旧body/保存不変、破棄済み編集・QRイベントの無効化 |
| R-18／E-16／I-16 | unit/ranking、integration/ranking | 同順位1/1/3とID順、0/4/5/29/30/75手、未達成、出目不足、自然成立/解禁の最大値。別定義の12+3ラインを各手番で再生して決定論カード4枚・解禁4条件・手番4条件と比較 |
| R-18／U-09 | system/ranking、ui/identity-layout | 成立手番で表示・Undoで除外・再読込で保持、mode A登録+有効照合の和集合、同名別IDの2行、未達成は名前のみ、重複照合1行、mode B旧未照合登録ID除外、リセット後空一覧 |
| R-19／U-09 | ui/identity-layout | 8サイズの開催者幅の下限/上限・左右2ペイン矩形・操作、可視reset1個/高さ36以下・QR40以上・ID/リーチ中心Y、PC実mouse長押し時のstroke+CTMと全クリップ祖先（自然/縦長/横長） |
| R-17〜19／U-08、U-09 | ui/identity-layout、ui/mobile-layout | mobile DPR2/touch/向き有効、32絵文字の編集全文・取消、順位各名前のクリップ/scroll寸法、準備・受付幅を4サイズでnative swipe/tap。従来7サイズ24ケースと初期参加ボタン収容を維持 |
| R-13／I-16 | integration/service-worker、system/game | 新identity/rankingを含む全実行資産のprecache、実SW下の通信遮断再訪。カード生成v1ベクトルを維持 |

QR生成と画像復号は実QRCode画像のjsQR復号で確認し、開催者カメラ経路の復号結果はローカルCanvas映像と復号スタブで入力する。実端末カメラの光学性能や物理モニターを確認済みとはしない。最終結果と再入場履歴は[review10](reviews/review10.md)へ記録する。

### PC/タブレット・表示名・当選順の最終実測

製品`4fdc09e`（1.1.0）で`npm run lint`はエラー0件、`npm run test:coverage`は単体47・結合21・システム4・UI92の計164/164合格、終了コード0である。全20自作対象の最小Line99.18%・最小Branch97.56%で、各ファイル97%ゲートを満たした。設計・テスト・コードの最終独立レビューはいずれも`PASS`である。初回UI失敗とchild Branch未達を是正した経緯、実測表、画面例と残余境界は[review10](reviews/review10.md)へ記録する。

## バージョン確認・更新と文体の不足観点（R-20、R-21）

基準は`ae2de3c`である。既存164件は更新通知・適用を検証しておらず、当選順の常体を捕捉していなかった。

| 追加対象 | 具体的な証拠 |
| --- | --- |
| 単体 | 正規版番号比較、版返信の型/長さ、非対応、登録/通信/インストール/切替の拒否と期限、購読解除、連打・取消・busy・対象差替え、再読込1回 |
| 結合 | SW installの自動skip廃止、cache:reload precache、版返信とwindow範囲/版照合、他アプリCache保持、グローバルCacheへ混入しても自身の版だけを検索 |
| システム | 実HTTPの配信資産を2版切替し、実Workerがwaiting→確認→controller切替→再読込すること、子/親/役割保存、同版・オフライン・失敗precache・旧版自然移行・別タブを測る |
| UI | 両モードの当選順説明・空状態、全自作画面文章の静的常体検出、情報画面で版・状態・確認/適用の操作、閉じたDOMの遅延更新なし、4サイズ実touch到達、抽選/受付の適用拒否 |

Workerのモックだけで本番更新成功とは扱わない。localhostの実Worker更新・通信遮断を別層で実行し、本番HTTPS・OSのインストール済みPWA更新は残余境界とする。
