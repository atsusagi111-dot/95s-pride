/* 95s PRIDE — admin.js(運営向け管理画面) */
(function () {
  'use strict';

  var guard = document.getElementById('guard');
  var app = document.getElementById('app');
  var message = document.getElementById('message');
  var profilesBody = document.getElementById('profiles');
  var questionsBox = document.getElementById('questions');
  var cardsBox = document.getElementById('cards');

  var VISIBILITY_LABELS = { public: '公開', members: '会員限定', hidden: '非表示' };

  function request(path, method, body) {
    var options = { method: method || 'GET', credentials: 'same-origin' };
    if (body) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    return fetch(path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function showMessage(text, ok) {
    message.textContent = text || '';
    message.hidden = !text;
    message.className = ok ? 'msg msg--ok' : 'msg';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    return iso ? iso.slice(0, 10).replace(/-/g, '/') : '';
  }

  // 変更を保存して一覧を読み直す
  function save(path, body, okText) {
    return request(path, 'POST', body).then(function (result) {
      if (!result.ok) {
        showMessage('保存できませんでした(' + (result.data.error || result.status) + ')');
        return;
      }
      showMessage(okText || '保存しました', true);
      load();
    });
  }

  /* ---------- メンバーとプロフィール ---------- */
  function renderProfiles(profiles) {
    profilesBody.textContent = '';
    profiles.forEach(function (p) {
      var tr = el('tr', p.is_current ? '' : 'old');
      tr.appendChild(el('td', 'name', p.display_name));
      tr.appendChild(el('td', 'email', p.email || '(メールなし)'));
      tr.appendChild(el('td', '', formatDate(p.responded_at)));

      var visCell = el('td');
      var select = el('select');
      Object.keys(VISIBILITY_LABELS).forEach(function (key) {
        var option = el('option', '', VISIBILITY_LABELS[key]);
        option.value = key;
        option.selected = key === p.visibility;
        select.appendChild(option);
      });
      select.addEventListener('change', function () {
        save('/api/admin/profiles/' + p.id, { visibility: select.value }, p.display_name + ' を「' + VISIBILITY_LABELS[select.value] + '」にしました');
      });
      visCell.appendChild(select);
      tr.appendChild(visCell);

      var photoCell = el('td');
      var photo = el('input');
      photo.type = 'text';
      photo.placeholder = 'assets/members/xxx.png';
      photo.value = p.photo_path || '';
      photo.style.minWidth = '180px';
      photo.addEventListener('change', function () {
        save('/api/admin/profiles/' + p.id, { photo_path: photo.value }, '写真を変えました');
      });
      photoCell.appendChild(photo);
      tr.appendChild(photoCell);

      var loginCell = el('td');
      if (p.member_id) {
        loginCell.appendChild(el('span', 'tag' + (p.status === 'suspended' ? ' tag--sus' : ''), p.status === 'suspended' ? '停止中' : (p.has_password ? '設定済み' : '未設定')));
        var toggle = el('button', p.status === 'suspended' ? '' : 'danger', p.status === 'suspended' ? '再開' : '停止');
        toggle.style.marginLeft = '6px';
        toggle.addEventListener('click', function () {
          var next = p.status === 'suspended' ? 'active' : 'suspended';
          save('/api/admin/members/' + p.member_id, { status: next }, p.display_name + ' のログインを' + (next === 'suspended' ? '停止' : '再開') + 'しました');
        });
        loginCell.appendChild(toggle);
      } else {
        loginCell.appendChild(el('span', 'note', 'ログイン不可'));
      }
      tr.appendChild(loginCell);

      var noteCell = el('td');
      if (p.member_id) {
        var note = el('input');
        note.type = 'text';
        note.value = p.note || '';
        note.placeholder = '運営用メモ';
        note.addEventListener('change', function () {
          save('/api/admin/members/' + p.member_id, { note: note.value }, 'メモを保存しました');
        });
        noteCell.appendChild(note);
      }
      tr.appendChild(noteCell);
      profilesBody.appendChild(tr);
    });
  }

  /* ---------- 設問の公開設定 ---------- */
  function renderQuestions(questions) {
    questionsBox.textContent = '';
    questions.forEach(function (q) {
      var card = el('label', 'card');
      var check = el('input');
      check.type = 'checkbox';
      check.checked = Boolean(q.is_public);
      check.addEventListener('change', function () {
        save('/api/admin/questions/' + q.key, { is_public: check.checked }, '「' + q.label + '」を' + (check.checked ? '公開' : '非公開') + 'にしました');
      });
      var line = el('div');
      line.appendChild(check);
      line.appendChild(document.createTextNode(' ' + q.key.toUpperCase() + ' ' + q.label));
      card.appendChild(line);
      questionsBox.appendChild(card);
    });
  }

  /* ---------- 紹介カード ---------- */
  function field(labelText, type, value, placeholder) {
    var wrap = el('div');
    wrap.appendChild(el('label', '', labelText));
    var input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.value = value || '';
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(input);
    wrap.input = input;
    return wrap;
  }

  function renderCard(card) {
    var box = el('div', 'card');
    var name = field('名前', 'text', card.name);
    var title = field('肩書き', 'text', card.title);
    var bio = field('紹介文', 'textarea', card.bio);
    var image = field('画像URL', 'url', card.image_url, 'https://');
    var instagram = field('Instagram URL', 'url', card.instagram_url, 'https://');
    var order = field('並び順(小さいほど先)', 'text', String(card.sort_order || 0));
    [name, title, bio, image, instagram, order].forEach(function (f) { box.appendChild(f); });

    var row = el('div', 'row');
    if (card.id) {
      var remove = el('button', 'danger', '削除');
      remove.addEventListener('click', function () {
        request('/api/admin/cards/' + card.id, 'DELETE').then(function (result) {
          showMessage(result.ok ? '削除しました' : '削除できませんでした', result.ok);
          load();
        });
      });
      row.appendChild(remove);
    }
    var saveButton = el('button', 'primary', '保存');
    saveButton.addEventListener('click', function () {
      save('/api/admin/cards' + (card.id ? '/' + card.id : ''), {
        name: name.input.value, title: title.input.value, bio: bio.input.value,
        image_url: image.input.value, instagram_url: instagram.input.value, sort_order: Number(order.input.value) || 0,
      });
    });
    row.appendChild(saveButton);
    box.appendChild(row);
    return box;
  }

  function renderCards(cards) {
    cardsBox.textContent = '';
    cards.forEach(function (card) { cardsBox.appendChild(renderCard(card)); });
  }

  /* ---------- 読み込み ---------- */
  function load() {
    return request('/api/admin/overview').then(function (result) {
      if (!result.ok) {
        guard.hidden = false;
        app.hidden = true;
        return;
      }
      guard.hidden = true;
      app.hidden = false;
      renderProfiles(result.data.profiles || []);
      renderQuestions(result.data.questions || []);
      renderCards(result.data.cards || []);
    }).catch(function () {
      guard.hidden = false;
    });
  }

  document.getElementById('reload').addEventListener('click', function () { showMessage(''); load(); });
  document.getElementById('addCard').addEventListener('click', function () { cardsBox.appendChild(renderCard({})); });
  document.getElementById('sync').addEventListener('click', function () {
    var button = this;
    button.disabled = true;
    showMessage('取り込み中です');
    request('/api/admin/sync', 'POST', {}).then(function (result) {
      button.disabled = false;
      if (!result.ok) {
        showMessage('取り込みに失敗しました(' + (result.data.error || result.status) + ')');
        return;
      }
      var d = result.data;
      showMessage('取り込み完了: 新規 ' + d.imported + ' 件、お礼メール ' + d.mailed + ' 件', true);
      load();
    });
  });

  load();
})();
