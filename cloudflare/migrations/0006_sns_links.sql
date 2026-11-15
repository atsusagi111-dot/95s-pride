-- 「趣味・活動・発信してることなど」(q5)は入力欄として残す。SNSのリンクは別の欄に分けたので、回答例を趣味・活動向けに直す
UPDATE questions SET help = '例)キャンプ・ランニング/週末はカフェ巡り/副業でデザインの仕事' WHERE key = 'q5';

-- q6 以降の並び順を5つ後ろにずらし、q5 のあとに SNS の5項目を入れる(趣味・活動の記入欄 → SNS・リンクの順)
UPDATE questions SET sort_order = sort_order + 5 WHERE sort_order > 5;

-- SNS・リンク(入力は @ID でもURLでもよい。保存するときにURLにそろえる)。プロフィールではアイコンのリンクとして出す
INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section) VALUES
  ('sns_x', 'X(旧Twitter)', 1, 0, 6, 'text', 0, '例)@xxxxxx', NULL, '01 基本情報'),
  ('sns_instagram', 'Instagram', 1, 0, 7, 'text', 0, '例)@xxxxxx', NULL, '01 基本情報'),
  ('sns_youtube', 'YouTube', 1, 0, 8, 'text', 0, '例)@xxxxxx またはチャンネルのURL', NULL, '01 基本情報'),
  ('sns_tiktok', 'TikTok', 1, 0, 9, 'text', 0, '例)@xxxxxx', NULL, '01 基本情報'),
  ('sns_other', 'その他(HP・ブログなど)', 1, 0, 10, 'text', 0, '例)https://example.com', NULL, '01 基本情報');
