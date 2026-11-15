-- 運営の権限を2段階にし、操作の記録を残す
-- owner  = オーナー(全操作。ログインの停止・再開、設問の公開設定もできる)
-- editor = 編集者(公開範囲・写真・紹介カード・取り込みはできるが、停止と設問の公開設定はできない)
ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'editor'));

-- 運営の操作の記録(いつ、だれが、何をしたか)
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,      -- 例: profile.visibility / member.suspend / card.create / sync
  target TEXT,               -- 例: プロフィールの名前、会員のメール
  detail TEXT                -- 例: members → public
);
CREATE INDEX idx_admin_log_at ON admin_log(at DESC);
