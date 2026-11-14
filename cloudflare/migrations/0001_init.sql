-- 95s PRIDE 会員データベース(D1)の初期スキーマ
-- 方針: 人は固定IDで識別し、公開範囲は行番号ではなく明示的なフラグで持つ

-- 会員(ログインできる人)。メールアドレスは1人1つ
CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,                               -- scrypt$salt$key。未設定なら NULL
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),      -- suspended = ログイン停止
  note TEXT,                                        -- 運営用メモ
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 設問の定義。公開してよい設問をここで明示する(フォームに設問が増えても勝手に公開されない)
CREATE TABLE questions (
  key TEXT PRIMARY KEY,                             -- q1 〜 q19
  label TEXT NOT NULL,                              -- 画面に出す見出し(「Q1 」などの番号は除く)
  is_public INTEGER NOT NULL DEFAULT 0,             -- 1 = ログインなしの公開プロフィールにも出す
  is_title INTEGER NOT NULL DEFAULT 0,              -- 1 = カードの見出しにする設問
  sort_order INTEGER NOT NULL
);

-- プロフィール(アンケートの1回答 = 1件)。同じ人が複数回答したら is_current で最新だけ出す
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,                        -- 詳細URL用の固定ID(順番が変わっても別人を指さない)
  member_id INTEGER REFERENCES members(id),         -- メールアドレスの無い回答は NULL
  responded_at TEXT,                                -- 回答日時(ISO 8601)
  sheet_row INTEGER,                                -- 移行元シートの行番号(照合用。移行後は使わない)
  display_name TEXT NOT NULL,                       -- Q2 名前(写真の対応にも使う)
  birth_date TEXT,                                  -- YYYY-MM-DD
  photo_path TEXT,                                  -- assets/members/xxx.png
  visibility TEXT NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('public', 'members', 'hidden')),  -- public=誰でも / members=会員のみ / hidden=出さない
  is_current INTEGER NOT NULL DEFAULT 1,            -- 同じ会員の最新回答だけ 1
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_profiles_member ON profiles(member_id);
CREATE INDEX idx_profiles_visibility ON profiles(visibility, is_current);

-- 各プロフィールの回答(設問ごとに1行)
CREATE TABLE profile_answers (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL REFERENCES questions(key),
  answer TEXT NOT NULL,
  PRIMARY KEY (profile_id, question_key)
);

-- 「メンバー掲載」シートの置き換え(ログイン後に出す紹介カード)
CREATE TABLE member_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT,
  bio TEXT,
  image_url TEXT,
  instagram_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 管理画面に入れる運営メンバー
CREATE TABLE admins (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- パスワード設定用の確認コード(GAS の CacheService の置き換え)
CREATE TABLE auth_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,                          -- コードはそのまま保存しない
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,                      -- UNIX秒
  created_at INTEGER NOT NULL
);

-- 回数制限(再送の間隔、送信回数、ログイン失敗回数)
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,                             -- 例: login-attempts:メール / send-count:メール
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL                       -- UNIX秒。過ぎたら無効
);

-- フォーム回答の取り込み記録(同じ回答を二重に取り込まない・お礼メールを二重に送らない)
CREATE TABLE form_imports (
  response_key TEXT PRIMARY KEY,                    -- 回答日時 + メールアドレス
  profile_id INTEGER REFERENCES profiles(id),
  thanks_mail_sent_at TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
