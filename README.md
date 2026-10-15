# Mobingo（モビンゴ）- どこでも簡単デジタルビンゴ

ネットワーク通信を一切使用せず、決定論的擬似乱数（PRNG）と4文字のシード値・QRコードを用いて、開催者（司会進行）と参加者を同期・検証する完全オフライン対応のデジタルビンゴシステムです。

**ビルドステップ一切不要**（純粋な HTML / CSS / JavaScript (ES Modules)）で構成されており、このリポジトリをそのまま **GitHub Pages** にプッシュ・公開するだけで即座に稼働します。

---

## 🌟 特徴

* **電波いらずで100%動作**: 地下会場や大規模イベントなど圏外の環境でも完全オフラインで動作（PWA / Service Worker キャッシュ対応）。
* **触覚＆音響フィードバック**: 紙のビンゴカードの「パコッ」と穴を開ける触覚・視覚体験を Web Audio API（シンセサイザー合成音）と Vibration API で忠実に再現。
* **非対称トグル操作**:
  * 通常タップ（`< 400ms`）: 開封 ＋ 30ms 振動 ＋ パコッ打鍵音 ＋ パンチ穴演出
  * 長押し（`>= 600ms`）: 復元 ＋ 2連振動 ＋ ポン復元音 ＋ ポップアップ演出（指が10px移動した場合は安全キャンセル）
* **2つの同期・検証モード**:
  * **モードA（事前登録モード）**: 少人数〜50人規模。開始前にカメラで全員の参加者QRを高速連続受付。全員のリーチ・ビンゴをリアルタイム自動検知、激アツ数字予告、逆ビンゴ賞（ドベ賞）算出。
  * **モードB（事後検証モード）**: 100人以上の大規模・即開始。自己申告時に開催者カメラでQRまたは4文字IDをスキャンし、第何手目にビンゴが成立したかを厳密逆算照合。
* **特殊役（途中解禁システム）**: 四隅（Four Corners）、クロス（X-Shape）、プラス（+ Cross）の途中解禁に対応。解禁手番以降の成立かを受付・照合側で厳密判定。
* **タブレット横向き＆外部投影対応**: 横向き表示時は画面右側に1〜75出目ボードが常時展開。大画面投影用全画面モードも完備。
* **モバイルブラウザ制御**: 画面スリープ防止（Screen Wake Lock API）、ズーム・スクロール・テキスト選択・コンテキストメニュー防止、LocalStorage自動復帰。

---

## 📁 ディレクトリ構成

```
mobingo/
├── index.html                 # アプリのエントリーポイント
├── manifest.json              # PWA マニフェスト（相対パス対応）
├── sw.js                      # オフライン Service Worker（Cache-First）
├── icons/
│   └── icon.svg               # PWA用ベクターアイコン
├── css/
│   └── style.css              # ダークテーマ、3Dカード、パンチ穴、マルチリーチ発光スタイル
└── js/
    ├── app.js                 # アプリ起動・ヘッダー・ルーティング
    ├── core/
    │   ├── base32.js          # Crockford's Base32（誤認文字除外・正規化サニタイズ）
    │   ├── crypto.js          # Web Crypto PBKDF2-SHA256（30,000回反復・ドメイン分離）
    │   ├── chacha20.js        # ChaCha20 PRNG（RFC 8439準拠 512-bit状態空間・決定論的乱数）
    │   ├── bingo.js           # 出目生成、カード生成、リーチ・ビンゴ判定、手番別逆算検証
    │   ├── audio.js           # Web Audio API シンセサイザー効果音（完全オフライン）
    │   ├── haptics.js         # Vibration API 触覚フィードバック
    │   ├── wakelock.js        # Screen Wake Lock API 画面スリープ防止
    │   ├── storage.js         # LocalStorage 自動保存＆復元
    │   └── icons.js           # インラインSVGアイコン
    ├── views/
    │   ├── mode-select.js     # モード選択画面（参加者／開催者）
    │   ├── child.js           # 参加者画面（スクロールレスカード、非対称トグル、QRモーダル、リセット）
    │   ├── host.js            # 開催者画面（セットアップ、事前スキャナー、ダッシュボード、出目ボード、照合、投影）
    │   └── license-modal.js   # ライセンス＆商標表示モーダル
    └── lib/
        ├── qrcode.min.js      # QRコード生成（MIT License）
        ├── jsqr.js            # QRコード読取（Apache License 2.0）
        └── confetti.js        # 紙吹雪エフェクト（ISC License）
```

---

## 🚀 GitHub Pages へのデプロイ方法

ビルドコマンドは一切必要ありません。
リポジトリのルートをそのまま GitHub Pages に設定するだけで即座に公開できます。

1. 本リポジトリを GitHub に push します。
2. リポジトリの **Settings** > **Pages** を開きます。
3. **Build and deployment** の Source で **Deploy from a branch** を選択。
4. Branch を `main`（または使用しているブランチ）、Folder を `/ (root)` に設定して **Save** をクリックします。
5. 数分で発行される URL（例: `https://<username>.github.io/<repo>/`）にアクセスすれば完了です。

---

## 💻 ローカルでの確認方法

ブラウザで直接 `index.html` を開くか、または任意の静的HTTPサーバー（Python, npx serve等）で確認できます。

```bash
# Python 3 の場合
python3 -m http.server 8000

# または npx serve の場合
npx serve .
```
ブラウザで `http://localhost:8000` を開きます。

---

## 📜 ライセンス・商標表記

* 本プロジェクトはオープンソース（MIT License）です。
* **商標表記**: QRコードは株式会社デンソーウェーブの登録商標です。
