/* 95s PRIDE — members.js */
(function () {
  'use strict';

  var loading = document.getElementById('memberLoading');
  var login = document.getElementById('memberLogin');
  var content = document.getElementById('memberContent');
  var emailForm = document.getElementById('emailForm');
  var resetForm = document.getElementById('resetForm');
  var codeForm = document.getElementById('codeForm');
  var emailInput = document.getElementById('loginEmail');
  var passwordInput = document.getElementById('loginPassword');
  var resetEmail = document.getElementById('resetEmail');
  var resetPassword = document.getElementById('resetPassword');
  var codeInput = document.getElementById('loginCode');
  var message = document.getElementById('loginMessage');
  var list = document.getElementById('memberList');
  var empty = document.getElementById('memberEmpty');
  var pendingEmail = ''; // 確認コードを送ったメールアドレス

  var ERROR_MESSAGES = {
    invalid_email: 'メールアドレスの形式を確認してください。',
    invalid_password: 'パスワードは8文字以上で入力してください。',
    invalid_credentials: 'メールアドレスまたはパスワードが正しくありません。',
    too_many_attempts: 'ログインの試行が多すぎます。15分ほど待ってからお試しください。',
    invalid_code: 'コードが正しくないか、有効期限が切れています。'
  };
  var DEFAULT_ERROR = 'ただいま利用できません。時間をおいてもう一度お試しください。';

  function request(path, body) {
    var options = { credentials: 'same-origin' };
    if (path !== '/api/members') {
      options.method = 'POST';
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body || {});
    }
    return fetch(path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function showMessage(text) {
    message.textContent = text || '';
    message.hidden = !text;
  }

  function showView(view) {
    loading.hidden = view !== loading;
    login.hidden = view !== login;
    content.hidden = view !== content;
  }

  function showLoginStep(form) {
    emailForm.hidden = form !== emailForm;
    resetForm.hidden = form !== resetForm;
    codeForm.hidden = form !== codeForm;
    showMessage('');
    showView(login);
    form.querySelector('input').focus();
  }

  // 通信中はボタンを押せないようにする
  function submitting(form, promise) {
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    return promise
      .catch(function () { return { ok: false, data: {} }; })
      .then(function (result) {
        button.disabled = false;
        return result;
      });
  }

  // シートの内容はテキストとして表示し、リンクと画像は https のURLだけを使う
  function isHttps(url) {
    return /^https:\/\//i.test(url || '');
  }

  function createElement(tag, className, text) {
    var el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function createCard(member) {
    var card = createElement('li', 'member-card');
    if (isHttps(member.image)) {
      var image = createElement('img', 'member-card__image');
      image.src = member.image;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      card.appendChild(image);
    } else {
      card.appendChild(createElement('span', 'member-card__initial', member.name.charAt(0)));
    }
    card.appendChild(createElement('h2', 'member-card__name', member.name));
    if (member.title) card.appendChild(createElement('p', 'member-card__title', member.title));
    if (member.bio) card.appendChild(createElement('p', 'member-card__bio', member.bio));
    if (isHttps(member.instagram)) {
      var link = createElement('a', 'member-card__link', 'Instagram');
      link.href = member.instagram;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.appendChild(link);
    }
    return card;
  }

  function showMembers(members) {
    list.textContent = '';
    members.forEach(function (member) { list.appendChild(createCard(member)); });
    empty.hidden = members.length > 0;
    showView(content);
  }

  function loadMembers() {
    return request('/api/members').then(function (result) {
      if (result.ok) {
        showMembers(result.data.members || []);
        return;
      }
      showLoginStep(emailForm);
      if (result.status !== 401) showMessage(DEFAULT_ERROR);
    }).catch(function () {
      showLoginStep(emailForm);
      showMessage(DEFAULT_ERROR);
    });
  }

  // コード送信を依頼し、成功したらコード入力へ進む
  function sendCode(form, path, body) {
    showMessage('');
    submitting(form, request(path, body)).then(function (result) {
      if (result.ok) {
        pendingEmail = body.email;
        codeInput.value = '';
        showLoginStep(codeForm);
      } else {
        showMessage(ERROR_MESSAGES[result.data.error] || DEFAULT_ERROR);
      }
    });
  }

  // 入力したパスワードを画面に残さない
  function clearPasswords() {
    passwordInput.value = '';
    resetPassword.value = '';
  }

  emailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    showMessage('');
    submitting(emailForm, request('/api/auth/login', { email: emailInput.value, password: passwordInput.value })).then(function (result) {
      if (result.ok) {
        clearPasswords();
        loadMembers();
      } else {
        showMessage(ERROR_MESSAGES[result.data.error] || DEFAULT_ERROR);
      }
    });
  });

  resetForm.addEventListener('submit', function (e) {
    e.preventDefault();
    sendCode(resetForm, '/api/auth/password-reset', { email: resetEmail.value, password: resetPassword.value });
  });

  codeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    showMessage('');
    submitting(codeForm, request('/api/auth/verify-code', { email: pendingEmail, code: codeInput.value })).then(function (result) {
      if (result.ok) {
        clearPasswords();
        loadMembers();
      } else {
        showMessage(ERROR_MESSAGES[result.data.error] || DEFAULT_ERROR);
      }
    });
  });

  document.getElementById('backToEmail').addEventListener('click', function () {
    showLoginStep(emailForm);
  });

  document.getElementById('showReset').addEventListener('click', function () {
    showLoginStep(resetForm);
  });

  document.getElementById('resetToLogin').addEventListener('click', function () {
    showLoginStep(emailForm);
  });

  document.getElementById('logoutButton').addEventListener('click', function () {
    request('/api/auth/logout').then(function () {
      list.textContent = '';
      showLoginStep(emailForm);
    });
  });

  /* ---------- ログインなしで見られるプロフィール ---------- */
  // 名前の上に出す写真。画像を assets/members/ に置き、「'名前': 'ファイルのパス'」の形で1行ずつ追加する
  // 名前はフォームの回答(Q2)と同じ表記にする。写真は自動で丸く切り抜かれる
  var PROFILE_IMAGES = {
    // '山田太郎': 'assets/members/yamada.jpg',
    'あっちゃん': 'assets/members/acchan.png',
    'ゆーり': 'assets/members/yuuri.png',
    'ゆーほ': 'assets/members/yuuho.png',
    'ワケトン': 'assets/members/waketon.png',
    '沢村 亮 （亮榎、沢村、さわむー ）': 'assets/members/sawamura.png',
    'あすか、あすかちゃん': 'assets/members/asuka.png',
  };

  function createProfilePhoto(name) {
    var src = PROFILE_IMAGES[name.trim()];
    if (!src) return createElement('span', 'member-card__initial', name.trim().charAt(0));
    var image = createElement('img', 'member-card__image');
    image.src = src;
    image.alt = '';
    image.loading = 'lazy';
    return image;
  }

  function createProfileCard(profile) {
    var card = createElement('li', 'member-card profile-card');
    if (profile.title) {
      card.appendChild(createProfilePhoto(profile.title));
      card.appendChild(createElement('h3', 'member-card__name', profile.title));
    }
    var items = createElement('dl', 'profile-card__list');
    profile.items.forEach(function (item) {
      items.appendChild(createElement('dt', 'profile-card__label', item.label));
      items.appendChild(createElement('dd', 'profile-card__value', item.value));
    });
    card.appendChild(items);
    return card;
  }

  function loadPublicProfiles() {
    fetch('/api/public-profiles').then(function (res) {
      return res.ok ? res.json() : { profiles: [] };
    }).then(function (data) {
      var profiles = data.profiles || [];
      var publicList = document.getElementById('publicProfileList');
      profiles.forEach(function (profile) { publicList.appendChild(createProfileCard(profile)); });
      document.getElementById('publicProfiles').hidden = profiles.length === 0;
    }).catch(function () {});
  }

  loadPublicProfiles();
  loadMembers();
})();
