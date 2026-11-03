/* 95s PRIDE — profiles.js(ログインなしで見られるメンバー紹介) */
(function () {
  'use strict';

  // 写真。画像を assets/members/ に置き、「'名前': 'ファイルのパス'」の形で1行ずつ追加する
  // 名前はフォームの「名前 (呼ばれたいニックネーム)」の回答と同じ表記にする。写真は自動で丸く切り抜かれる
  var PROFILE_IMAGES = {
    // '山田太郎': 'assets/members/yamada.jpg',
    'あっちゃん': 'assets/members/acchan.png',
    'ゆーり': 'assets/members/yuuri.png',
    'ゆーほ': 'assets/members/yuuho.png',
    'ワケトン': 'assets/members/waketon.png',
    '沢村 亮 （亮榎、沢村、さわむー ）': 'assets/members/sawamura.png',
    'あすか、あすかちゃん': 'assets/members/asuka.png',
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

  function createProfilePhoto(profile, className) {
    var name = getProfileName(profile);
    var src = PROFILE_IMAGES[name];
    if (!src) return createElement('span', 'member-card__initial ' + className, name.charAt(0));
    var image = createElement('img', 'member-card__image ' + className);
    image.src = '/' + src;
    image.alt = '';
    return image;
  }

  function loadProfiles() {
    return fetch('/api/public-profiles').then(function (res) {
      return res.ok ? res.json() : { profiles: [] };
    }).then(function (data) {
      return data.profiles || [];
    });
  }

  /* ---------- 一覧(メンバーページ):表示名と写真だけを出し、詳細ページへリンクする ---------- */
  function createProfileCard(profile, index) {
    var card = createElement('li', 'member-card profile-card');
    var link = createElement('a', 'profile-card__link');
    link.href = '/profile?no=' + (index + 1);
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
      profiles.forEach(function (profile, index) { list.appendChild(createProfileCard(profile, index)); });
      container.hidden = profiles.length === 0;
    }).catch(function () {});
  }

  /* ---------- 詳細ページ:Q2以降の回答をすべて出す ---------- */
  function showProfileDetail(container) {
    var number = Number(new URLSearchParams(location.search).get('no'));
    var status = document.getElementById('profileStatus');

    loadProfiles().then(function (profiles) {
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
    }).catch(function () {
      status.textContent = 'ただいま表示できません。時間をおいてもう一度お試しください。';
    });
  }

  var listContainer = document.getElementById('publicProfiles');
  var detailContainer = document.getElementById('profileDetail');
  if (listContainer) showProfileList(listContainer);
  if (detailContainer) showProfileDetail(detailContainer);
})();
