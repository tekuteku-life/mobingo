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

R-22ではアプリのcapture段階でpointer・touch終了・click・keydownから音声を再開する。初回操作だけで監視を解除せず、suspended/interrupted状態を再試行し、短い無音バッファで出力を初期化する。回転音の時刻は負値を許容しない。振動の共通設定と例外隔離は`haptics.js`に集約し、回転終了・画面破棄・オフ切替時に振動を停止する。

開催者の再描画は旧左パネルのscrollTopを取得し、新左パネルへ復元する。球表示中の成立スライドは保存・旧scope破棄・新scopeでの次球開始を順に行う。リセットの省略判定は保留中の排出球を含む実効手番と、現在の特殊役の有効性から再計算する。参加者の省略判定も保存待ちの再描画に依存せず現在の開封集合から計算する。

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

installは`STATIC_ASSETS`を`cache.addAll`して完了を待つ。起動中アプリからの強制切替はI-17の確認付きメッセージによる。activateは同アプリの`mobingo-`接頭辞を持つ旧キャッシュだけを削除してclients.claimする。fetchはGETのみ自身の版のCacheを検索するcache-firstで処理し、同一オリジン・200・basic応答を保存する。オフラインのnavigateはキャッシュ済みindexへフォールバックする。

バージョン更新時はpackage/lockルート、実行版定数と`CACHE_NAME = 'mobingo-vX.Y.Z'`を同期する。更新確認・明示的な切替はI-17へ定義する。配信済み旧SWからの更新は本番環境で別途確認する。

## 6. 検証境界

KDFはNode標準cryptoの独立計算、ChaCha20は既知ベクトル、判定は直接数えた座標・独立参照判定で検証する。ブラウザAPI単体モックだけでは実DOM・PWA動作を証明しないため、システムとUI試験を併用する。自作JS全体とSWの未ロードを含むファイル別カバレッジを測る。

## 7. スマートフォン表示領域（I-15／R-14）

PWAマニフェストの`orientation`は`any`とし、インストール時にも縦方向へ固定しない。画面の高さは`100vh`をフォールバックとし、対応ブラウザでは`100dvh`で現在の表示可能領域へ追従する。safe areaはアプリと投影オーバーレイそれぞれの境界で余白として確保する。flex/gridの中間要素は`min-height:0`、`min-width:0`で縮小を許し、コンテンツが大きいときのスクロール所有者を明示する。

セットアップは`setup-intro`とフォーム/操作領域を分離し、横画面では2列へ組み替える。開始位置は`flex-start`と自動マージンで制御し、`justify-content:safe center`の対応状況に依存させない。受付、開催者操作パネル、長いモーダルはタッチスクロール可能とする。参加者カードは表示領域内に保つ。抽選スライダーのtouch-actionはpan-yとし、横方向はpointer処理、縦方向は親パネルのネイティブスクロールへ渡す。

投影ボタンは共通ヘッダーの開催者専用操作である。ダッシュボードが有効な間だけ操作を有効化し、画面スコープでリスナーを登録・解除する。投影の描画・資源解放・ゲーム状態の契約は維持する。表示中の向き変更はCSSと既存ResizeObserverで追従し、保存状態を変更しない。

スマートフォンの投影ボードは各B/I/N/G/O行に15数字を持つ構造とする。狭い横画面は樽/最新球とボードを左右、縦画面は上部の樽/最新球と下部の横長ボードへ配置する。画面全体を`overflow:hidden`で切り捨てることで見かけの収まりを作らない。

## 8. 表示名と当選順（I-16／R-17、R-18）

`js/core/identity.js`に名前正規化、QRの生成・完全検査、HTMLへ挿入する文字列のエスケープを集約する。旧Base32 QRパーサーの契約は維持し、開催者は名前付きパーサーを用いる。QRのバージョンはカード生成v1のバージョンとは別である。

`js/core/ranking.js`は生成済みカードと出目から、標準/特殊役の各自然成立手番を計算する。特殊役は解禁手番との最大値を有効成立手番とし、現在手番で未達なら一覧へ出さない。順位は手番・ID順で安定化する。名前や読取時刻を判定へ混入させない。独立したライン定義・手番再生の参照実装で検証する。

開催者は登録者と有効照合済みのカードをMapで保持し、復元時もその和集合を生成する。照合のPromiseが完了した後でスコープと要求世代を確認し、名前・有効照合済みID・カードを同じ操作として更新してから保存する。受付確定中は名前更新も停止する。旧形式で同じIDを読む場合は名前を保持する。

