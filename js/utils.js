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
  };
})();
