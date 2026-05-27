/**
 * Theme manager — dark / light toggle.
 *
 * Responsibilities:
 *   1. Apply the right theme on load (saved → system pref → dark default).
 *   2. Toggle on click, persist to localStorage.
 *   3. Notify subscribers (e.g. map) when the theme changes,
 *      so they can swap tile layers and re-render dynamic colors.
 *
 * The theme itself is just an attribute on <html>:
 *   <html data-theme="dark"> ... </html>
 *   <html data-theme="light"> ... </html>
 *
 * All visual changes flow from CSS variables in tokens.css.
 */

const STORAGE_KEY = 'atlas.theme';
const listeners = new Set();
let currentTheme = 'dark';

/**
 * Decide which theme to use on first load:
 *   1. localStorage value (user's last choice)
 *   2. system prefers-color-scheme
 *   3. dark fallback
 */
function pickInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) { /* localStorage may be blocked */ }

  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

/** Applies a theme to <html> and updates meta theme-color for mobile UI. */
import { invalidateColorCache } from '../data/sectors.js';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  currentTheme = theme;

  // Update mobile browser chrome color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === 'light' ? '#FAF7F0' : '#0A0E1A';
  }

  // Persist
  try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* ignore */ }

  // Drop cached colors so subscribers see the new theme's palette
  invalidateColorCache();

  // Notify subscribers (map needs to swap tile layers, etc.)
  listeners.forEach(fn => fn(theme));
}

/** Initialize on app start — call before rendering anything. */
export function initTheme() {
  // Apply initial theme synchronously to avoid flash of wrong theme
  applyTheme(pickInitialTheme());

  // Wire the toggle button
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
    updateToggleLabel(btn);
    listeners.add(() => updateToggleLabel(btn));
  }

  // Follow system preference if user never made an explicit choice
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener?.('change', e => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return; // user made a choice
      } catch (err) { /* ignore */ }
      applyTheme(e.matches ? 'light' : 'dark');
    });
  }
}

export function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function getTheme() {
  return currentTheme;
}

/**
 * Subscribe to theme changes.
 * The callback receives the new theme name.
 *
 * @param {(theme: 'dark'|'light') => void} fn
 * @returns {() => void} unsubscribe
 */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function updateToggleLabel(btn) {
  const next = currentTheme === 'dark' ? 'clair' : 'sombre';
  btn.setAttribute('aria-label', `Passer au thème ${next}`);
  btn.setAttribute('title', `Thème ${next}`);
}
