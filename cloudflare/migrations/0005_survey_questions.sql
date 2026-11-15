-- アンケートの設問を、画面を作るための定義としてデータベースに持たせる(Googleフォームの置き換え)
-- input_type: text = 1行 / textarea = 複数行 / choice = 選択肢から1つ
ALTER TABLE questions ADD COLUMN input_type TEXT NOT NULL DEFAULT 'textarea' CHECK (input_type IN ('text', 'textarea', 'choice'));
ALTER TABLE questions ADD COLUMN required INTEGER NOT NULL DEFAULT 0;  -- 1 = 必須
ALTER TABLE questions ADD COLUMN help TEXT NOT NULL DEFAULT '';        -- 設問の下に出す説明・回答例
ALTER TABLE questions ADD COLUMN options TEXT;                         -- choice のときの選択肢(JSON の配列)
ALTER TABLE questions ADD COLUMN section TEXT NOT NULL DEFAULT '';     -- 見出し(同じ見出しが続く間は同じまとまり)

-- 現在のGoogleフォームの設問(Q1〜Q19)を登録する。すでにある設問は、公開設定などを変えずに新しい項目だけ上書きする

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q1', 'オプチャの表示名', 1, 1, 1, 'text', 1, '※自分で設定したオプチャの表示名', NULL, '01 基本情報')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q2', '名前 (呼ばれたいニックネーム)', 1, 0, 2, 'text', 1, '例)タカシ、たかぽん、鈴木', NULL, '01 基本情報')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q3', '生年月日', 1, 0, 3, 'text', 1, '例)1995年5月8日', NULL, '01 基本情報')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q4', '地域(出身地/現在の拠点)', 1, 0, 4, 'text', 1, '例)北海道出身/東京都渋谷区メイン、たまに福岡', NULL, '01 基本情報')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q5', '趣味・活動・発信してることなど', 1, 0, 5, 'textarea', 0, '例)X:@xxxxxx / Instagram: @xxxxxx', NULL, '01 基本情報')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q6', '現在の仕事・普段メインでやっていること', 1, 0, 6, 'textarea', 1, '例) IT系ベンチャーで法人営業/フリーランスでWebデザイン', NULL, '02 現在の立ち位置と「提供」できること')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q7', '身につけたスキル・知識 (仕事以外も可)', 1, 0, 7, 'textarea', 1, '例)初対面の人と5分で打ち解けるカ/スパイスからカレーを作る知識', NULL, '02 現在の立ち位置と「提供」できること')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q8', 'メンバーに提供できること・頼ってほしいこと', 1, 0, 8, 'textarea', 1, '例)壁打ち相手/簡単なLP・バナー制作/都内の焼肉屋の予約手配', NULL, '02 現在の立ち位置と「提供」できること')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q9', 'このコミュニティに加入した理由 (決め手)', 1, 0, 9, 'textarea', 1, '例)同年代と刺激し合いたい/本気で何かを生み出せる「共犯者」が欲しい', NULL, '03 95sPRIDEへの加入理由・やりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q10', '今の生活・仕事への一番のモヤモヤ・物足りなさ', 1, 0, 10, 'textarea', 1, '例)安定しているが「代わりはいる」と焦る。ゼロから生み出す熱狂が欲しい', NULL, '03 95sPRIDEへの加入理由・やりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q11', '仕掛けたい、またはやりたい、挑戦したいこと', 1, 0, 11, 'textarea', 0, '例) 地元の空き家を秘密基地のようなカフェ&バーにしたい', NULL, '03 95sPRIDEへの加入理由・やりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q12', '自然にできる「得意技」と、致命的な「苦手分野」', 1, 0, 12, 'textarea', 1, '例)得意:散らかった情報を図解で整理 / 苦手:決められたルーティンワーク', NULL, '04 性格、こだわり')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q13', '「ちょっと変かも?」と思うこだわり・性格の癖', 1, 0, 13, 'textarea', 1, '例)計画は分単位で練るのに、当日は思いつきで全部壊したくなる', NULL, '04 性格、こだわり')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q14', '今強く興味があること・学んでみたいこと', 1, 0, 14, 'textarea', 1, '例) AIによる業務自動化/地方創生・コミュニティづくり/コーチング', NULL, '05 興味関心・95sPRIDEでやりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q15', '最近いちばん時間かお金を溶かしている偏愛コンテンツ', 1, 0, 15, 'textarea', 0, '例)深夜に見る他人のキャンプ動画、豪邸の内見動画', NULL, '05 興味関心・95sPRIDEでやりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q16', 'メンバーと「こう絡みたい」「一緒にやりたい」妄想', 1, 0, 16, 'textarea', 1, '例) アイデアを形にできる人とWebサービスを作る/サウナ友から壁打ち相手に', NULL, '05 興味関心・95sPRIDEでやりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q17', 'コミュニティのために「これやりたい」から手伝ってほしい', 1, 0, 17, 'textarea', 1, '例）スポーツ大会したい
必要なこと：場所押さえる人、運動項目考える人、物品準備する人...etc', NULL, '05 興味関心・95sPRIDEでやりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q18', '最後に。あなたは何者になりたいですか？', 1, 0, 18, 'text', 1, '', NULL, '05 興味関心・95sPRIDEでやりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;

INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section)
VALUES ('q19', 'プロフィール回答特典について', 0, 0, 19, 'choice', 1, '※アンケート回答後に案内メールが届きます', '["プロフィール回答特典（なんでもお悩み相談15分～30分）を受け取る", "受け取らない"]', '05 興味関心・95sPRIDEでやりたいこと')
ON CONFLICT(key) DO UPDATE SET input_type = excluded.input_type, required = excluded.required, help = excluded.help, options = excluded.options, section = excluded.section;
