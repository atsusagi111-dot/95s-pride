/* 95s PRIDE — profiles.js(ログインなしで見られるメンバー紹介) */
(function () {
  'use strict';

  // 写真。画像を assets/members/ に置き、「'名前': 'ファイルのパス'」の形で1行ずつ追加する
  // 名前はフォームの「名前 (呼ばれたいニックネーム)」の回答と同じ表記にする。写真は自動で丸く切り抜かれる
  // 写真を差し替えるときはファイル名を変える(画像はブラウザに1年間保存されるため、同じ名前だと古い写真が出続ける)
  var PROFILE_IMAGES = {
    // '山田太郎': 'assets/members/yamada.jpg',
    'あっちゃん': 'assets/members/acchan.png',
    'ゆーり': 'assets/members/yuuri.png',
    'ゆーほ': 'assets/members/yuuho.png',
    'ワケトン': 'assets/members/waketon.png',
    '沢村 亮 （亮榎、沢村、さわむー ）': 'assets/members/sawamura.png',
    'あすか、あすかちゃん': 'assets/members/asuka-3.png',
    'りーくん。': 'assets/members/riikun.png',
  };

  function createElement(tag, className, text) {
    var el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  // 「名前」の項目の回答を返す(無ければ見出しを使う)
  function getProfileName(profile) {
    var nameItem = profile.items.filter(function (item) { return item.label.indexOf('名前') === 0; })[0];
    return (nameItem ? nameItem.value : profile.title).trim();
  }

  // 写真が登録されていない人に使う画像
  var DEFAULT_IMAGE = 'assets/members/default-avatar-2.png';

  // 写真はAPIが返す photo を優先し、無ければ上の対応表、それも無ければ共通の画像
  function createProfilePhoto(profile, className) {
    var image = createElement('img', 'member-card__image ' + className);
    var path = profile.photo || PROFILE_IMAGES[getProfileName(profile)] || DEFAULT_IMAGE;
    // 会員がアップロードした写真は「/api/photo/...」、運営が設定した写真は「assets/...」の形で届く
    image.src = path.charAt(0) === '/' ? path : '/' + path;
    image.alt = '';
    return image;
  }

  // SNS・リンクのアイコン(丸い背景に白い印)。固定の図なので、そのまま埋め込んでよい
  var LINK_ICONS = {
    x: '<path d="M6 5l12 14M18 5L6 19" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
    instagram: '<rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" stroke-width="1.9"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.9"/><circle cx="16" cy="8" r="1.1" fill="#fff"/>',
    youtube: '<rect x="4.5" y="7" width="15" height="10" rx="3" fill="#fff"/><path d="M10.6 9.6v4.8l4-2.4z" fill="#E02B20"/>',
    tiktok: '<path d="M13.5 5v9.2a3 3 0 1 1-3-3M13.5 5c.4 2.2 1.9 3.6 4 3.8" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
    other: '<circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M5 12h14M12 5c-2.6 2.2-2.6 11.8 0 14M12 5c2.6 2.2 2.6 11.8 0 14" fill="none" stroke="#fff" stroke-width="1.6"/>'
  };

  // SNS・リンクのアイコンの並び。押すと、そのページが新しいタブで開く
  function createProfileLinks(links) {
    var list = createElement('ul', 'profile-links');
    (links || []).forEach(function (link) {
      // http(s) 以外は出さない(念のため)
      if (!/^https:\/\//.test(link.url)) return;
      var kind = LINK_ICONS[link.kind] ? link.kind : 'other';
      var item = document.createElement('li');
      var anchor = createElement('a', 'profile-links__item profile-links__item--' + kind);
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer nofollow';
      anchor.title = link.label;
      anchor.setAttribute('aria-label', link.label + 'を開く');
      anchor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + LINK_ICONS[kind] + '</svg>';
      item.appendChild(anchor);
      list.appendChild(item);
    });
    return list.children.length ? list : null;
  }

  // ログインなしで見られるプロフィール
  function loadProfiles() {
    return fetch('/api/public-profiles').then(function (res) {
      return res.ok ? res.json() : { profiles: [] };
    }).then(function (data) {
      return data.profiles || [];
    });
  }

  // ログインした人だけが見られるプロフィール(ログインしていなければ status 401 で失敗させる)
  function loadMemberProfiles() {
    return fetch('/api/member-profiles', { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) {
        var error = new Error('member_profiles_failed');
        error.status = res.status;
        throw error;
      }
      return res.json();
    }).then(function (data) {
      return data.profiles || [];
    });
  }

  /* ---------- 一覧(メンバーページ):表示名と写真だけを出し、詳細ページへリンクする ---------- */
  // 詳細ページのURLは固定ID「?id=」。IDが無い(旧API)ときだけ順番の「?no=」(公開)か「?m=」(会員限定)
  function createProfileCard(profile, index, query) {
    var card = createElement('li', 'member-card profile-card');
    var link = createElement('a', 'profile-card__link');
    link.href = profile.id ? '/profile?id=' + encodeURIComponent(profile.id) : '/profile?' + query + '=' + (index + 1);
    var photo = createProfilePhoto(profile, '');
    photo.loading = 'lazy';
    link.appendChild(photo);
    link.appendChild(createElement('h3', 'member-card__name', profile.title || getProfileName(profile)));
    link.appendChild(createElement('span', 'profile-card__more', 'プロフィールを見る'));
    card.appendChild(link);
    return card;
  }

  function showProfileList(container) {
    loadProfiles().then(function (profiles) {
      var list = document.getElementById('publicProfileList');
      profiles.forEach(function (profile, index) { list.appendChild(createProfileCard(profile, index, 'no')); });
      container.hidden = profiles.length === 0;
    }).catch(function () {});
  }

  /* ---------- 会員限定の一覧(ログイン後にメンバーページで表示) ---------- */
  function showMemberProfileList(container) {
    var list = document.getElementById('memberProfileList');
    loadMemberProfiles().then(function (profiles) {
      list.textContent = '';
      profiles.forEach(function (profile, index) { list.appendChild(createProfileCard(profile, index, 'm')); });
      container.hidden = profiles.length === 0;
      // プロフィールが出るときは「COMING SOON」を隠す
      var empty = document.getElementById('memberEmpty');
      if (empty && profiles.length) empty.hidden = true;
    }).catch(function () {
      container.hidden = true;
    });
  }

  function hideMemberProfileList(container) {
    document.getElementById('memberProfileList').textContent = '';
    container.hidden = true;
  }

  /* ---------- 詳細ページ:公開してよい回答をすべて出す ---------- */
  // 固定IDで1件取る(会員限定ならログインしていないと 401)
  function loadProfileById(id) {
    return fetch('/api/profile/' + encodeURIComponent(id), { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) {
        var error = new Error('profile_failed');
        error.status = res.status;
        throw error;
      }
      return res.json();
    }).then(function (data) {
      return data.profile;
    });
  }

  // 「?id=」なら固定IDで1件。古いURLの「?m=」(会員限定)・「?no=」(公開)は一覧の順番で探す
  function showProfileDetail(container) {
    var params = new URLSearchParams(location.search);
    var id = params.get('id');
    var isMemberOnly = params.has('m');
    var number = Number(isMemberOnly ? params.get('m') : params.get('no'));
    var status = document.getElementById('profileStatus');

    var loading = id
      ? loadProfileById(id)
      : (isMemberOnly ? loadMemberProfiles() : loadProfiles()).then(function (profiles) { return profiles[number - 1]; });

    loading.then(function (profile) {
      if (!profile) {
        status.textContent = 'プロフィールが見つかりませんでした。';
        return;
      }
      var title = profile.title || getProfileName(profile);
      document.title = title + ' | 95s PRIDE';

      container.appendChild(createProfilePhoto(profile, 'profile-detail__photo'));
      container.appendChild(createElement('h1', 'profile-detail__name', title));
      var links = createProfileLinks(profile.links);
      if (links) container.appendChild(links);
      var items = createElement('dl', 'profile-card__list');
      profile.items.forEach(function (item) {
        items.appendChild(createElement('dt', 'profile-card__label', item.label));
        items.appendChild(createElement('dd', 'profile-card__value', item.value));
      });
      container.appendChild(items);
      status.hidden = true;
      container.hidden = false;
    }).catch(function (error) {
      if (error && error.status === 401) {
        status.textContent = 'このプロフィールはメンバー限定です。メンバーページからログインしてください。';
        return;
      }
      status.textContent = 'ただいま表示できません。時間をおいてもう一度お試しください。';
    });
  }

  var listContainer = document.getElementById('publicProfiles');
  var detailContainer = document.getElementById('profileDetail');
  if (listContainer) showProfileList(listContainer);
  if (detailContainer) showProfileDetail(detailContainer);

  // members.js がログイン・ログアウトを知らせてきたら、会員限定の一覧を出し入れする
  var memberContainer = document.getElementById('memberProfiles');
  if (memberContainer) {
    document.addEventListener('member:login', function () { showMemberProfileList(memberContainer); });
    document.addEventListener('member:logout', function () { hideMemberProfileList(memberContainer); });
  }
})();
