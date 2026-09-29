/* Utilidades de interfaz: creación segura de elementos (sin innerHTML), formatos, avisos y diálogos. */
const TZ = 'America/Mexico_City';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([p, x]) => { if (p.startsWith('--')) el.style.setProperty(p, x); else el.style[p] = x; });
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (['checked', 'selected', 'disabled'].includes(k)) el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
function add(el, kid) {
  if (kid === null || kid === undefined || kid === false) return;
  if (Array.isArray(kid)) { kid.forEach((k) => add(el, k)); return; }
  el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
}
export function mount(el, ...kids) { el.replaceChildren(); add(el, kids); return el; }

/* Íconos (trazos simples, sin dependencias). */
const PATHS = {
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
  alert: 'M12 3l10 18H2L12 3zm0 7v5m0 3v.01',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h7M9 17h7',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zm-6 9a6 6 0 0112 0M17 11a3 3 0 100-6M21 20a5 5 0 00-4-5',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.4 3h-4l-.4 2.4a7.6 7.6 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 002.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
  check: 'M4 12l5 5L20 6',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zm4 4h4',
  send: 'M3 11l18-8-8 18-2-8z',
  key: 'M14 10a4 4 0 11-8 0 4 4 0 018 0zm0 0h7v3m-3-3v3',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'
};
export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', PATHS[name] || PATHS.doc); svg.appendChild(p);
  return svg;
}

/* Logotipos originales, sin modificar. */
export function logos(href) {
  return h('a', { class: 'logos', href: href || '#', 'aria-label': 'CESANTONI · Somos Logística' },
    h('img', { class: 'l-ces', src: 'img/logo-cesantoni.png', alt: 'CESANTONI · Porcelanato Premium', width: 487, height: 137 }),
    h('span', { class: 'sep', 'aria-hidden': 'true' }),
    /* El PNG trae márgenes transparentes amplios: el marco solo recorta ese espacio vacío, el logotipo se ve completo e intacto. */
    h('span', { class: 'somos-frame' }, h('img', { class: 'l-somos', src: 'img/logo-somos.png', alt: 'Somos Logística CESANTONI · Un mismo equipo, un mismo objetivo', width: 1650, height: 1063 })));
}

const dt = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const dd = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const tt = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const toD = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };
export const fecha = (v) => { const d = toD(v); return d ? dd.format(d) : ''; };
export const fechaHora = (v) => { const d = toD(v); return d ? dt.format(d) : ''; };
export const hora = (v) => { const d = toD(v); return d ? tt.format(d) : ''; };
export const dia = (v) => { const d = toD(v); return d ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) : ''; };
export const diasDesde = (v) => { const d = toD(v); return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : 0; };
export const diasHasta = (ymd) => { if (!ymd) return null; return Math.ceil((new Date(ymd + 'T23:59:59') - Date.now()) / 86400000); };
export const tamano = (b) => (!b && b !== 0 ? '' : b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
export const lista = (v) => (Array.isArray(v) ? (v.length ? v.join(', ') : '—') : (v === '' || v === null || v === undefined ? '—' : String(v)));
export const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

export function tag(kind, text) { return h('span', { class: 'tag' + (kind ? ' tag-' + kind : '') }, text); }

export function toast(msg, kind) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = h('div', { class: 'toast' + (kind ? ' toast-' + kind : ''), role: kind === 'bad' ? 'alert' : 'status' }, msg);
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), kind === 'bad' ? 8000 : 4500);
}

export function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.l = btn.textContent; btn.disabled = true; mount(btn, h('span', { class: 'spin', 'aria-hidden': 'true' }), label || btn.dataset.l); }
  else { btn.disabled = false; if (btn.dataset.l) btn.textContent = btn.dataset.l; }
}

let seq = 0;
export function modal({ title, body, actions, wide, locked, onClose }) {
  const id = 'dlg-' + (++seq);
  const dlg = h('dialog', { class: 'modal' + (wide ? ' wide' : ''), 'aria-labelledby': id });
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.append(
    h('div', { class: 'modal-head' }, h('h2', { id }, title), locked ? null : h('button', { type: 'button', class: 'x', 'aria-label': 'Cerrar', onclick: close }, '×')),
    h('div', { class: 'modal-body' }, body),
    actions && actions.length ? h('div', { class: 'modal-foot' }, actions) : null);
  dlg.addEventListener('cancel', (e) => { if (locked) e.preventDefault(); });
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  const f = dlg.querySelector('[autofocus]') || dlg.querySelector('.modal-body input, .modal-body textarea, .modal-body select');
  if (f) f.focus();
  return { el: dlg, close };
}

export function saveBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
export function b64ToBlob(b64, type) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
export function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.readAsDataURL(file);
  });
}
export function debounce(fn, ms) {
  let t = null;
  const w = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  w.cancel = () => clearTimeout(t);
  return w;
}
export function copy(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('copy'));
}

/* Campo de formulario con etiqueta, ayuda y error. */
export function field(label, control, opts = {}) {
  if (!control.id) control.id = 'f' + Math.random().toString(36).slice(2, 9);
  return h('div', { class: 'field' + (opts.wide ? ' span-2' : '') },
    h('label', { for: control.id }, label, opts.req ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
    control, opts.help ? h('p', { class: 'help' }, opts.help) : null);
}
export function select(options, value, attrs) {
  const el = h('select', Object.assign({ class: 'input' }, attrs || {}), options.map(([v, l]) => h('option', { value: v }, l)));
  el.value = value || '';
  return el;
}

/* Si algo impide arrancar, se explica en pantalla en lugar de quedarse en «Cargando…». */
export function fatal(target, title, detail) {
  mount(target, h('div', { class: 'page' }, h('div', { class: 'note note-bad', role: 'alert' }, h('h3', null, title), h('p', null, detail))));
}
