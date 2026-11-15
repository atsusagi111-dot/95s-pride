# 95s PRIDE

1995年生まれのコミュニティ「95s PRIDE」の公式サイトと、会員制メンバーページです。

- 公式サイト: https://95s-pride.inquiry-router.workers.dev
- メンバー紹介: https://95s-pride.inquiry-router.workers.dev/members
- 運営管理画面: https://95s-pride.inquiry-router.workers.dev/admin(運営のみ)
- プロフィールアンケート(会員登録を兼ねる): [Googleフォーム](https://docs.google.com/forms/d/e/1FAIpQLSfeHKnrNRJpZ7EFMmod2a2JNQmQKbJfdzNyyz22lW2AiuGj9w/viewform)

旧URL(`95s-pride.vercel.app`)を開くと、新サイトへの案内ページが出ます。

## しくみ

2026年11月に、Vercel + Google Apps Script 構成から、Cloudflare Workers + D1 に移行しました。

```
ブラウザ ─▶ Cloudflare Workers(HTML/CSS/JS と /api/*) ─▶ D1(会員・プロフィール・公開設定)
                                │
                                └─▶ Gmail(確認コード・お礼メール)

Googleフォーム ─▶ スプレッドシート ◀─ 10分おきに読み取り ─ Workers
```

ブラウザからデータベースは直接見られません。必ず `/api/*` を通ります。

| 資料 | 対象 |
|---|---|
| [アーキテクチャ/エンジニア向け.md](アーキテクチャ/エンジニア向け.md) | 構成、API、データモデル、セキュリティ、既知の制約 |
| [アーキテクチャ/非エンジニア向け.md](アーキテクチャ/非エンジニア向け.md) | 運営メンバー向けの使い方と注意点 |
| [cloudflare/README.md](cloudflare/README.md) | Cloudflare 版の開発・公開 |
| [cloudflare/cutover/CUTOVER.md](cloudflare/cutover/CUTOVER.md) | 旧構成からの切り替えの記録と、戻す手順 |

## フォルダ構成

| 場所 | 中身 |
|---|---|
| `index.html` / `members.html` / `profile.html` | 各ページ |
| `css/`, `js/` | 見た目と動き |
| `assets/` | 画像。メンバー写真は `assets/members/` |
| `cloudflare/` | Workers の本体(API、定期実行、管理画面、D1 のスキーマ、テスト) |
| `.github/workflows/` | テストと自動公開 |
| `vercel.json` | 旧サイトを「新サイトはこちら」の案内ページにする設定 |
| `api/`, `gas/` | **旧構成**(Vercel Functions、Apps Script)のソース。もう動いていない記録用 |
| `tools/logo/` | ロゴSVGの生成スクリプト(公開対象外) |

## 更新と公開

1. 変更を GitHub の `main` に push する
2. GitHub Actions がテストし、合格したら自動で Cloudflare に公開する(失敗したら公開されない)

手元から公開するときは `cd cloudflare && npm run deploy`。ローカルで動かすときは `cd cloudflare && npm install && npm run dev`。

`assets/` の画像は1年キャッシュされます。写真を差し替えるときは同じファイル名で上書きせず、
新しいファイル名(例: `asuka-3.png`)で追加して、運営管理画面の「写真」欄を書き換えてください。

## 設定と秘密

秘密は Cloudflare に `wrangler secret put` で入れます(git には入れません)。

| 名前 | 内容 |
|---|---|
| `SESSION_SECRET` | ログイン状態(Cookie)の署名用 |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | メール送信に使う Gmail と、そのアプリパスワード |
| `GOOGLE_SERVICE_ACCOUNT` | 回答シートを読むサービスアカウントの JSON 鍵 |

秘密でない設定は `cloudflare/wrangler.jsonc` にあります。ローカル開発の秘密は `cloudflare/.dev.vars`(ひな形は `.dev.vars.example`)。
GitHub の Secrets には `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を入れています。
