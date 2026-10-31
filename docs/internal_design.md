# 内部設計書

## 1. 構成と依存関係

| ID | 対象 | 責務・依存 |
| --- | --- | --- |
| I-01 | `js/app.js`、`js/views/mode-select.js` | 起動、SW登録、役割選択、共通ヘッダー、画面の生成と破棄 |
| I-02 | `js/core/base32.js` | ID補正・妥当性検査・暗号乱数による生成・数値との相互変換 |
| I-03 | `js/core/crypto.js` | Web Cryptoによる用途別鍵導出とメモリ内キャッシュ |
| I-04 | `js/core/chacha20.js` | ChaCha20のブロック、32bit整数、棄却法、シャッフル |
| I-05 | `js/core/bingo.js` | 生成、12標準ライン・3特殊役、リーチ、手番別照合 |
| I-06 | `js/core/storage.js` | localStorageキー、JSON、復元前のスキーマ検証、保存失敗の隔離 |
| I-07 | `js/views/child.js` | 参加者セットアップ、開封状態、操作・QR・演出 |
| I-08 | `js/views/host.js` | 開催者セットアップ、受付、抽選、照合、特殊役、投影 |
| I-09 | `js/components/slide-action.js` | pointer捕捉とスライド成立・キャンセル |
| I-10 | `js/components/bingo-barrel.js` | Canvas描画・演出専用物理乱数、RAF・ResizeObserver管理 |
| I-11 | `js/core/audio.js`、`haptics.js`、`wakelock.js` | 機能検出、音声・振動・スリープ防止 |
| I-12 | `js/core/icons.js`、`js/views/license-modal.js` | 自作SVGアイコンと情報モーダル |
| I-13 | `sw.js`、`manifest.json` | 静的資産のキャッシュとPWA起動条件 |
| I-14 | `js/core/lifecycle.js` | 画面・子画面の生存状態、タイマー、破棄処理の所有権 |

`index.html`は同梱のqrcode、jsQR、canvas-confettiをclassic scriptで読み込み、`js/app.js`をES Moduleで起動する。`css/style.css`はユーティリティと独自レイアウトを含む。React、Viteは既存package依存に残るが実行経路では使わず、本構成の配信にビルドは不要である。

## 2. 決定論的生成（I-02〜I-05）

IDの文字集合は32文字、長さ4である。ランダムIDは`crypto.getRandomValues`の4バイトの各下位5bitを文字へ写像する。`seedToNumber`は左から32進蓄積、`numberToSeed`は0〜32^4−1への剰余から4桁を作る。数値変換の内部呼出し契約は非負整数である。

KDFはUTF-8のIDをpasswordとし、saltを`mobingo-salt-v1:mobingo:draw`または`mobingo-salt-v1:mobingo:card`、PBKDF2-SHA256・30,000反復で256bitを導出する。キャッシュキーは`seed:context`であり、セッション中の再導出を省略する。20bit入力の探索耐性を256bitと誤認してはならない。

ChaCha20は32バイト鍵、12バイトnonce（省略時0）、32bit counter初期0、20ラウンド、little-endianである。64バイト単位で生成し、`nextUint32`は4バイトずつ取り出す。`nextInt(max)`は2^32の端数領域を棄却して剰余を返し、`shuffle`は末尾からFisher–Yatesを適用する。アプリが利用する上限は75以下である。

出目は1〜75をシャッフルした配列である。カードはB、I、N、G、Oの順にそれぞれ15候補をシャッフルし、B/I/G/Oは5個、Nは4個を取得する。行優先で`{row,col,value,letter}`を25件作り、N中央は`value:0`である。返却値は`{seed,grid,cells,valueToCellMap}`であり、MapはFREEを含まない。

## 3. 判定（I-05）

座標Setの`"2,2"`を常時開封として扱う。各パターンの未開封数が0なら完成、1ならリーチである。待ち数字はSetで重複を除き昇順化する。リーチ数0/1/2/3以上を`none`/`single`/`double`/`triple_or_more`へ写像する。

標準パターンは横5・縦5・斜め2の12本である。特殊役は四隅4座標、X形9座標、十字9座標である。参加者のONは3役を一括追加する。

`verifyChildCard(childSeed, drawSequence, currentTurn, specialRuleTurn)`は1手から現在手番まで再生し、各手番で出目集合と開封座標を再構成する。特殊役は`specialRuleTurn !== null && turn >= specialRuleTurn`で評価する。初めて現れたパターンに`turnAchieved`を付け、最初の手番と同手番の全役を保持する。0手は成立なしである。計算量は75手×25セル×15パターンを上限とする。

