-- 運営の権限を整理する
--   owner   = オーナー。すべての操作 + 運営の招待・解除
--   manager = 管理者(オーナーに招待された人)。ログインの停止・再開、公開範囲、設問の公開設定、紹介カード、回答の取り込みができる。運営の招待・解除はできない
-- 以前の editor は manager にする(CHECK 制約を変えるため、表を作り直す)
CREATE TABLE admins_new (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('owner', 'manager')),
  invited_by TEXT,                                  -- 招待したオーナーのメールアドレス
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO admins_new (email, role, created_at)
  SELECT email, CASE role WHEN 'owner' THEN 'owner' ELSE 'manager' END, created_at FROM admins;
DROP TABLE admins;
ALTER TABLE admins_new RENAME TO admins;
