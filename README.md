# 95s PRIDE

1995年生まれのコミュニティ「95s PRIDE」の公式サイトと、メンバー向けページのしくみです。

## リンク

| 名前 | URL | 説明 |
|---|---|---|
| 公式サイト(HP) | https://95s-pride.vercel.app | だれでも見られる公式サイト |
| メンバー紹介 | https://95s-pride.vercel.app/members | メンバー一覧と詳細ページ |
| プロフィールアンケート(回答フォーム) | https://docs.google.com/forms/d/1SDT8zRew98MbdgINQX9Ok2DUIXW_VF4A6V1sx7lV7YM/viewform | 「コミュニティ プロフィール作成アンケート」 |
| 回答が反映されるスプレッドシート | (未記入:URLを追記してください) | 回答シート、「ログイン管理」「メンバー掲載」シート |

> スプレッドシートには個人情報が入っています。共有範囲を広げないでください。

## しくみ

```
ブラウザ ─▶ Vercel(HTML/CSS/JS と /api/*) ─▶ Google Apps Script ─▶ スプレッドシート
                                                      └─▶ メール(確認コード・お礼メール)
アンケート回答 ─▶ スプレッドシート ─▶ お礼メールを自動送信
```

- ブラウザからスプレッドシートは直接見られません。必ず `/api/*` を通ります。
- 詳しくは [アーキテクチャ/非エンジニア向け.md](アーキテクチャ/非エンジニア向け.md) と [アーキテクチャ/エンジニア向け.md](アーキテクチャ/エンジニア向け.md) を読んでください。

## フォルダ構成

| 場所 | 中身 |
|---|---|
| `index.html` / `members.html` / `profile.html` | 各ページ |
| `css/`, `js/` | 見た目と動き。プロフィール写真の対応表は `js/profiles.js` |
| `assets/` | 画像。メンバー写真は `assets/members/` |
| `api/` | Vercel のサーバー処理(ログイン、メンバー情報) |
| `gas/` | スプレッドシートに入れる Apps Script(ログイン、お礼メール) |

## 更新と公開

1. 変更を GitHub に push する(push しただけでは公開されません)
2. `vercel --prod --yes` を実行して公開する
3. `gas/` を変えたときは、Apps Script の画面で「デプロイを管理 → 新バージョン」を手動で行う

### 写真を差し替えるとき

`assets/` の画像は1年キャッシュされます。同じファイル名で上書きすると古い写真が出続けるので、
必ず新しいファイル名(例: `asuka-3.png`)で追加し、`js/profiles.js` のパスを書き換えてください。

## 環境変数(`.env` / Vercel)

| 名前 | 内容 |
|---|---|
| `GAS_WEBAPP_URL` | Apps Script ウェブアプリの URL |
| `GAS_SHARED_SECRET` | Apps Script の `MEMBER_API_SECRET` と同じ値 |
| `SESSION_SECRET` | ログイン状態の署名用 |
