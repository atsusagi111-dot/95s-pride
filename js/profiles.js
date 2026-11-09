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

  function createProfilePhoto(profile, className) {
    var image = createElement('img', 'member-card__image ' + className);
    image.src = '/' + (PROFILE_IMAGES[getProfileName(profile)] || DEFAULT_IMAGE);
    image.alt = '';
    return image;
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
  // query は詳細ページのURLの「?no=」(公開)か「?m=」(会員限定)
  function createProfileCard(profile, index, query) {
    var card = createElement('li', 'member-card profile-card');
    var link = createElement('a', 'profile-card__link');
    link.href = '/profile?' + query + '=' + (index + 1);
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

  /* ---------- 詳細ページ:Q2以降の回答をすべて出す ---------- */
  // 「?m=」なら会員限定(ログインが必要)、「?no=」なら公開のプロフィールを出す
  function showProfileDetail(container) {
    var params = new URLSearchParams(location.search);
    var isMemberOnly = params.has('m');
    var number = Number(isMemberOnly ? params.get('m') : params.get('no'));
    var status = document.getElementById('profileStatus');

    (isMemberOnly ? loadMemberProfiles() : loadProfiles()).then(function (profiles) {
      var profile = profiles[number - 1];
      if (!profile) {
        status.textContent = 'プロフィールが見つかりませんでした。';
        return;
      }
      var title = profile.title || getProfileName(profile);
      document.title = title + ' | 95s PRIDE';

      container.appendChild(createProfilePhoto(profile, 'profile-detail__photo'));
      container.appendChild(createElement('h1', 'profile-detail__name', title));
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
