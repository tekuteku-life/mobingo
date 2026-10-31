# Mobingo（モビンゴ）

Mobingoは、4文字IDから同じビンゴカードと出目を再現する静的Webアプリである。開催者と参加者の端末間通信を必要とせず、初回取得とキャッシュ完了後はオフラインで進行できる。実行用ビルドと外部CDNは不要である。

モードAは参加者を事前登録し、リーチ・ビンゴ成立者・次球の予告を自動集計する。モードBは事前登録を省略し、当選申告時にQRまたはIDで照合する。4文字IDはカード識別用であり、本人認証や完全な不正防止を保証するものではない。

参加者は任意の表示名を設定・変更でき、名前付きQRで開催者へ渡せる。開催者の当選順は最初の有効成立手番で算出し、同じ手番は同順位とする。モードBでは有効と照合済みのカードだけを一覧へ含める。旧QRと旧保存は引き続き受理するが、新QRの読取には開催者側もアプリ更新が必要である。

## 文書

- [開発プロセス定義書](docs/development_process.md)
- [要求仕様書](docs/requirements.md)
- [外部設計書](docs/external_design.md)
- [内部設計書](docs/internal_design.md)
- [UI設計書](docs/ui_design.md)
- [設計とテストの対応・実測結果](docs/design_test_audit.md)
- [レビュー記録](docs/reviews/)

`req.md`は初期原案として保持する。現行の契約と原案からの移行判断は`docs/`を参照する。

## 起動と配信

リポジトリのルートを静的HTTPサーバーで配信する。

```sh
python3 -m http.server 8000
```

ブラウザで`http://localhost:8000`を開く。Web CryptoとService Workerを利用するため、本番はHTTPS、ローカルはlocalhostを使用する。`file://`による直接起動をPWA検証の代用にはしない。

GitHub Pagesでは、公開対象ブランチのルートを配信元に指定する。初回はオンラインで資産取得を完了し、その後のオフライン再訪を確認する。ブラウザが保存データを消去した場合の復旧や、モードA受付途中の一覧復元は提供しない。

## 開発と検証

検証環境はNode.js 24とChromiumである。依存関係をlockfileから導入する。

```sh
npm ci
npm run lint
npm run test:unit
npm run test:integration
npm run test:system
npm run test:ui
npm run test:coverage
```

`npm test`は単体・結合・システム、`npm run test:all`はこれらとUIを実行する。`test:coverage`も全4層を実行し、Node V8とChromium CDPの位置情報を合算する。`.coverage/summary.md`と`.coverage/coverage.json`へ結果を出力し、自作`js/`と`sw.js`の各ファイルでLine/Branchのいずれかが97%未満なら失敗する。未ロードの対象も0%として含める。

ブラウザ試験はローカルHTTP待受と子プロセス起動を必要とする。既定のブラウザは`/usr/bin/chromium`であり、別配置では`CHROME_BIN`へ実行ファイルのパスを設定する。各試験は独立したブラウザコンテキストを使用する。

実機カメラの光学性能、実際の音声・振動・Wake Lock、外部モニター、本番HTTPS、既存PWAからの更新は別途確認する。カメラ入力のモックとQR画像の実デコードは異なる検証として記録する。

コードはタブインデント、文書は「である」調、コミットは英語である。設計・テスト・最終実装には独立レビューを必須とする。手順と未達時の扱いは開発プロセス定義書に従う。

## 構成

| 配置 | 内容 |
| --- | --- |
| `index.html`、`css/` | エントリーポイントとレイアウト |
| `js/core/` | ID・表示名・QR、鍵導出、乱数、判定・順位、保存、端末API、ライフサイクル |
| `js/views/`、`js/components/` | 画面、モーダル、スライダー、Canvas |
| `js/lib/` | ローカル同梱のQR生成・読取・紙吹雪ライブラリ |
| `sw.js`、`manifest.json`、`icons/` | PWA配信資産 |
| `test/unit/`、`integration/`、`system/`、`ui/` | 必須の4層テスト |
| `scripts/`、`types/` | 静的検査とカバレッジ、ブラウザ型宣言 |

商標および同梱ライブラリの表記はアプリ内の情報モーダルに掲載する。
