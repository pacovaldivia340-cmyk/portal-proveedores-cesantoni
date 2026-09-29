/* Utilidades compartidas del portal y del panel (sin dependencias externas). */
(function () {
  'use strict';

  var TZ = 'America/Mexico_City';
  var state = { csrf: '' };
  /* Logotipos originales, sin modificar: img/logo-cesantoni.png e img/logo-somos.png. */
  var BRAND_CESANTONI = 'img/logo-cesantoni.png';
  var BRAND_SOMOS = 'img/logo-somos.png';

  function ApiError(message, status, errors) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
    this.errors = errors || {};
  }
  ApiError.prototype = Object.create(Error.prototype);

  /* Construye elementos sin innerHTML: todo texto se inserta como texto (evita inyección). */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(el, c); }); return; }
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function mount(el) {
    clear(el);
    for (var i = 1; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }

  function messageFrom(data, status) {
    if (data && typeof data.detail === 'string') return data.detail;
    if (data && Array.isArray(data.detail)) return 'Los datos enviados no son válidos.';
    if (status === 413) return 'El archivo es demasiado grande.';
    if (status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.';
    return 'No fue posible completar la solicitud (error ' + status + ').';
  }

  /* Conexión con la lógica de la plataforma (js/backend.js sobre Firebase). */
  var backendReady = new Promise(function (resolve) {
    function go() { window.CPBackend.ready.then(resolve); }
    if (window.CPBackend) go(); else window.addEventListener('cp-backend', go, { once: true });
  });
  function api(method, url, body) {
    return backendReady.then(function () { return window.CPBackend.request(method, url, body); }).then(function (reply) {
      if (!reply || reply.ok !== true) {
        var status = reply && reply.status !== undefined ? reply.status : 500;
        var payload = reply && reply.error ? reply.error : { detail: 'No fue posible completar la solicitud.' };
        throw new ApiError(messageFrom(payload, status), status, payload.errores || {});
      }
      return reply.data;
    });
  }

  function upload(url, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new ApiError('No se pudo leer el archivo.', 400, {})); };
      reader.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.min(.45, e.loaded / e.total * .45)); };
      reader.onload = function () {
        if (onProgress) onProgress(.55);
        var base64 = String(reader.result || '').split(',')[1] || '';
        api('POST', url, { archivo: { nombre: file.name, mime: file.type, tamano: file.size, base64: base64 } })
          .then(function (data) { if (onProgress) onProgress(1, true); resolve(data); }, reject);
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------- fechas */
  var dtf = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false });
  var df = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  var tf = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  function toDate(iso) { if (!iso) return null; var d = new Date(iso); return isNaN(d.getTime()) ? null : d; }
  function fmtDateTime(iso) { var d = toDate(iso); return d ? dtf.format(d).replace(',', '') : ''; }
  function fmtDay(iso) { var d = toDate(iso); return d ? df.format(d) : ''; }
  function fmtTime(iso) { var d = toDate(iso); return d ? tf.format(d) : ''; }
  function fmtYmd(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return '';
    return ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4);
  }
  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /* ---------------------------------------------------------------- UI */
  function toast(message, kind) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var el = h('div', { class: 'toast' + (kind ? ' toast-' + kind : ''), role: kind === 'bad' ? 'alert' : 'status' }, message);
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { el.remove(); }, kind === 'bad' ? 9000 : 5000);
  }

  var modalSeq = 0;
  function modal(opts) {
    var id = 'mdl-title-' + (++modalSeq);
    var dlg = h('dialog', { class: 'modal' + (opts.wide ? ' modal-wide' : ''), 'aria-labelledby': id });
    var close = function () { if (dlg.open) dlg.close(); };
    var head = h('div', { class: 'modal-head' },
      h('h2', { id: id }, opts.title),
      h('button', { type: 'button', class: 'close-x', 'aria-label': 'Cerrar', onclick: close }, '×'));
    var body = h('div', { class: 'modal-body' }, opts.body);
    dlg.appendChild(head);
    dlg.appendChild(body);
    if (opts.actions && opts.actions.length) dlg.appendChild(h('div', { class: 'modal-foot' }, opts.actions));
    dlg.addEventListener('close', function () { dlg.remove(); if (opts.onClose) opts.onClose(); });
    dlg.addEventListener('cancel', function (e) { if (opts.locked) e.preventDefault(); });
    document.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    var focusTarget = dlg.querySelector('[autofocus]') || dlg.querySelector('.modal-body input, .modal-body textarea, .modal-body select');
    if (focusTarget) focusTarget.focus();
    return { el: dlg, body: body, close: close };
  }

  function busy(button, on, label) {
    if (!button) return;
    if (on) {
      button.dataset.label = button.textContent;
      button.disabled = true;
      mount(button, h('span', { class: 'spin', 'aria-hidden': 'true' }), label || button.dataset.label);
    } else {
      button.disabled = false;
      if (button.dataset.label) button.textContent = button.dataset.label;
    }
  }

  function pill(kind, text) { return h('span', { class: 'pill pill-' + kind }, text); }

  var ESTADO_KIND = { iniciado: 'plain', enviado: 'info', en_revision: 'warn', correccion: 'orange', aprobado: 'ok', rechazado: 'bad' };
  var RESULTADO_KIND = { pendiente: 'plain', con_observaciones: 'orange', aprobado: 'ok', rechazado: 'bad' };
  var VALIDACION_KIND = { valido: 'ok', revision_manual: 'warn', rechazado: 'bad' };
  var REVISION_KIND = { pendiente: 'plain', aprobado: 'ok', rechazado: 'bad', correccion: 'orange' };

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function debounce(fn, ms) {
    var t = null;
    var wrapped = function () { var args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, args); }, ms); };
    wrapped.cancel = function () { clearTimeout(t); };
    return wrapped;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  function logos(target, available, cls) {
    /* Logotipos oficiales proporcionados por CESANTONI, sin redibujarlos. */
    var wrap = h('span', { class: 'brandmarks' + (cls ? ' ' + cls : '') });
    wrap.appendChild(h('span', { class: 'brand-logo-frame brand-cesantoni-frame' },
      h('img', { class: 'brand-logo logo-cesantoni', src: BRAND_CESANTONI, alt: 'CESANTONI · Porcelanato Premium' })));
    wrap.appendChild(h('span', { class: 'brand-divider', 'aria-hidden': 'true' }));
    wrap.appendChild(h('span', { class: 'brand-logo-frame brand-somos-frame' },
      h('img', { class: 'brand-logo logo-somos', src: BRAND_SOMOS, alt: 'Somos Logística CESANTONI · Un mismo equipo, un mismo objetivo' })));
    mount(target, wrap);
    return wrap;
  }

  /* Si un error impide arrancar la pantalla, se muestra un aviso en lugar de dejar «Cargando…». */
  window.addEventListener('error', function (ev) {
    var boot = document.getElementById('booting') || document.querySelector('#app > p.muted');
    if (!boot || !boot.parentNode) return;
    boot.parentNode.replaceChild(h('div', { class: 'notice notice-bad', role: 'alert' },
      h('h3', null, 'No fue posible cargar la página'),
      h('p', null, 'Recarga la página. Si el problema continúa, avisa al equipo de Logística de CESANTONI.'),
      h('p', { class: 'small muted' }, 'Detalle técnico: ' + (ev && ev.message ? ev.message : 'error de JavaScript'))), boot);
  });

  function saveBlob(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function base64Blob(b64, mime) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
  }

  window.CP = {
    ready: backendReady, saveBlob: saveBlob, base64Blob: base64Blob,
    h: h, mount: mount, clear: clear, api: api, upload: upload, ApiError: ApiError, state: state,
    fmtDateTime: fmtDateTime, fmtDay: fmtDay, fmtTime: fmtTime, fmtYmd: fmtYmd, fmtSize: fmtSize,
    toast: toast, modal: modal, busy: busy, pill: pill, uuid: uuid, debounce: debounce, copyText: copyText,
    logos: logos, ESTADO_KIND: ESTADO_KIND, RESULTADO_KIND: RESULTADO_KIND, VALIDACION_KIND: VALIDACION_KIND,
    REVISION_KIND: REVISION_KIND
  };
})();
