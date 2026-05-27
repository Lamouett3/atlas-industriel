/**
 * Toast notifications — small timed feedback messages.
 * Stack-friendly: multiple toasts queue at the bottom-right.
 */

let container;
let counter = 0;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/**
 * Show a toast.
 * @param {string} message
 * @param {'info'|'success'|'warn'|'error'} [type='info']
 * @param {number} [duration=3500]
 */
export function showToast(message, type = 'info', duration = 3500) {
  const c = ensureContainer();
  const id = ++counter;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.dataset.id = id;
  t.innerHTML = `
    <span class="toast-icon">${iconFor(type)}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Fermer">×</button>
  `;
  c.appendChild(t);

  // Animate in
  requestAnimationFrame(() => t.classList.add('show'));

  const close = () => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 240);
  };
  t.querySelector('.toast-close').addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
}

function iconFor(type) {
  switch (type) {
    case 'success': return '✓';
    case 'warn':    return '!';
    case 'error':   return '✕';
    default:        return 'i';
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
