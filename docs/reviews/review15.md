# アプリURL共有の検証記録

## 対象と仕様

確認日は2026年11月1日である。基準は`88549d5`、作業ブランチは`fix/mobile-feedback-and-controls`、製品バージョンは1.4.0である。対象はR-23、E-19、I-18、U-11である。

共通ヘッダーからURLのコピー・端末の共有メニュー・URL共有用QRを選択する。URLは現在のoriginとpathnameを保ち、query/hashを除く。ゲーム状態やカード用QRのペイロードを追加しない。コピー拒否・非対応は全選択と手動コピー案内、端末共有非対応はコピーとQRへ案内する。共有取消と失敗を区別し、共有メニューの完了を相手への配送完了とは表示しない。

ClipboardとWeb Shareは利用者のボタン操作から呼び、処理中の連打を抑止する。閉じた画面への遅延結果は反映しない。QRは非表示Canvasで生成してから現在の画面へ転写し、ライブラリの遅延完了で旧表示Canvasを書き換えない。新モジュールをSWへ同梱してオフライン再訪へ対応する。短い画面のQR寸法と狭いヘッダーの間隔も調整する。

## 先行試験と原因分類

共有UIの先行テストで`#header-share-btn`が存在せず1/1失敗を記録した。実装後の重点実行は14/16合格であり、取消と保留処理の2件が失敗した。原因は試験の`Object.defineProperty`で共有APIスタブをread-onlyとし、後続のスタブ差替えが反映されなかったことである。`writable:true`として是正した。

実touchの小画面・境界幅、閉鎖後の成功と失敗を追加し、重点22/22を確認した。API受け渡しの共有URL・コピー内容・実QRデコードの完全一致、実Clipboardのreadback、実SW制御後の通信遮断・再訪でのQR生成まで観測した。共有モジュール単独の事前測定はLine/Branchとも100%である。これは全体の最終ゲートとは区別する。

差分レビューでCanvasのID指定`display:block`がhidden属性のCSSより優先され、生成中・失敗時に空のCanvasを表示する問題を発見した。computed styleがblock（期待none）となる失敗を先行再現し、IDとhidden属性を組み合わせた非表示指定を追加した。生成中・失敗時の両方を実スタイルでassertするよう是正した。全体実行の共有UI試験が開始される前の是正であり、該当試験の個別再実行と、全体実行の両方で合格した。変更したCSSは共有QRの非表示指定に限定する。

## レビュー範囲

実装者による差分確認では、URLのHTML非埋込み、query/hashの除去、ゲーム状態の保存値不変、Web Shareの利用者操作内呼出し、連打、取消・例外・再試行、旧DOM不変、QRの二重生成と再試行、役割変更時の破棄、Escリスナー解除とフォーカス復帰、SW同梱と版同期を確認した。

独立サブエージェントレビューは未実施であり、開発プロセス全体の最終受入完了とは扱わない。追加分のcommit・pushは利用者の既存の指示に続けて行う。mainへのマージと本番配信は実施対象に含めない。

## 最終実測

`npm run lint`は終了コード0、`git diff --check`は違反0件である。`npm run test:coverage`は終了コード0で完了し、単体・結合・システム94/94、UI151/151、計245/245が合格した。共有の追加22件は全体実行でも合格した。

測定対象の自作JS・SWが測定中に変わっていないことを確認し、Node V8とChromium CDPを位置で合算した23自作対象すべてで、Line/Branch各97%以上である。最小Lineは98.36%、最小Branchは97.68%である。共有モジュールはLine/Branchとも100%である。終了コードはセッション外の実行でもstatusファイルへ保存した。

| ファイル | Line | Branch | 判定 |
| --- | ---: | ---: | --- |
| js/app.js | 98.36% | 100% | 合格 |
| js/components/bingo-barrel.js | 100% | 100% | 合格 |
| js/components/slide-action.js | 100% | 100% | 合格 |
| js/core/audio.js | 100% | 100% | 合格 |
| js/core/base32.js | 100% | 100% | 合格 |
| js/core/bingo.js | 99.18% | 98.48% | 合格 |
| js/core/chacha20.js | 100% | 100% | 合格 |
| js/core/crypto.js | 100% | 100% | 合格 |
| js/core/haptics.js | 100% | 100% | 合格 |
| js/core/icons.js | 100% | 100% | 合格 |
| js/core/identity.js | 100% | 100% | 合格 |
| js/core/lifecycle.js | 100% | 100% | 合格 |
| js/core/ranking.js | 100% | 100% | 合格 |
| js/core/storage.js | 100% | 100% | 合格 |
| js/core/updates.js | 100% | 98.33% | 合格 |
| js/core/version.js | 100% | 100% | 合格 |
| js/core/wakelock.js | 100% | 100% | 合格 |
| js/views/child.js | 100% | 97.68% | 合格 |
| js/views/host.js | 100% | 98.03% | 合格 |
| js/views/license-modal.js | 100% | 100% | 合格 |
| js/views/mode-select.js | 100% | 100% | 合格 |
| js/views/share-modal.js | 100% | 100% | 合格 |
| sw.js | 100% | 100% | 合格 |

設計`50839e2`、テスト`eb87846`、実装`46dd403`、Canvas非表示の是正`44c2a6a`へ分割した。検証記録とREADMEは後続の文書コミットに収録する。独立レビューと実OS共有先への配送確認は未実施であり、機械的な検証結果と区別する。

## 残余境界

Node.js v24.19.0、Chromium 150、localhostで検証する。端末共有はAPIスタブへの引数と利用者操作を観測し、実際のOS共有シート・送信先アプリ・相手への配送を確認したとはしない。コピーはヘッドレスChromiumの実Clipboardと権限拒否スタブを区別する。Pixel 9aのインストール済みPWAと、本番HTTPS・OSの共有先選択は実機確認の対象である。

APIの制約は[Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)と[Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)を参照する。Clipboardはsecure contextと権限、Web Shareは利用者操作とブラウザの対応に依存する。今回の共有機能は相手への自動送信を行わない。

## 画面例

390×844の[共有画面](screenshots/share-390.png)と640×280でQRへスクロールした[横画面](screenshots/share-landscape-640.png)を撮影した。端末共有APIはスタブで可用化しており、OS共有シートやPixel実機の画面ではない。表示中のURLはlocalhostの検証用である。
