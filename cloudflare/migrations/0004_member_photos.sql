-- アンケートでアップロードされたプロフィール写真(任意)
-- 会員ごとに1枚。回答を送り直してプロフィールが新しくなっても、写真は引き継がれる
-- 写真は、取り込みのときに正方形・小さなサイズ(JPEG)に縮めてから、データベースに文字(base64)で保存する
CREATE TABLE member_photos (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  data_base64 TEXT NOT NULL,
  size INTEGER NOT NULL,          -- バイト数
  updated_at INTEGER NOT NULL     -- UNIX秒。写真のURLの ?v= に使い、差し替えたら新しい写真が出るようにする
);

-- フォームの回答に付いてきた写真の取り込みの状態(回答の取り込みとは別に、失敗したらやり直す)
--   photo_state: NULL = 写真なし / 'pending' = 取り込み待ち(失敗したときも、やり直すまでこの状態) / 'done' = 完了 / 'failed' = 5回失敗してあきらめた
ALTER TABLE form_imports ADD COLUMN photo_file_id TEXT;
ALTER TABLE form_imports ADD COLUMN photo_state TEXT CHECK (photo_state IN ('pending', 'done', 'failed'));
ALTER TABLE form_imports ADD COLUMN photo_attempts INTEGER NOT NULL DEFAULT 0;
