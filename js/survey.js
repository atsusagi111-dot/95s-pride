/* 95s PRIDE — survey.js(プロフィールアンケート) */
(function () {
  'use strict';

  var stepEmail = document.getElementById('stepEmail');
  var stepCode = document.getElementById('stepCode');
  var stepDone = document.getElementById('stepDone');
  var emailForm = document.getElementById('emailForm');
  var codeForm = document.getElementById('codeForm');
  var surveyForm = document.getElementById('surveyForm');
  var fieldsBox = document.getElementById('surveyFields');
  var message = document.getElementById('surveyMessage');
  var progress = document.getElementById('surveyProgress');
  var progressText = document.getElementById('progressText');
  var progressBar = document.getElementById('progressBar');
  var progressFill = document.getElementById('progressFill');
  var submitButton = document.getElementById('surveySubmit');

  var email = '';
  var ticket = '';
  var questions = [];
  var PHOTO_MAX_MB = 15;

  var ERRORS = {
    invalid_email: 'メールアドレスの形式を確認してください。',
    not_allowed: 'このメールアドレスでは回答できません。運営までご連絡ください。',
    invalid_code: 'コードが正しくないか、有効期限が切れています。',
    ticket_expired: 'メールアドレスの確認の有効期限(1時間)が切れました。お手数ですが、ページを開き直して、もう一度確認からお願いします。',
    required: '未入力の必須項目があります。',
    too_long: '文字数が多すぎる項目があります(2000文字まで)。',
    invalid_link: 'SNS・リンクの入力を確認してください(@ID か、そのサービスのURLを入力します)。',
    invalid_choice: '選択肢から選び直してください。',
    photo_too_large: '写真のサイズが大きすぎます(' + PHOTO_MAX_MB + 'MBまで)。',
    invalid_photo: '写真を読み込めませんでした。別の写真を選ぶか、写真なしで送ってください。',
    too_many_attempts: '送信が多すぎます。1時間ほど待ってからお試しください。'
  };
  var DEFAULT_ERROR = 'ただいま利用できません。時間をおいてもう一度お試しください。';

  function showMessage(text) {
    message.textContent = text || '';
    message.hidden = !text;
  }

  // JSON で POST する。失敗したときは { error } を返す
  function postJson(path, body) {
    return fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return res.ok ? data : { error: data.error || 'unavailable' };
      });
    }).catch(function () { return { error: 'unavailable' }; });
  }

  /* ---------- 手順1・2: メールの確認 ---------- */

  function withBusy(form, work) {
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    return work().then(function () { button.disabled = false; }, function () { button.disabled = false; });
  }

  emailForm.addEventListener('submit', function (event) {
    event.preventDefault();
    showMessage('');
    var value = document.getElementById('surveyEmail').value.trim();
    withBusy(emailForm, function () {
      return postJson('/api/survey/send-code', { email: value }).then(function (data) {
        if (data.error) { showMessage(ERRORS[data.error] || DEFAULT_ERROR); return; }
        email = value;
        document.getElementById('sentTo').textContent = value;
        stepEmail.hidden = true;
        stepCode.hidden = false;
        document.getElementById('surveyCode').focus();
      });
    });
  });

  document.getElementById('backToEmail').addEventListener('click', function () {
    showMessage('');
    stepCode.hidden = true;
    stepEmail.hidden = false;
  });

  codeForm.addEventListener('submit', function (event) {
    event.preventDefault();
    showMessage('');
    var code = document.getElementById('surveyCode').value.trim();
    withBusy(codeForm, function () {
      return postJson('/api/survey/verify', { email: email, code: code }).then(function (data) {
        if (data.error) { showMessage(ERRORS[data.error] || DEFAULT_ERROR); return; }
        ticket = data.ticket;
        return startSurvey();
      });
    });
  });

  /* ---------- 手順3: アンケート本体 ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // 名前の設問の次に、写真(任意)を出す
  function buildPhotoField() {
    var wrap = el('div', 'survey-field');
    var label = el('label', 'login-card__label', 'プロフィール写真');
    label.setAttribute('for', 'f-photo');
    label.appendChild(el('span', 'survey-field__optional', '任意'));
    wrap.appendChild(label);
    wrap.appendChild(el('p', 'survey-field__help', 'メンバー紹介用の写真です。※未設定の場合は共通アイコンが表示されます。アップ後は正方形に自動調整されます。'));
    var input = el('input', 'survey-field__file');
    input.type = 'file';
    input.id = 'f-photo';
    input.name = 'photo';
    input.accept = 'image/*';
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (file && file.size > PHOTO_MAX_MB * 1024 * 1024) {
        input.value = '';
        showMessage(ERRORS.photo_too_large);
      } else {
        showMessage('');
      }
    });
    wrap.appendChild(input);
    return wrap;
  }

  function buildField(q) {
    var wrap = el('div', 'survey-field');
    wrap.dataset.key = q.key;
    var label = el('label', 'login-card__label', q.label);
    var inputId = 'f-' + q.key;
    label.setAttribute('for', inputId);
    if (q.required) label.appendChild(el('span', 'survey-field__required', '必須'));
    wrap.appendChild(label);
    if (q.help) wrap.appendChild(el('p', 'survey-field__help', q.help));

    if (q.type === 'choice') {
      var group = el('div', 'survey-field__choices');
      group.setAttribute('role', 'radiogroup');
      group.id = inputId;
      q.options.forEach(function (option) {
        var row = el('label', 'survey-field__choice');
        var radio = el('input');
        radio.type = 'radio';
        radio.name = q.key;
        radio.value = option;
        row.appendChild(radio);
        row.appendChild(el('span', '', option));
        group.appendChild(row);
      });
      wrap.appendChild(group);
    } else {
      var input = el(q.type === 'text' ? 'input' : 'textarea', 'login-card__input');
      if (q.type === 'text') input.type = 'text'; else input.rows = 4;
      input.id = inputId;
      input.name = q.key;
      input.maxLength = 2000;
      wrap.appendChild(input);
    }
    wrap.appendChild(el('p', 'survey-field__error'));
    return wrap;
  }

  function renderQuestions() {
    fieldsBox.textContent = '';
    var lastSection = null;
    var snsStarted = false;
    questions.forEach(function (q) {
      if (q.section !== lastSection) {
        fieldsBox.appendChild(el('h2', 'survey__section', q.section));
        lastSection = q.section;
      }
      // SNS・リンクの欄は、最初の1つの前に、まとめの見出しと説明を出す
      if (q.key.indexOf('sns_') === 0 && !snsStarted) {
        snsStarted = true;
        fieldsBox.appendChild(el('h3', 'survey__subsection', 'SNS・リンク'));
        fieldsBox.appendChild(el('p', 'survey-field__help', '趣味・活動・発信していることがわかるものを、お持ちのものだけ入力してください(@ID でも、URLでも大丈夫です)。メンバー紹介ページに、アイコンのリンクとして表示されます。'));
      }
      fieldsBox.appendChild(buildField(q));
      if (q.label.indexOf('名前') === 0) fieldsBox.appendChild(buildPhotoField());
    });
  }

  function startSurvey() {
    return fetch('/api/survey/questions', { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('load')); })
      .then(function (data) {
        questions = data.questions;
        renderQuestions();
        document.getElementById('verifiedEmail').textContent = email;
        stepCode.hidden = true;
        surveyForm.hidden = false;
        progress.hidden = false;
        document.body.classList.add('has-survey-progress');
        updateProgress();
        window.scrollTo({ top: 0 });
      })
      .catch(function () { showMessage(DEFAULT_ERROR); });
  }

  // 入力済みの必須項目の数を数えて、進み具合を表示する
  function valueOf(q) {
    if (q.type === 'choice') {
      var checked = surveyForm.querySelector('input[name="' + q.key + '"]:checked');
      return checked ? checked.value : '';
    }
    return surveyForm.elements[q.key].value.trim();
  }

  function updateProgress() {
    var required = questions.filter(function (q) { return q.required; });
    var done = required.filter(function (q) { return valueOf(q); }).length;
    var total = required.length;
    var percent = total ? Math.round((done / total) * 100) : 100;
    progressFill.style.width = percent + '%';
    progressBar.setAttribute('aria-valuenow', String(percent));
    progressText.textContent = done >= total
      ? '必須項目はすべて入力済みです。「送信する」を押してください'
      : '必須 ' + done + ' / ' + total + ' 入力済み(あと ' + (total - done) + ' 項目)';
  }

  surveyForm.addEventListener('input', updateProgress);
  surveyForm.addEventListener('change', updateProgress);

  surveyForm.addEventListener('submit', function (event) {
    event.preventDefault();
    showMessage('');
    // 未入力の必須項目に印を付けて、最初の1つへ移動する
    var firstMissing = null;
    questions.forEach(function (q) {
      var wrap = fieldsBox.querySelector('.survey-field[data-key="' + q.key + '"]');
      var missing = q.required && !valueOf(q);
      wrap.classList.toggle('is-invalid', missing);
      wrap.querySelector('.survey-field__error').textContent = missing ? 'この項目は必須です' : '';
      if (missing && !firstMissing) firstMissing = wrap;
    });
    if (firstMissing) {
      firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showMessage(ERRORS.required);
      return;
    }

    var body = new FormData();
    body.append('ticket', ticket);
    questions.forEach(function (q) { body.append(q.key, valueOf(q)); });
    var photo = document.getElementById('f-photo').files[0];
    if (photo) body.append('photo', photo);

    submitButton.disabled = true;
    submitButton.textContent = '送信しています…';
    fetch('/api/survey/submit', { method: 'POST', credentials: 'same-origin', body: body })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          var error = result.data.error;
          showMessage(ERRORS[error] || DEFAULT_ERROR);
          var bad = result.data.field && fieldsBox.querySelector('.survey-field[data-key="' + result.data.field + '"]');
          if (bad) {
            bad.classList.add('is-invalid');
            bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        surveyForm.hidden = true;
        progress.hidden = true;
        document.body.classList.remove('has-survey-progress');
        document.getElementById('doneText').textContent = result.data.mailed
          ? '回答を受け付けました。確認のメールをお送りしましたので、ご確認ください。'
          : '回答を受け付けました。';
        stepDone.hidden = false;
        window.scrollTo({ top: 0 });
      })
      .catch(function () { showMessage(DEFAULT_ERROR); })
      .then(function () {
        submitButton.disabled = false;
        submitButton.textContent = '送信する';
      });
  });
})();
