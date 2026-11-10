# 95s PRIDE

1995年生まれのコミュニティ「95s PRIDE」の公式サイトと、会員制メンバーページです。

- 公式サイト: https://95s-pride.vercel.app
- メンバー紹介: https://95s-pride.vercel.app/members
- プロフィールアンケート(会員登録を兼ねる): [Googleフォーム](https://docs.google.com/forms/d/e/1FAIpQLSfeHKnrNRJpZ7EFMmod2a2JNQmQKbJfdzNyyz22lW2AiuGj9w/viewform)

## しくみ

```
ブラウザ ─▶ Vercel(HTML/CSS/JS と /api/*) ─▶ Google Apps Script ─▶ スプレッドシート
                                                      └─▶ メール(確認コード)
アンケート回答 ─▶ スプレッドシート ─▶ お礼メールを自動送信
```

ブラウザからスプレッドシートは直接見られません。必ず `/api/*` を通ります。

| 資料 | 対象 |
|---|---|
| [アーキテクチャ/エンジニア向け.md](アーキテクチャ/エンジニア向け.md) | 構成、API、データモデル、セキュリティ、既知の制約 |
| [アーキテクチャ/非エンジニア向け.md](アーキテクチャ/非エンジニア向け.md) | 運営メンバー向けの使い方と注意点 |

## フォルダ構成

| 場所 | 中身 |
|---|---|
| `index.html` / `members.html` / `profile.html` | 各ページ |
| `css/`, `js/` | 見た目と動き。プロフィール写真の対応表は `js/profiles.js` |
| `assets/` | 画像。メンバー写真は `assets/members/` |
| `api/` | Vercel Functions(ログイン、メンバー情報) |
| `gas/` | スプレッドシートに入れる Apps Script(ログイン、お礼メール) |
| `tools/logo/` | ロゴSVGの生成スクリプト(公開対象外) |

## 更新と公開

1. 変更を GitHub に push する(push しただけでは公開されません)
2. `vercel --prod` を実行して公開する
3. `gas/` を変えたときは、Apps Script の画面で「デプロイを管理 → 編集 → 新バージョン」を手動で行う

`assets/` の画像は1年キャッシュされます。写真を差し替えるときは同じファイル名で上書きせず、
新しいファイル名(例: `asuka-3.png`)で追加して `js/profiles.js` のパスを書き換えてください。

## 環境変数(`.env.local` / Vercel)

| 名前 | 内容 |
|---|---|
| `GAS_WEBAPP_URL` | Apps Script ウェブアプリの URL |
| `GAS_SHARED_SECRET` | Apps Script の `MEMBER_API_SECRET` と同じ値 |
| `SESSION_SECRET` | ログイン状態(Cookie)の署名用 |