## 4. 状態とライフサイクル（I-01、I-06〜I-10）

参加者状態はID、生成カード、座標Set、特殊役フラグ、ビンゴ演出済みフラグである。開催者状態はID、モード、出目配列、手番、解禁手番、受付ID配列、カードMapである。生成カードとMapは保存せずIDから再生成する。受付確定中は追加・削除・戻るを無効にし、固定した一覧の導出完了と画面生存を確認してから保存する。保存の開始はゲーム開始時であり、モードA受付中の一覧はメモリ内だけで保持する。

抽選状態は待機→回転→球表示→1手確定→待機である。回転中は再開始しない。キャンセルやリセットでは古い回転・球表示タイマーを無効化し、旧手番の書き戻しを防ぐ。Undoとリセットは確認承認後だけ適用する。

`createScope`は生存フラグと破棄関数集合を持ち、子スコープとtimeoutを所有する。子の破棄で親から登録を外し、繰返し破棄を無害にする。

ビンゴ後のQR自動表示予約はカードの生存期間に属する。同じカードの再描画では予約を保持し、未達成への復元、リセット、役割変更で取り消す。紙吹雪も画面離脱またはカード再作成でresetする。同じカードの再描画では紙吹雪を停止しない。

画面render関数は破棄関数を返す。アプリは再描画前に旧画面を破棄する。画面内の再描画もタイマーとCanvas監視を破棄する。非同期処理は開始時の世代と完了時の生存状態を照合する。カメラ取得を待つ間に画面・タブ・モーダルが変わった場合、到着したstreamを即座に停止する。QR照合の結果は現在のリクエストだけ反映する。

pointer操作はpointerIdを保持する。移動境界、pointercancel、lostpointercaptureで中断し、別pointerの開始・移動・終了を無視する。長押し成立後のpointerupで再開封しない。スライドは移動可能距離を0〜1へ正規化し、0.85以上で成立する。

保存復元では入力を検証して既知フィールドだけの新規オブジェクトを返す。値の補正で壊れた保存データを黙って採用せず、ゲーム単位で拒否する。既存キーとフィールド名は維持する。

## 5. Service Worker（I-13）

installは`STATIC_ASSETS`を`cache.addAll`して完了後にskipWaitingする。activateは同アプリの`mobingo-`接頭辞を持つ旧キャッシュだけを削除してclients.claimする。fetchはGETのみcache-firstで処理し、同一オリジン・200・basic応答を保存する。オフラインのnavigateはキャッシュ済みindexへフォールバックする。

バージョン更新時はpackageのルートバージョンと`CACHE_NAME = 'mobingo-vX.Y.Z'`を同期する。独自の更新通知・強制リロード機構は現行に存在しない。配信済み旧SWからの更新は本番環境で別途確認する。

## 6. 検証境界

KDFはNode標準cryptoの独立計算、ChaCha20は既知ベクトル、判定は直接数えた座標・独立参照判定で検証する。ブラウザAPI単体モックだけでは実DOM・PWA動作を証明しないため、システムとUI試験を併用する。自作JS全体とSWの未ロードを含むファイル別カバレッジを測る。

## 7. スマートフォン表示領域（I-15／R-14）

PWAマニフェストの`orientation`は`any`とし、インストール時にも縦方向へ固定しない。画面の高さは`100vh`をフォールバックとし、対応ブラウザでは`100dvh`で現在の表示可能領域へ追従する。safe areaはアプリと投影オーバーレイそれぞれの境界で余白として確保する。flex/gridの中間要素は`min-height:0`、`min-width:0`で縮小を許し、コンテンツが大きいときのスクロール所有者を明示する。

セットアップは`setup-intro`とフォーム/操作領域を分離し、横画面では2列へ組み替える。開始位置は`flex-start`と自動マージンで制御し、`justify-content:safe center`の対応状況に依存させない。受付、開催者操作パネル、長いモーダルはタッチスクロール可能とする。参加者カードは表示領域内に保つ。

投影ボタンは共通ヘッダーの開催者専用操作である。ダッシュボードが有効な間だけ操作を有効化し、画面スコープでリスナーを登録・解除する。投影の描画・資源解放・ゲーム状態の契約は維持する。表示中の向き変更はCSSと既存ResizeObserverで追従し、保存状態を変更しない。

スマートフォンの投影ボードは各B/I/N/G/O行に15数字を持つ構造とする。狭い横画面は樽/最新球とボードを左右、縦画面は上部の樽/最新球と下部の横長ボードへ配置する。画面全体を`overflow:hidden`で切り捨てることで見かけの収まりを作らない。
