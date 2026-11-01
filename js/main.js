/* 95s PRIDE — main.js */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ローディング演出(初回のみ) ---------- */
  var loader = document.getElementById('loader');
  var LOADER_KEY = '95s-pride-loaded';

  function finishLoader() {
    if (loader) loader.classList.add('is-hidden');
    document.body.classList.remove('is-loading');
    revealInit();
  }
  function showHero() {
    document.body.classList.add('is-ready');
  }

  function runLoader() {
    document.body.classList.add('is-loading');
    var bar = document.getElementById('loaderBar');
    var count = document.getElementById('loaderCount');
    var total = 339.292; // 2πr
    var duration = 1800;
    var start = null;

    function ease(t) { return 1 - Math.pow(1 - t, 3); }

    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var v = ease(p);
      bar.style.strokeDashoffset = total * (1 - v);
      count.textContent = Math.round(v * 100) + '%';
      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        // 100% → リングと数字が消える → 中のロゴがだんだん画面いっぱいに広がりフェードアウト
        setTimeout(function () { loader.classList.add('ring-done'); }, 250);
        setTimeout(function () {
          loader.classList.add('logo-out');
          loader.classList.add('is-fading');
        }, 800);
        setTimeout(showHero, 1800);
        setTimeout(finishLoader, 3300);
      }
    }
    requestAnimationFrame(frame);
  }

  var seen = false;
  try { seen = sessionStorage.getItem(LOADER_KEY) === '1'; } catch (e) {}

  // メンバーページなどローディング演出がないページでは、すぐ表示する
  if (!loader || reduceMotion || seen) {
    finishLoader();
    requestAnimationFrame(showHero);
  } else {
    try { sessionStorage.setItem(LOADER_KEY, '1'); } catch (e) {}
    runLoader();
  }

  /* ---------- ヘッダー(スクロールで背景を付ける) ---------- */
  var header = document.getElementById('header');
  var aboutYear = document.querySelector('.about__year');
  var aboutSec = document.getElementById('about');
  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 40);
    // 「1995」透かしのパララックス
    if (aboutYear && !reduceMotion) {
      var rect = aboutSec.getBoundingClientRect();
      var p = (window.innerHeight - rect.top) / (window.innerHeight + rect.height); // 0..1
      aboutYear.style.transform = 'translate(-50%, calc(-50% + ' + ((p - 0.5) * 160).toFixed(1) + 'px))';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- ハンバーガーメニュー ---------- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  function closeNav() {
    nav.classList.remove('is-open');
    header.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'メニューを開く');
  }

  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  });

  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') closeNav();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  /* ---------- スクロールでフェードイン ---------- */
  var revealStarted = false;
  function revealInit() {
    if (revealStarted) return;
    revealStarted = true;
    var items = document.querySelectorAll('.reveal');

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });

    items.forEach(function (el) { io.observe(el); });
  }
})();