保存復元では追加フィールドの型・範囲・IDキー・重複を検査し、既知の値だけを新しいオブジェクトへコピーする。新規フィールドが欠落した旧JSONの返却形は維持する。描画ではtextContentか5文字（&、<、>、二重引用符、単一引用符）のエスケープを用い、属性・本文・トースト・順位でもHTML化しない。

## 9. 更新管理（I-17／R-21）

`js/core/version.js`に実行版定数、`js/core/updates.js`に更新状態・待機処理を集約する。appはload時に登録し、情報モーダルへ同じ更新管理インスタンスを渡す。登録は`updateViaCache:none`、更新確認は`registration.update()`であり、アプリ独自の版JSONや外部サービスを設けない。

更新管理はidle/checking/current/available/applying/error/unsupportedを持つ。登録Promiseを共有し、確認・適用の連打を止める。インストール完了・メッセージ応答・controller切替はリスナーとタイマーをセットで破棄する。版応答は型・上限・正規数値を検査して数値比較し、DOMにはテキストとして渡す。閉じたモーダルは購読を解除する。

SWはインストール時のskipWaitingを廃止し、初回は通常のライフサイクルで有効化する。アプリ範囲のwindow clientから対象版が一致する適用メッセージを受けた場合だけskipWaitingする。GET_VERSIONは送信元のMessagePortへ自身のキャッシュ版を返す。precacheは`cache:reload`でブラウザの古いHTTP応答を避け、実行時の検索・navigation fallbackは自身の版のCacheに限定する。activationは旧Mobingo Cacheだけを削除してclaimする。新しい資産の取得失敗では旧版を有効なまま保つ。

packageとlockルート、版定数、SWキャッシュを同じ製品版へ同期する。`scripts/check_version.js`を静的検査へ加え、不一致を検出する。開催者の樽に抽選中属性を設け、更新適用前の受付/抽選ガードに使う。カード生成v1・保存形式は変更しない。

根拠は[Service Worker updateの仕様](https://w3c.github.io/ServiceWorker/#service-worker-registration-update)、[skipWaitingの仕様](https://w3c.github.io/ServiceWorker/#service-worker-global-scope-skipwaiting)である。実装可能性はローカルChromiumの実Worker更新試験で確認する。

## 10. URL共有（I-18／R-23）

`js/views/share-modal.js`へ共有UIと生存期間を集約する。URLは現在のlocationから生成し、search/hashを空にする。URLをinnerHTMLへ埋め込まずinput.valueとAPI引数で渡す。`app.js`は共通ヘッダーからモーダルを開き、画面再生成前に破棄関数を実行する。同時表示は1つとする。

ClipboardとWeb Shareの処理中フラグで連打を防ぎ、await前にAPIを呼ぶ。成功・失敗・finallyのDOM反映は現在のscopeがactiveの場合だけ行う。QR生成は独立したbusy/ready状態を持ち、非表示Canvasへ生成後、activeを確認して表示Canvasへ転写する。閉鎖後にライブラリが完了しても閉じた画面を描き換えない。Escapeリスナーもscopeに属し、終了時に解除して以前の接続中フォーカス先へ戻す。

新モジュールをSWのprecacheへ含め、package・lockルート・実行版・SWキャッシュを1.4.0へ同期する。共有はゲーム生成・保存形式を変更しない。APIの制約は[Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)と[Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)に基づく。実際の共有メニューと配送はOS依存であり、APIスタブとは区別する。

## 11. 実機フィードバックの切り分け（I-19／R-24）

`SoundManager.getStatus()`は対応・ミュート・context状態・直近のエラー名を返す。通常のresume拒否を記録し、旧contextのPromise完了で現在の結果を上書きしない。`testPlayback()`は同期的にresumeを要求し、成功を待って確認音を生成する。AbortSignal・2秒の期限・ミュート化・context同一性を照合し、終了時に期限とabortリスナーを解放する。

振動は共通のAPI境界でtrue/false/非対応/例外を分類し、通常操作の直近結果も保持する。`hapticsManager.testVibration()`は設定を尊重した200msの要求である。APIのtrueは物理振動を証明しない。

`license-modal.js`が確認操作と表示を所有する。音声確認中は連打を抑止し、scope破棄でabortする。確認情報はtextarea.valueで描画し、ゲームデータを参照しない。contextmenuは当該欄で伝播を止め、ページ全体の禁止設定が手動コピーを妨げないようにする。版とSWキャッシュは1.4.1へ同期する。
