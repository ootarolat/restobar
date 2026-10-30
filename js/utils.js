// utils.js — shared utilities for Restobar POS
App.Utils = (() => {
  function formatCLP(amount) {
    return '$' + Math.round(amount).toLocaleString('es-CL');
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDateTime(ts) {
    return formatDate(ts) + ' ' + formatTime(ts);
  }

  function uid(prefix = 'id') {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  }

  function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-show'));
    setTimeout(() => {
      el.classList.remove('toast-show');
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  function modal(html) {
    const container = document.getElementById('modal-container');
    container.innerHTML =
      '<div class="modal-overlay" onclick="App.Utils.closeModal(event)">' +
      '<div class="modal-content" onclick="event.stopPropagation()">' +
      html +
      '</div></div>';
  }

  function closeModal(event) {
    if (event && event.target && event.target.classList && !event.target.classList.contains('modal-overlay')) {
      return;
    }
    document.getElementById('modal-container').innerHTML = '';
  }

  function timeAgo(ts) {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'min';
    const hours = Math.floor(minutes / 60);
    return hours + 'h ' + (minutes % 60) + 'min';
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ===== Sound (Web Audio API — no external files) =====
  var audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { audioCtx = null; }
    }
    // Browsers suspend audio until a user gesture; resume if needed
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  // Play a short sequence of beeps. tones = [{ freq, duration, delay }]
  function playTones(tones) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime;
    tones.forEach(function (tone) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.freq;
      var start = t0 + (tone.delay || 0);
      var dur = tone.duration || 0.15;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  // Named sounds for each alert type
  function sound(kind) {
    if (kind === 'cocina') {
      // Nuevo pedido a cocina: dos tonos ascendentes
      playTones([{ freq: 660, duration: 0.14, delay: 0 }, { freq: 880, duration: 0.18, delay: 0.16 }]);
    } else if (kind === 'bar') {
      // Nuevo pedido al bar: dos tonos agudos rápidos (distinto de cocina)
      playTones([{ freq: 990, duration: 0.1, delay: 0 }, { freq: 1320, duration: 0.14, delay: 0.12 }]);
    } else if (kind === 'anulado') {
      // Pedido anulado: dos tonos descendentes
      playTones([{ freq: 660, duration: 0.16, delay: 0 }, { freq: 440, duration: 0.22, delay: 0.18 }]);
    } else if (kind === 'preparando') {
      // Preparación iniciada: un tono medio
      playTones([{ freq: 520, duration: 0.18, delay: 0 }]);
    } else if (kind === 'listo') {
      // Pedido listo: tres tonos (campanilla)
      playTones([
        { freq: 880, duration: 0.12, delay: 0 },
        { freq: 1047, duration: 0.12, delay: 0.13 },
        { freq: 1319, duration: 0.2, delay: 0.26 },
      ]);
    } else {
      playTones([{ freq: 700, duration: 0.15, delay: 0 }]);
    }
  }

  // ===== Totales (única fuente de verdad para IVA / propina / total) =====
  // items: líneas de la comanda. Las líneas anuladas NO suman.
  function itemsActivos(items) {
    return (items || []).filter(function (i) { return !i.anulado; });
  }

  function calcTotales(items, settings, propinaRate) {
    settings = settings || {};
    var ivaRate = Number(settings.ivaRate) || 0;
    var subtotal = itemsActivos(items).reduce(function (t, i) { return t + i.cantidad * i.precio; }, 0);
    var ivaIncluido = settings.preciosIncluyenIva !== false;
    var iva = ivaIncluido
      ? Math.round(subtotal * ivaRate / (100 + ivaRate))
      : Math.round(subtotal * ivaRate / 100);
    var propina = Math.round(subtotal * (propinaRate || 0) / 100);
    var total = ivaIncluido ? subtotal + propina : subtotal + iva + propina;
    return { subtotal: subtotal, iva: iva, propina: propina, total: total, ivaIncluido: ivaIncluido, ivaRate: ivaRate };
  }

  // Combined alert: sound + toast
  function alertEvent(kind, message, toastType) {
    sound(kind);
    toast(message, toastType || 'info');
    // Vibrate on mobile if supported
    if (navigator.vibrate) {
      try { navigator.vibrate(kind === 'listo' ? [100, 60, 100] : 120); } catch (e) {}
    }
  }

  return {
    formatCLP,
    formatTime,
    formatDate,
    formatDateTime,
    uid,
    todayStart,
    toast,
    modal,
    closeModal,
    timeAgo,
    esc,
    itemsActivos,
    calcTotales,
    ensureAudio,
    sound,
    alertEvent,
  };
})();
