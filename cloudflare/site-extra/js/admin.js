/* 95s PRIDE — admin.js(運営向け管理画面) */
(function () {
  'use strict';

  var guard = document.getElementById('guard');
  var app = document.getElementById('app');
  var message = document.getElementById('message');
  var profilesBody = document.getElementById('profiles');
  var questionsBox = document.getElementById('questions');
  var cardsBox = document.getElementById('cards');
  var adminsBody = document.getElementById('admins');
  var logBody = document.getElementById('log');
  var meLabel = document.getElementById('me');

  var VISIBILITY_LABELS = { public: '公開', members: '会員限定', hidden: '非表示' };
  var ROLE_LABELS = { owner: 'オーナー', manager: '管理者' };
  var ACTION_LABELS = {
    'profile.update': 'プロフィールを変更',
    'member.suspend': 'ログインを停止',
    'member.resume': 'ログインを再開',
    'member.note': 'メモを変更',
    'question.public': '設問の公開設定',
    'card.create': '紹介カードを追加',
    'card.update': '紹介カードを更新',
    'card.delete': '紹介カードを削除',
    'photo.remove': '会員の写真を削除',
    'admin.invite': '運営メンバーを招待',
    'admin.remove': '運営メンバーを解除',
    'sync': '回答を取り込み'
  };
  var isOwner = false;

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

  var ERROR_TEXT = {
    owner_only: 'この操作はオーナーだけができます',
    invalid_email: 'メールアドレスの形式を確認してください',
    blocked_email: 'このメールアドレスは、運営として登録できません',
    already_admin: 'すでに運営メンバーです',
    member_suspended: 'この人はログインが停止されています。先に再開してください',
    cannot_remove_owner: 'オーナーは、この画面から外せません',
    cannot_suspend_admin: '運営の人は、この画面から停止できません',
    cross_site: '別のサイトからの操作は受け付けません',
    invalid_photo: '写真は assets/members/ のファイル名で入力してください',
    https_only: '画像とInstagramは https:// で始まるURLにしてください',
    name_required: '名前を入れてください'
  };

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

  // 保存すると日本時間の「月/日 時:分」で表示する(記録は UTC で入っている)
  function formatDateTime(utc) {
    if (!utc) return '';
    var d = new Date(utc.replace(' ', 'T') + 'Z');
    if (isNaN(d)) return utc;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // 変更を保存して一覧を読み直す
  function save(path, body, okText) {
    return request(path, 'POST', body).then(function (result) {
      if (!result.ok) {
        showMessage('保存できませんでした: ' + (ERROR_TEXT[result.data.error] || result.data.error || result.status));
        load();
        return;
      }
      showMessage(okText || '保存しました', true);
      load();
    });
  }

  /* ---------- メンバーとプロフィール ---------- */
  // 「ログインの状態」の列。言葉で状態を示し、押せるボタンは1つだけにする
  function renderLoginCell(p) {
    var cell = el('td');
    var box = el('div', 'state');
    if (!p.member_id) {
      box.appendChild(el('span', 'tag tag--none', 'ログインできません'));
      box.appendChild(el('small', '', 'メールアドレスなし'));
      cell.appendChild(box);
      return cell;
    }
    if (p.status === 'suspended') {
      box.appendChild(el('span', 'tag tag--sus', 'ログイン停止中'));
    } else if (p.has_password) {
      box.appendChild(el('span', 'tag tag--ok', 'ログインできる'));
      box.appendChild(el('small', '', 'パスワード設定済み'));
    } else {
      box.appendChild(el('span', 'tag tag--none', 'まだ使い始めていない'));
      box.appendChild(el('small', '', 'パスワード未設定'));
    }

    var suspended = p.status === 'suspended';
    var toggle = el('button', suspended ? '' : 'danger', suspended ? '再開する' : '停止する');
    if (p.is_admin) {
      toggle.disabled = true;
      toggle.title = '運営の人は、この画面から停止できません';
    }
    toggle.addEventListener('click', function () {
      var next = suspended ? 'active' : 'suspended';
      var question = suspended
        ? p.display_name + ' さんのログインを再開しますか?'
        : p.display_name + ' さんのログインを停止しますか?\n(次にページを開いたときから、見られなくなります。あとで「再開する」で戻せます)';
      if (!window.confirm(question)) return;
      save('/api/admin/members/' + p.member_id, { status: next }, p.display_name + ' さんのログインを' + (next === 'suspended' ? '停止' : '再開') + 'しました');
    });
    box.appendChild(toggle);
    cell.appendChild(box);
    return cell;
  }

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
      if (p.has_upload) {
        // 会員が自分でアップロードした写真がある(こちらが優先して表示される)
        var uploaded = el('div', 'note', 'アンケートで送られた写真あり(この写真が優先されます)');
        var removePhoto = el('button', 'danger', '送られた写真を削除');
        removePhoto.addEventListener('click', function () {
          if (!window.confirm(p.display_name + ' さんの、アンケートで送られた写真を削除しますか?\n(共通のアイコンに戻ります。次にアンケートを送り直したときに、写真が入っていれば、また表示されます)')) return;
          request('/api/admin/photos/' + p.member_id, 'DELETE').then(function (result) {
            showMessage(result.ok ? '写真を削除しました' : '削除できませんでした', result.ok);
            load();
          });
        });
        photoCell.appendChild(uploaded);
        photoCell.appendChild(removePhoto);
      }
      tr.appendChild(photoCell);

      tr.appendChild(renderLoginCell(p));

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
        if (!window.confirm('「' + card.name + '」のカードを削除しますか?')) return;
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

  /* ---------- この画面を使える人 / 操作の記録 ---------- */
  function renderAdmins(admins, me) {
    adminsBody.textContent = '';
    admins.forEach(function (a) {
      var tr = el('tr');
      tr.appendChild(el('td', 'email', a.email + (a.email === me.email ? '(あなた)' : '')));
      tr.appendChild(el('td', '', ROLE_LABELS[a.role] || a.role));
      tr.appendChild(el('td', 'email', a.invited_by || ''));
      var action = el('td');
      if (isOwner && a.role !== 'owner') {
        var remove = el('button', 'danger', '外す');
        remove.addEventListener('click', function () {
          if (!window.confirm(a.email + ' を運営メンバーから外しますか?\n(この画面は使えなくなります。メンバーとしてのログインは、そのままです)')) return;
          request('/api/admin/admins/' + encodeURIComponent(a.email), 'DELETE').then(function (result) {
            showMessage(result.ok ? '運営メンバーから外しました' : '外せませんでした: ' + (ERROR_TEXT[result.data.error] || result.data.error), result.ok);
            load();
          });
        });
        action.appendChild(remove);
      }
      tr.appendChild(action);
      adminsBody.appendChild(tr);
    });
    document.getElementById('inviteBox').hidden = !isOwner;
  }

  function renderLog(log) {
    logBody.textContent = '';
    if (!log.length) {
      var tr = el('tr');
      var td = el('td', 'note', 'まだ記録はありません');
      td.colSpan = 5;
      tr.appendChild(td);
      logBody.appendChild(tr);
      return;
    }
    log.forEach(function (entry) {
      var tr = el('tr');
      tr.appendChild(el('td', '', formatDateTime(entry.at)));
      tr.appendChild(el('td', 'email', entry.admin_email));
      tr.appendChild(el('td', '', ACTION_LABELS[entry.action] || entry.action));
      tr.appendChild(el('td', '', entry.target || ''));
      tr.appendChild(el('td', '', entry.detail || ''));
      logBody.appendChild(tr);
    });
  }

  /* ---------- 読み込み ---------- */
  function load() {
    return request('/api/admin/overview').then(function (result) {
      if (!result.ok) {
        guard.hidden = false;
        app.hidden = true;
        return;
      }
      var data = result.data;
      isOwner = data.me.role === 'owner';
      guard.hidden = true;
      app.hidden = false;
      meLabel.textContent = 'ログイン中: ' + data.me.email + '(' + (ROLE_LABELS[data.me.role] || data.me.role) + ')';
      renderProfiles(data.profiles || []);
      renderQuestions(data.questions || []);
      renderCards(data.cards || []);
      renderAdmins(data.admins || [], data.me);
      renderLog(data.log || []);
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

  document.getElementById('inviteButton').addEventListener('click', function () {
    var input = document.getElementById('inviteEmail');
    var email = input.value.trim();
    if (!email) return;
    if (!window.confirm(email + ' を運営メンバー(管理者)に招待しますか?\n案内のメールが届き、この画面を使えるようになります。')) return;
    var button = this;
    button.disabled = true;
    request('/api/admin/admins', 'POST', { email: email }).then(function (result) {
      button.disabled = false;
      if (!result.ok) {
        showMessage('招待できませんでした: ' + (ERROR_TEXT[result.data.error] || result.data.error || result.status));
        return;
      }
      input.value = '';
      showMessage(result.data.mailed ? email + ' を招待しました。案内のメールを送りました' : email + ' を招待しましたが、案内のメールを送れませんでした。本人に直接お伝えください', result.data.mailed);
      load();
    });
  });

  load();
})();
