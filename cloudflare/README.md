# 95s PRIDE — Cloudflare 版

サイト配信・会員API・運営向け管理画面を、Cloudflare Workers + D1 でひとつにまとめたものです。
(GitHub Issue #1 の提案に基づく移行。移行が終わるまでは、リポジトリ直下の Vercel 版が本番です)

```
ブラウザ ─▶ Workers(HTML/CSS/JS/画像 + /api/*) ─▶ D1(会員・プロフィール・公開設定)
                                   ├─▶ Gmail SMTP(確認コード・お礼メール)
Googleフォーム ─▶ スプレッドシート ◀─ 10分おきに読み取り(サービスアカウント)
```

## フォルダ

| 場所 | 中身 |
|---|---|
| `src/index.js` | 入口。`/api/*` の振り分け、静的ファイル配信、定期実行 |
| `src/routes/` | 認証(`auth.js`)、プロフィール配信(`profiles.js`)、管理API(`admin.js`) |
| `src/lib/` | パスワード・セッション・D1・メール・シート読み取り・取り込み |
| `migrations/` | D1 のスキーマ(`wrangler d1 migrations apply` で当てる) |
| `site-extra/` | Cloudflare 版だけにあるページ(運営管理画面 `admin.html`) |
| `scripts/` | `build-public.mjs`(静的ファイルを `public/` に集める)、移行用の取り込みスクリプト |
| `test/` | Workers 実行環境上で動くテスト(`npm test`) |

サイト本体(HTML/CSS/JS/画像)はリポジトリ直下のものをそのまま使います。`npm run build` が `public/` に集めます。

## 開発

```
npm install
npm run migrate:local   # ローカル D1 にスキーマを当てる(初回)
npm run dev             # http://localhost:8787
npm test
```

ローカルの秘密は `.dev.vars`(git には入れない)。`.dev.vars.example` を参考に作ります。
`MAIL_DRY_RUN=1` のときはメールを送らずログに出します。

## 本番の秘密(wrangler secret put で入れる)

| 名前 | 内容 |
|---|---|
| `SESSION_SECRET` | ログイン Cookie の署名用のランダムな文字列 |
| `GMAIL_USER` | 送信に使う Gmail アカウント |
| `GMAIL_APP_PASSWORD` | そのアカウントのアプリパスワード(2段階認証が必要) |
| `GOOGLE_SERVICE_ACCOUNT` | 回答シートを読むサービスアカウントの JSON 鍵(1行) |

秘密でない設定(シートID、差出人など)は `wrangler.jsonc` の `vars` にあります。

## 公開

GitHub の `main` に push すると、`.github/workflows/deploy.yml` がテストを通してから自動で公開します。
手元から公開するときは `npm run deploy`。

## 運営の操作

`/admin` を開き、運営メンバー(D1 の `admins` にあるメールアドレス)としてログインすると、
公開範囲の切り替え・ログイン停止・設問の公開設定・紹介カードの編集・フォーム回答の取り込みができます。
