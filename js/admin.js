/* Panel de administración: proveedores, expedientes, revisión de documentos, correos y configuración. */
(function () {
  'use strict';
  var h = CP.h, mount = CP.mount;
  var app = document.getElementById('app');
  var cfg = null;
  var me = null;
  var nextUrl = '';
  var lastList = '#/proveedores';
  var content = null;
  var docDefs = {};
  function appHashUrl(hash) { return location.pathname + location.search + (hash || ''); }

  var ORDER_ESTADOS = ['iniciado', 'enviado', 'en_revision', 'correccion', 'aprobado', 'rechazado'];
  var FILTER_KEYS = ['q', 'pais', 'cobertura', 'servicio', 'estado', 'resultado', 'fecha_campo', 'desde', 'hasta', 'orden', 'pagina', 'por_pagina'];
  var METODOS = { texto_pdf: 'Texto del PDF', ocr_imagen: 'OCR de imagen', ocr_pdf: 'OCR de PDF escaneado', no_legible: 'No legible',
    revision_manual: 'Revisión manual (sin lectura automática)' };
  var CERTEZAS = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  var EMAIL_ESTADOS = { pendiente: ['En cola', 'info'], enviando: ['Enviando', 'info'], enviado: ['Enviado', 'ok'],
    error: ['Error', 'bad'], sin_configurar: ['Sin configurar', 'warn'] };
  var ACCIONES = {
    registro_iniciado: 'Registro iniciado', registro_enviado: 'Registro enviado a revisión',
    correcciones_enviadas: 'Correcciones enviadas', documento_subido: 'Documento subido',
    documento_aprobado: 'Documento aprobado', documento_rechazado: 'Documento rechazado',
    documento_correccion: 'Corrección solicitada', correccion_notificada: 'Aviso de corrección al proveedor',
    revision_actualizada: 'Revisión actualizada', acceso_enlace: 'Ingreso con enlace de correo',
    acceso_clave: 'Ingreso con folio y clave', clave_regenerada: 'Nueva clave de acceso',
    enlace_solicitado: 'Enlace de acceso solicitado', correo_reintento: 'Reintento de correo'
  };
  var MOTIVOS = [
    'Documento ilegible o incompleto', 'El documento está vencido', 'La antigüedad del documento es mayor a 3 meses',
    'No corresponde a la razón social registrada', 'Los datos no coinciden con el registro',
    'Falta alguna página del documento', 'El documento no es el solicitado'
  ];

  /* ------------------------------------------------------------------ utilidades */
  function call(method, url, body) {
    return CP.api(method, url, body).catch(function (e) {
      if (e.status === 401 && me) {
        me = null;
        CP.toast('Tu sesión terminó. Inicia sesión de nuevo.', 'bad');
        showLogin(true);
        e.handled = true;
      }
      throw e;
    });
  }
  function fail(e) { if (!e.handled) CP.toast(e.message, 'bad'); }
  function qs(obj) {
    var p = new URLSearchParams();
    Object.keys(obj).forEach(function (k) { if (obj[k] !== '' && obj[k] !== null && obj[k] !== undefined) p.set(k, obj[k]); });
    return p.toString();
  }
  function isAdmin() { return me && me.rol === 'admin'; }
  function estadoPill(estado) { return CP.pill(CP.ESTADO_KIND[estado] || 'plain', cfg.estados[estado] || estado); }
  function resultadoPill(r) { return CP.pill(CP.RESULTADO_KIND[r] || 'plain', cfg.resultados[r] || r); }
  function emailPill(estado) { var e = EMAIL_ESTADOS[estado] || [estado, 'plain']; return CP.pill(e[1], e[0]); }
  function field(label, control, opts) {
    opts = opts || {};
    if (!control.id) control.id = 'fld-' + Math.random().toString(36).slice(2, 9);
    return h('div', { class: 'field' + (opts.cls ? ' ' + opts.cls : '') },
      h('label', { for: control.id }, label, opts.req ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
      control, opts.help ? h('p', { class: 'help' }, opts.help) : null);
  }
  function select(options, value, attrs) {
    var el = h('select', Object.assign({ class: 'input' }, attrs || {}),
      options.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    el.value = value || '';
    return el;
  }
  function dash(v) { return v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length) ? '—' : (Array.isArray(v) ? v.join(', ') : String(v)); }
  function loading(text) { return h('p', { class: 'muted', role: 'status' }, text || 'Cargando…'); }
  function downloadCsv(params) {
    var p = Object.assign({}, params || {}, { pagina: 1, por_pagina: 5000 });
    call('GET', '/api/admin/proveedores?' + qs(p)).then(function (res) {
      var rows = [['Folio','Razón social','Nombre comercial','RFC / ID fiscal','País','Contacto','Puesto','Correo','Teléfono',
        'Tipo de servicio','Cobertura nacional','Cobertura Centroamérica','Tipos de unidad','Número de unidades','Monitoreo','GPS',
        'Estado','Resultado','Documentos entregados','Documentos aprobados','Responsable','Observaciones','Inicio','Envío','Actualización']];
      res.items.forEach(function (x) { var d = x.data || {}; rows.push([x.folio,x.razon_social,x.nombre_comercial,x.tax_id,x.pais,x.contacto_nombre,d.contacto_puesto,
        x.contacto_email,x.contacto_telefono,dash(x.servicios),dash(x.cobertura_nacional),dash(x.cobertura_internacional),dash(d.tipos_unidad),
        d.numero_unidades,d.monitoreo,d.gps,cfg.estados[x.estado] || x.estado,cfg.resultados[x.resultado_revision] || x.resultado_revision,
        x.documentos.entregados + ' de ' + x.documentos.requeridos,x.documentos.aprobados,x.responsable,x.observaciones,
        CP.fmtDateTime(x.fecha_inicio),CP.fmtDateTime(x.fecha_envio),CP.fmtDateTime(x.fecha_actualizacion)]); });
      function cell(v) { var s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g,'""') + '"'; }
      var blob = new Blob(['\ufeff' + rows.map(function(r){return r.map(cell).join(',');}).join('\r\n')], {type:'text/csv;charset=utf-8'});
      CP.saveBlob(blob, 'Proveedores_CESANTONI_' + new Date().toISOString().slice(0, 10) + '.csv');
      CP.toast(res.items.length + (res.items.length === 1 ? ' registro exportado.' : ' registros exportados.'), 'ok');
    }).catch(fail);
  }

  /* ------------------------------------------------------------------ arranque y sesión */
  function init() {
    var deep = null;
    var next = new URLSearchParams(location.search).get('next') || '';
    if (/^\/admin\/documento\/\d+$/.test(next)) nextUrl = next;
    Promise.all([
      CP.api('GET', '/api/portal/config'),
      CP.api('GET', '/api/admin/me').catch(function (e) { if (e.status === 401) return null; throw e; })
    ]).then(function (res) {
      cfg = res[0];
      cfg.doc_types.forEach(function (d) { docDefs[d.key] = d; });
      CP.logos(document.getElementById('brand'), cfg.logos);
      window.addEventListener('hashchange', route);
      if (res[1]) { me = res[1]; afterLogin(); return; }
      return CP.api('GET', '/api/admin/estado-inicial').then(function (st) { if (st.tiene_admin) showLogin(false); else showSetup(); });
    }).catch(function (e) {
      mount(app, h('div', { class: 'login-wrap' }, h('div', { class: 'notice notice-bad' },
        h('h3', null, 'No fue posible cargar el panel'), h('p', null, e.message))));
    });
  }

  function afterLogin() {
    renderUserMenu();
    if (me.debe_cambiar) return showPassword(true);
    if (nextUrl) { var go = nextUrl; nextUrl = ''; location.href = go; return; }
    if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', appHashUrl('#/proveedores'));
    route();
  }

  function renderUserMenu() {
    var box = document.getElementById('user-menu');
    if (!me) { CP.clear(box); return; }
    mount(box,
      h('span', { class: 'who' }, h('strong', null, me.nombre), me.rol === 'admin' ? 'Administrador' : 'Revisor'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: logout }, 'Salir'));
  }

  function showLogin(expired) {
    renderUserMenu();
    var user = h('input', { class: 'input', id: 'lg-user', type: 'email', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
    var pass = h('input', { class: 'input', id: 'lg-pass', type: 'password', autocomplete: 'current-password' });
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    var btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Entrar');
    var forgot = h('button', { type: 'button', class: 'link-btn small', style: { marginTop: '10px' } }, 'Olvidé mi contraseña');
    var forgotMsg = h('p', { class: 'small muted', role: 'status' });
    forgot.addEventListener('click', function () {
      if (!user.value.trim()) { err.textContent = 'Escribe tu correo y vuelve a pulsar «Olvidé mi contraseña».'; err.hidden = false; user.focus(); return; }
      CP.api('POST', '/api/admin/recuperar', { email: user.value.trim() }).then(function (r) { forgotMsg.textContent = r.mensaje; }).catch(function (e) { forgotMsg.textContent = e.message; });
    });
    var form = h('form', { novalidate: true }, field('Correo', user), field('Contraseña', pass), err, btn, h('div', null, forgot), forgotMsg);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.hidden = true;
      if (!user.value.trim() || !pass.value) { err.textContent = 'Escribe tu correo y tu contraseña.'; err.hidden = false; return; }
      CP.busy(btn, true, 'Entrando…');
      CP.api('POST', '/api/admin/login', { usuario: user.value.trim(), password: pass.value }).then(function (res) {
        me = res;
        return CP.api('GET', '/api/admin/me').then(function (full) { me = full; afterLogin(); });
      }).catch(function (e) { CP.busy(btn, false); err.textContent = e.message; err.hidden = false; pass.select(); });
    });
    mount(app, h('main', { class: 'login-wrap', id: 'content', tabindex: '-1' },
      h('section', { class: 'panel login-card', 'aria-labelledby': 'login-title' },
        h('h1', { id: 'login-title' }, 'Panel de proveedores'),
        h('p', { class: 'muted' }, 'Acceso exclusivo para personal autorizado de CESANTONI Logística.'),
        expired ? h('div', { class: 'notice notice-warn', style: { marginTop: '12px' } }, h('p', null, 'Tu sesión terminó. Vuelve a entrar para continuar.')) : null,
        nextUrl ? h('p', { class: 'small', style: { marginTop: '10px' } }, 'Inicia sesión para abrir el documento solicitado.') : null,
        form)));
    user.focus();
  }

  function showSetup() {
    var nombre = h('input', { class: 'input', id: 'st-nombre', autocomplete: 'name' });
    var email = h('input', { class: 'input', id: 'st-email', type: 'email', autocomplete: 'username' });
    var pass = h('input', { class: 'input', id: 'st-pass', type: 'password', autocomplete: 'new-password' });
    var pass2 = h('input', { class: 'input', id: 'st-pass2', type: 'password', autocomplete: 'new-password' });
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    var btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Crear administrador');
    var form = h('form', { novalidate: true }, field('Nombre', nombre), field('Correo', email),
      field('Contraseña', pass, { help: 'Mínimo 10 caracteres, con letras y números.' }), field('Repite la contraseña', pass2), err, btn);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.hidden = true;
      if (pass.value !== pass2.value) { err.textContent = 'Las contraseñas no coinciden.'; err.hidden = false; return; }
      CP.busy(btn, true, 'Creando…');
      CP.api('POST', '/api/admin/primer-admin', { nombre: nombre.value.trim(), email: email.value.trim(), password: pass.value }).then(function () {
        return CP.api('GET', '/api/admin/me').then(function (full) { me = full; CP.toast('Administrador creado.', 'ok'); afterLogin(); });
      }).catch(function (e) { CP.busy(btn, false); err.textContent = e.message; err.hidden = false; });
    });
    mount(app, h('main', { class: 'login-wrap', id: 'content', tabindex: '-1' },
      h('section', { class: 'panel login-card', 'aria-labelledby': 'setup-title' },
        h('h1', { id: 'setup-title' }, 'Configurar el panel'),
        h('p', { class: 'muted' }, 'Primera vez: crea la cuenta del administrador principal. Después podrás dar de alta a más personas desde Usuarios.'),
        form)));
    nombre.focus();
  }

  function logout() {
    CP.api('POST', '/api/admin/logout').catch(function () { return null; }).then(function () {
      me = null; CP.state.csrf = '';
      history.replaceState(null, '', appHashUrl(''));
      showLogin(false);
    });
  }

  function refreshMe() {
    return CP.api('GET', '/api/admin/me').then(function (res) { me = res; updateNavCounts(); }).catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ estructura y rutas */
  var NAV = [
    ['Operación'],
    ['proveedores', 'Proveedores', 'por_revisar', 'Por revisar'],
    ['correos', 'Correos', 'correos_con_error', 'Con error o sin enviar'],
    ['Configuración'],
    ['destinatarios', 'Destinatarios'],
    ['usuarios', 'Usuarios', null, null, true],
    ['sistema', 'Sistema'],
    ['Cuenta'],
    ['cuenta', 'Mi cuenta']
  ];

  function shell(active) {
    var nav = h('nav', { class: 'sidenav', 'aria-label': 'Secciones del panel' });
    NAV.forEach(function (item) {
      if (item.length === 1) { nav.appendChild(h('div', { class: 'group' }, item[0])); return; }
      if (item[4] && !isAdmin()) return;
      var count = item[2] ? h('span', { class: 'count', 'data-count': item[2], title: item[3] }) : null;
      nav.appendChild(h('a', { href: '#/' + item[0], 'aria-current': active === item[0] ? 'page' : null }, item[1], count));
    });
    content = h('main', { class: 'admin-main', id: 'content', tabindex: '-1' });
    mount(app, h('div', { class: 'admin-shell' }, nav, content));
    updateNavCounts();
    return content;
  }

  function updateNavCounts() {
    if (!me || !me.pendientes) return;
    Array.prototype.forEach.call(document.querySelectorAll('.sidenav .count'), function (el) {
      var n = me.pendientes[el.dataset.count] || 0;
      el.textContent = n ? String(n) : '';
      el.setAttribute('aria-label', n ? n + ' ' + el.title.toLowerCase() : '');
    });
  }

  function route() {
    if (!me) return showLogin(false);
    if (me.debe_cambiar) return showPassword(true);
    var hash = location.hash.replace(/^#\/?/, '');
    var path = hash.split('?')[0];
    var params = new URLSearchParams(hash.split('?')[1] || '');
    var m = path.match(/^proveedor\/([A-Za-z0-9_-]+)$/);
    refreshMe();
    if (m) return showDetail(m[1]);
    if (path === 'correos') return showEmails();
    if (path === 'destinatarios') return showRecipients();
    if (path === 'usuarios' && isAdmin()) return showUsers();
    if (path === 'cuenta') return showPassword(false);
    if (path === 'sistema') return showSystem();
    if (path !== 'proveedores') { history.replaceState(null, '', appHashUrl('#/proveedores')); params = new URLSearchParams(); }
    return showList(params);
  }

  function pageHead(title, extra) {
    return h('div', { class: 'page-head' }, h('h1', { tabindex: '-1' }, title), h('span', { class: 'spacer' }), extra);
  }
  function focusHead() {
    var h1 = content && content.querySelector('h1');
    if (h1) h1.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ lista de proveedores */
  function showList(params) {
    shell('proveedores');
    var state = {};
    FILTER_KEYS.forEach(function (k) { state[k] = params.get(k) || ''; });
    lastList = location.hash;
    var exportLink = h('button', { type: 'button', class: 'btn btn-dark' }, 'Exportar CSV');
    exportLink.addEventListener('click', function(){ var exportState = Object.assign({}, state, {pagina:'',por_pagina:''}); downloadCsv(exportState); });
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por estado' });
    var summary = h('p', { class: 'small muted', role: 'status', style: { margin: '0 0 10px' } });
    var tableBox = h('div', null, loading());
    var pager = h('div', { class: 'pager' });
    var seq = 0;

    function sync(resetPage) {
      if (resetPage) state.pagina = '';
      var query = qs(state);
      history.replaceState(null, '', appHashUrl('#/proveedores' + (query ? '?' + query : '')));
      lastList = location.hash;
      load();
    }

    function load() {
      var mine = ++seq;
      call('GET', '/api/admin/proveedores?' + qs(state)).then(function (res) {
        if (mine !== seq) return;
        renderChips(res);
        renderTable(res);
        renderPager(res);
      }).catch(function (e) { if (mine === seq) { mount(tableBox, h('div', { class: 'notice notice-bad' }, h('p', null, e.message))); fail(e); } });
    }

    function renderChips(res) {
      var total = ORDER_ESTADOS.reduce(function (a, k) { return a + (res.conteos[k] || 0); }, 0);
      var chip = function (value, label, n) {
        return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.estado === value),
          onclick: function () { state.estado = value; sync(true); } }, h('span', { class: 'n' }, String(n)), label);
      };
      mount(chips, chip('', 'Todos', total), ORDER_ESTADOS.map(function (k) { return chip(k, cfg.estados[k], res.conteos[k] || 0); }));
    }

    function docsCell(docs) {
      if (!docs || !docs.requeridos) return h('span', { class: 'muted' }, '—');
      var meter = h('div', { class: 'docs-meter', 'aria-hidden': 'true' });
      Object.keys(docs.detalle).forEach(function (k) {
        var d = docs.detalle[k];
        var cls = !d ? '' : (d.revision === 'aprobado' ? 'ok' : (d.revision === 'correccion' || d.revision === 'rechazado' ? 'bad'
          : (d.validacion === 'revision_manual' ? 'warn' : 'del')));
        meter.appendChild(h('i', { class: cls || null, title: docDefs[k].label }));
      });
      return [meter, h('div', { class: 'cell-strong' }, docs.entregados + ' de ' + docs.requeridos + ' entregados'),
        docs.pendientes.length ? h('div', { class: 'cell-sub cell-clip' }, 'Pendientes: ' + docs.pendientes.join(', ')) : null,
        docs.aprobados ? h('div', { class: 'cell-sub' }, docs.aprobados + ' aprobados') : null];
    }

    function coverage(item) {
      var nac = item.cobertura_nacional || [];
      var parts = [h('div', { class: 'cell-strong' }, item.pais || '—')];
      if (nac.length) parts.push(h('div', { class: 'cell-sub' }, 'Nacional: ' + (nac[0] === cfg.todaLaRepublica ? 'toda la República'
        : (nac.length > 3 ? nac.length + ' estados' : nac.join(', ')))));
      if ((item.cobertura_internacional || []).length) parts.push(h('div', { class: 'cell-sub' }, 'Centroamérica: ' + item.cobertura_internacional.join(', ')));
      return parts;
    }

    function renderTable(res) {
      var filtersOn = FILTER_KEYS.some(function (k) { return ['orden', 'pagina', 'por_pagina'].indexOf(k) < 0 && state[k]; });
      summary.textContent = res.total === 1 ? '1 registro' : res.total + ' registros';
      if (!res.items.length) {
        mount(tableBox, h('div', { class: 'panel empty' },
          h('h2', null, filtersOn ? 'Sin resultados con estos filtros' : 'Aún no hay registros'),
          h('p', null, filtersOn ? 'Ajusta o limpia los filtros para ver más registros.' : 'Los registros aparecen aquí en cuanto un proveedor genera su folio.'),
          filtersOn ? h('button', { type: 'button', class: 'btn btn-sm', onclick: clearFilters }, 'Limpiar filtros') : null));
        return;
      }
      // Estado, documentos y resultado van junto a la empresa para leerlos sin desplazar la tabla.
      var head = [['Folio'], ['Empresa / razón social', 'col-empresa'], ['Estado', 'col-estado'], ['Documentos', 'col-docs'], ['Resultado de revisión'],
        ['Contacto, correo y teléfono', 'col-contacto'], ['País y cobertura', 'col-cobertura'], ['Tipo de servicio', 'col-servicio'],
        ['Inicio / finalización'], ['Responsable'], ['Observaciones', 'col-obs']];
      var tbody = h('tbody');
      res.items.forEach(function (it) {
        var open = function () { location.hash = '#/proveedor/' + it.id; };
        var tr = h('tr', { class: 'clickable', tabindex: '0', 'aria-label': 'Abrir expediente ' + it.folio + ' ' + it.razon_social },
          h('td', { class: 'sticky-col' }, h('a', { class: 'folio-cell', href: '#/proveedor/' + it.id, tabindex: '-1' }, it.folio)),
          h('td', { class: 'col-empresa' }, h('div', { class: 'cell-strong' }, it.razon_social || '—'),
            it.nombre_comercial ? h('div', { class: 'cell-sub' }, it.nombre_comercial) : null,
            it.tax_id ? h('div', { class: 'cell-sub' }, it.tax_id) : null),
          h('td', { class: 'col-estado' }, estadoPill(it.estado)),
          h('td', { class: 'col-docs' }, docsCell(it.documentos)),
          h('td', null, resultadoPill(it.resultado_revision)),
          h('td', { class: 'col-contacto' }, h('div', { class: 'cell-strong' }, it.contacto_nombre || '—'),
            it.data.contacto_puesto ? h('div', { class: 'cell-sub' }, it.data.contacto_puesto) : null,
            h('div', null, it.contacto_email), h('div', { class: 'cell-sub nowrap' }, it.contacto_telefono)),
          h('td', { class: 'col-cobertura' }, coverage(it)),
          h('td', { class: 'col-servicio' }, h('div', { class: 'cell-clip' }, dash(it.servicios))),
          h('td', { class: 'nowrap' }, h('div', null, h('span', { class: 'cell-sub' }, 'Inicio '), CP.fmtDay(it.fecha_inicio)),
            h('div', null, h('span', { class: 'cell-sub' }, 'Envío '), it.fecha_envio ? CP.fmtDay(it.fecha_envio) : h('span', { class: 'muted' }, 'sin enviar'))),
          h('td', null, it.responsable || h('span', { class: 'muted' }, 'Sin asignar')),
          h('td', { class: 'col-obs' }, it.observaciones ? h('div', { class: 'cell-clip' }, it.observaciones) : h('span', { class: 'muted' }, '—')));
        tr.addEventListener('click', function (ev) { if (!ev.target.closest('a')) open(); });
        tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') open(); });
        tbody.appendChild(tr);
      });
      mount(tableBox, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('caption', { class: 'sr-only' }, 'Proveedores registrados'),
        h('thead', null, h('tr', null, head.map(function (t, i) { return h('th', { scope: 'col', class: i === 0 ? 'sticky-col' : (t[1] || null) }, t[0]); }))),
        tbody)));
    }

    function renderPager(res) {
      if (!res.total) { CP.clear(pager); return; }
      var from = (res.pagina - 1) * res.por_pagina + 1;
      var to = Math.min(res.total, res.pagina * res.por_pagina);
      var per = select([['25', '25 por página'], ['50', '50 por página'], ['100', '100 por página']], String(res.por_pagina),
        { 'aria-label': 'Registros por página', style: { minHeight: '34px', padding: '4px 8px', width: 'auto' } });
      per.addEventListener('change', function () { state.por_pagina = per.value; sync(true); });
      var prev = h('button', { type: 'button', class: 'btn btn-sm', disabled: res.pagina <= 1 }, 'Anterior');
      var next = h('button', { type: 'button', class: 'btn btn-sm', disabled: res.pagina >= res.paginas }, 'Siguiente');
      prev.addEventListener('click', function () { state.pagina = String(res.pagina - 1); sync(false); });
      next.addEventListener('click', function () { state.pagina = String(res.pagina + 1); sync(false); });
      mount(pager, h('span', null, 'Mostrando ' + from + ' a ' + to + ' de ' + res.total),
        h('span', { class: 'pages' }, prev, h('span', null, 'Página ' + res.pagina + ' de ' + res.paginas), next, per));
    }

    function clearFilters() {
      FILTER_KEYS.forEach(function (k) { if (k !== 'por_pagina') state[k] = ''; });
      showList(new URLSearchParams(qs(state)));
    }

    /* filtros */
    var q = h('input', { class: 'input', id: 'f-q', type: 'search', value: state.q, placeholder: 'Folio, razón social o nombre comercial', autocomplete: 'off' });
    var searchSoon = CP.debounce(function () { state.q = q.value.trim(); sync(true); }, 350);
    q.addEventListener('input', searchSoon);
    var bind = function (el, key) { el.addEventListener('change', function () { state[key] = el.value; sync(true); }); return el; };
    var pais = bind(select([['', 'Todos los países']].concat(cfg.paises.map(function (p) { return [p, p]; })), state.pais, { id: 'f-pais' }), 'pais');
    var cobertura = bind(select([['', 'Cualquier cobertura'], ['nacional', 'Solo nacional (México)'], ['centroamerica', 'Con cobertura en Centroamérica']]
      .concat(cfg.centroamerica.map(function (p) { return [p, 'Centroamérica: ' + p]; })), state.cobertura, { id: 'f-cob' }), 'cobertura');
    var servicio = bind(select([['', 'Todos los servicios']].concat(cfg.servicios.map(function (s) { return [s, s]; })), state.servicio, { id: 'f-serv' }), 'servicio');
    var resultado = bind(select([['', 'Cualquier resultado']].concat(Object.keys(cfg.resultados).map(function (k) { return [k, cfg.resultados[k]]; })),
      state.resultado, { id: 'f-res' }), 'resultado');
    var campo = bind(select([['inicio', 'Fecha de inicio'], ['finalizacion', 'Fecha de finalización (envío)']], state.fecha_campo || 'inicio', { id: 'f-campo' }), 'fecha_campo');
    var desde = bind(h('input', { class: 'input', type: 'date', id: 'f-desde', value: state.desde }), 'desde');
    var hasta = bind(h('input', { class: 'input', type: 'date', id: 'f-hasta', value: state.hasta }), 'hasta');
    var orden = bind(select([['recientes', 'Actividad más reciente'], ['folio', 'Folio (más nuevo)'], ['empresa', 'Empresa (A-Z)'],
      ['inicio', 'Fecha de inicio'], ['finalizacion', 'Fecha de finalización']], state.orden || 'recientes', { id: 'f-orden' }), 'orden');
    var filters = h('section', { class: 'panel filters', 'aria-label': 'Filtros' },
      field('Buscar', q), field('País', pais), field('Cobertura', cobertura), field('Tipo de servicio', servicio),
      field('Resultado de revisión', resultado),
      h('div', { class: 'dates' }, field('Filtrar fechas por', campo), field('Desde', desde), field('Hasta', hasta)),
      h('div', { class: 'filter-actions' }, field('Ordenar por', orden),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: clearFilters }, 'Limpiar filtros')));

    mount(content, pageHead('Proveedores', exportLink), chips, filters, summary, tableBox, pager);
    sync(false);
    focusHead();
  }

  /* ------------------------------------------------------------------ expediente */
  function showDetail(id) {
    shell('proveedores');
    mount(content, h('a', { class: 'back', href: lastList }, 'Volver a proveedores'), loading('Cargando expediente…'));
    call('GET', '/api/admin/proveedores/' + id).then(function (det) {
      renderDetail(det, null);
      focusHead();
    }).catch(function (e) {
      if (e.handled) return;
      mount(content, h('a', { class: 'back', href: lastList }, 'Volver a proveedores'),
        h('div', { class: 'notice notice-bad' }, h('h3', null, 'No se pudo abrir el expediente'), h('p', null, e.message)));
    });
  }

  function renderDetail(det, keepDocId) {
    var p = det.proveedor, data = det.data;
    var docs = det.documentos;
    var byType = {};
    docs.forEach(function (d) { (byType[d.tipo] = byType[d.tipo] || []).push(d); });
    var required = det.requeridos;
    var current = {};
    docs.forEach(function (d) { if (d.es_actual) current[d.tipo] = d; });
    var delivered = required.filter(function (k) { return current[k]; }).length;
    var approved = required.filter(function (k) { return current[k] && current[k].revision === 'aprobado'; }).length;

    var headActions = h('div', { class: 'head-actions' });
    if (det.pendientes_notificar > 0) {
      var notifyBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Notificar correcciones (' + det.pendientes_notificar + ')');
      notifyBtn.addEventListener('click', function () {
        CP.busy(notifyBtn, true, 'Notificando…');
        call('POST', '/api/admin/proveedores/' + p.id + '/notificar-correcciones').then(function (res) {
          renderDetail(res, keepDocId);
          CP.toast(emailNote('Se registró el aviso de corrección para el proveedor.'), 'ok');
        }).catch(function (e) { CP.busy(notifyBtn, false); fail(e); });
      });
      headActions.appendChild(notifyBtn);
    }
    var oneExport = h('button', { type: 'button', class: 'btn' }, 'Exportar CSV');
    oneExport.addEventListener('click', function(){ downloadCsv({q:p.folio}); });
    headActions.appendChild(oneExport);

    var head = h('section', { class: 'panel', 'aria-labelledby': 'dossier-title' },
      h('div', { class: 'dossier-head' },
        h('div', null, h('div', { class: 'folio' }, p.folio), h('div', { class: 'cell-sub' }, 'Actualizado ' + CP.fmtDateTime(p.fecha_actualizacion))),
        h('div', null,
          h('h1', { id: 'dossier-title', tabindex: '-1' }, p.razon_social || 'Sin razón social'),
          h('p', { class: 'muted small', style: { margin: '2px 0 0' } }, [data.nombre_comercial, data.tax_id].filter(Boolean).join(' | ') || 'Sin datos fiscales todavía'),
          h('div', { class: 'pills' }, estadoPill(p.estado), resultadoPill(p.resultado_revision),
            CP.pill(delivered === required.length ? 'ok' : 'plain', 'Documentos ' + delivered + ' de ' + required.length),
            approved ? CP.pill('ok', approved + ' aprobados') : null)),
        headActions),
      h('dl', { class: 'facts' },
        fact('País', p.pais), fact('Cobertura nacional', data.cobertura_nacional),
        fact('Cobertura Centroamérica', (data.cobertura_internacional || []).length ? data.cobertura_internacional : 'Sin cobertura'),
        fact('Tipo de servicio', data.servicios), fact('Contacto', [p.contacto_nombre, data.contacto_puesto].filter(Boolean).join(', ')),
        fact('Correo', p.contacto_email), fact('Teléfono', p.contacto_telefono),
        fact('Fecha de inicio', CP.fmtDateTime(p.fecha_inicio)),
        fact('Fecha de finalización', p.fecha_envio ? CP.fmtDateTime(p.fecha_envio) : 'Sin enviar'),
        p.envios > 1 ? fact('Último envío', CP.fmtDateTime(p.fecha_ultimo_envio) + ' (envío ' + p.envios + ')') : null,
        fact('Responsable', p.responsable_nombre || 'Sin asignar')));

    var viewerHead = h('div', { class: 'viewer-head' }, h('h2', null, 'Vista del documento'));
    var viewerBody = h('div', { class: 'viewer-body' }, h('p', { class: 'placeholder' }, 'Elige «Ver» en un documento para mostrarlo aquí.'));
    var viewer = h('section', { class: 'panel viewer', 'aria-label': 'Vista del documento' }, viewerHead, viewerBody);

    var list = h('div');
    var ctx = { det: det, viewerHead: viewerHead, viewerBody: viewerBody, list: list };
    cfg.doc_types.forEach(function (dt) {
      var versions = byType[dt.key] || [];
      if (required.indexOf(dt.key) < 0 && !versions.length) return;
      list.appendChild(docAdmin(dt, versions, required.indexOf(dt.key) >= 0, ctx));
    });
    var notStarted = p.estado === 'iniciado';
    var docsPanel = h('section', { class: 'panel', 'aria-labelledby': 'docs-title' },
      h('div', { style: { padding: '16px 18px 4px' } },
        h('h2', { class: 'section-title', id: 'docs-title' }, 'Documentos'),
        notStarted ? h('div', { class: 'notice notice-info', style: { marginBottom: '8px' } },
          h('p', null, 'El proveedor aún no envía su registro. Puedes consultar los documentos; la revisión se habilita cuando lo envíe.')) : null),
      list);

    mount(content,
      h('a', { class: 'back', href: lastList }, 'Volver a proveedores'),
      head,
      h('div', { class: 'dossier-grid' }, docsPanel, viewer),
      h('div', { class: 'two-col', style: { marginTop: '20px' } }, reviewPanel(det), dataPanel(det)),
      h('div', { class: 'two-col', style: { marginTop: '20px' } }, historyPanel(det), emailsPanel(det)));

    if (keepDocId) {
      var keep = docs.filter(function (d) { return d.id === keepDocId; })[0];
      if (keep) openViewer(keep, ctx, false);
    }
  }

  function fact(label, value) {
    return [h('div', null, h('dt', null, label), h('dd', null, dash(value)))];
  }

  function emailNote(base) {
    return me && me.correo_configurado ? base + ' Consulta su estado en Correos.'
      : base + ' El envío de correos no está configurado: el aviso quedó registrado como «Sin configurar».';
  }

  function docAdmin(dt, versions, required, ctx) {
    var cur = versions.filter(function (v) { return v.es_actual; })[0];
    var others = versions.filter(function (v) { return v !== cur; });
    var p = ctx.det.proveedor;
    var el = h('article', { class: 'doc-admin', id: 'doc-' + dt.key, 'data-doc': cur ? cur.id : '' });
    var pills = h('span', { class: 'pills', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
    if (cur) {
      pills.appendChild(CP.pill(CP.VALIDACION_KIND[cur.validacion], cfg.validaciones[cur.validacion]));
      pills.appendChild(CP.pill(CP.REVISION_KIND[cur.revision], cfg.revisiones[cur.revision]));
    } else {
      pills.appendChild(CP.pill('plain', required ? 'Pendiente de entrega' : 'No entregado'));
    }
    el.appendChild(h('div', { class: 'top' },
      h('h3', null, dt.label, h('small', null, (required ? 'Requerido' : 'Opcional') + ' | ' +
        (dt.rule === 'max_age' ? 'Antigüedad máxima ' + cfg.max_age_months + ' meses' : 'Debe estar vigente'))), pills));
    if (!cur) {
      el.appendChild(h('p', { class: 'doc-missing' }, others.length
        ? 'Sin versión vigente: los intentos de carga se rechazaron automáticamente por fecha (ver abajo).'
        : 'El proveedor no ha subido este documento.'));
    } else {
      var fecha = cur.fecha_detectada ? CP.fmtYmd(cur.fecha_detectada) + (cur.tipo_fecha === 'emision' ? ' (emisión)' : ' (vencimiento)') : 'No detectada';
      el.appendChild(h('dl', { class: 'meta' },
        metaItem('Fecha detectada', fecha),
        metaItem('Fecha del servidor', CP.fmtYmd(cur.fecha_servidor)),
        metaItem('Lectura', (METODOS[cur.metodo_lectura] || '—') + (cur.confianza_ocr !== null && cur.confianza_ocr !== undefined ? ' (' + Math.round(cur.confianza_ocr) + '%)' : '')),
        metaItem('Certeza', CERTEZAS[cur.certeza] || '—'),
        metaItem('Archivo', cur.nombre_original + ' (' + CP.fmtSize(cur.tamano) + ')'),
        metaItem('Subido', CP.fmtDateTime(cur.subido_en) + ' | versión ' + cur.version)));
      if (cur.fragmento) el.appendChild(h('div', { class: 'fragment' }, h('strong', null, 'Texto leído: '), cur.fragmento));
      el.appendChild(h('p', { class: 'detail' }, cur.validacion_detalle));
      if (cur.validacion_nota_interna) el.appendChild(h('p', { class: 'internal' }, 'Nota interna: ' + cur.validacion_nota_interna));
      if (cur.revision !== 'pendiente') {
        el.appendChild(h('div', { class: 'review-note notice notice-' + ({ aprobado: 'ok', rechazado: 'bad', correccion: 'orange' }[cur.revision] || 'info') },
          h('p', null, h('strong', null, cfg.revisiones[cur.revision]), ' por ' + (cur.revisado_por_nombre || 'usuario') + ' el ' + CP.fmtDateTime(cur.revisado_en)),
          cur.motivo ? h('p', null, 'Motivo: ' + cur.motivo) : null,
          cur.observaciones ? h('p', null, 'Observaciones: ' + cur.observaciones) : null));
      }
      var locked = p.estado === 'iniciado';
      var actions = h('div', { class: 'actions' });
      var viewBtn = h('button', { type: 'button', class: 'btn btn-sm btn-dark' }, 'Ver');
      viewBtn.addEventListener('click', function () { openViewer(cur, ctx, true); });
      actions.appendChild(viewBtn);
      if (cur.drive_url) actions.appendChild(h('a', { class: 'btn btn-sm', href: cur.drive_url, target: '_blank', rel: 'noopener' }, 'Abrir en Drive'));
      [['aprobar', 'Aprobar', 'btn-ok'], ['correccion', 'Solicitar corrección', ''], ['rechazar', 'Rechazar', 'btn-danger']].forEach(function (a) {
        var b = h('button', { type: 'button', class: 'btn btn-sm ' + a[2], disabled: locked,
          title: locked ? 'Disponible cuando el proveedor envíe su registro' : null }, a[1]);
        b.addEventListener('click', function () { reviewModal(cur, dt, a[0], ctx); });
        actions.appendChild(b);
      });
      el.appendChild(actions);
    }
    if (others.length) {
      var ul = h('ul', { class: 'versions' });
      others.forEach(function (v) {
        var vb = h('button', { type: 'button', class: 'link-btn small' }, 'Ver');
        vb.addEventListener('click', function () { openViewer(v, ctx, true); });
        ul.appendChild(h('li', null, h('strong', null, 'v' + v.version), h('span', { class: 'small muted' }, CP.fmtDateTime(v.subido_en)),
          CP.pill(CP.VALIDACION_KIND[v.validacion], cfg.validaciones[v.validacion]),
          v.revision !== 'pendiente' ? CP.pill(CP.REVISION_KIND[v.revision], cfg.revisiones[v.revision]) : null,
          h('span', { class: 'small' }, v.nombre_original),
          v.validacion === 'rechazado' ? h('span', { class: 'small muted' }, 'Rechazado al subir; no reemplazó la versión vigente') : null,
          vb, v.drive_url ? h('a', { class: 'small', href: v.drive_url, target: '_blank', rel: 'noopener' }, 'Abrir en Drive') : null));
      });
      el.appendChild(h('details', null, h('summary', null, 'Versiones anteriores e intentos (' + others.length + ')'), ul));
    }
    return el;
  }

  function metaItem(label, value) { return h('div', null, h('dt', null, label), h('dd', null, dash(value))); }

  function openViewer(doc, ctx, scroll) {
    Array.prototype.forEach.call(ctx.list.querySelectorAll('.doc-admin'), function (el) { el.classList.remove('selected'); });
    var row = ctx.list.querySelector('#doc-' + doc.tipo);
    if (row) row.classList.add('selected');
    /* El archivo es privado en Drive: el servidor lo entrega solo a usuarios con sesión en el panel. */
    var openBtn = h('button', { type: 'button', class: 'btn btn-sm', disabled: true }, 'Abrir en pestaña nueva');
    var downBtn = h('button', { type: 'button', class: 'btn btn-sm', disabled: true }, 'Descargar');
    mount(ctx.viewerHead,
      h('h2', null, docDefs[doc.tipo].label + ' | v' + doc.version), openBtn, downBtn,
      doc.drive_url ? h('a', { class: 'btn btn-sm', href: doc.drive_url, target: '_blank', rel: 'noopener',
        title: 'Requiere acceso de Google Drive a la carpeta de expedientes' }, 'Abrir en Drive') : null);
    ctx.viewer = doc.id;
    mount(ctx.viewerBody, loading('Cargando documento…'));
    if (scroll && window.matchMedia('(max-width: 1100px)').matches) ctx.viewerHead.scrollIntoView({ behavior: 'smooth', block: 'start' });
    call('GET', '/api/admin/documentos/' + doc.id + '/contenido').then(function (file) {
      if (ctx.viewer !== doc.id) return;
      var blob = CP.base64Blob(file.base64, file.mime);
      var url = URL.createObjectURL(blob);
      openBtn.disabled = false; downBtn.disabled = false;
      openBtn.addEventListener('click', function () { window.open(url, '_blank', 'noopener'); });
      downBtn.addEventListener('click', function () { CP.saveBlob(blob, file.nombre || ('documento_v' + doc.version)); });
      if (/^image\//.test(file.mime)) {
        mount(ctx.viewerBody, h('img', { src: url, alt: docDefs[doc.tipo].label + ', versión ' + doc.version, style: { display: 'block', maxWidth: '100%', margin: '0 auto' } }));
      } else {
        mount(ctx.viewerBody,
          h('iframe', { src: url, title: docDefs[doc.tipo].label + ', versión ' + doc.version, style: { width: '100%', height: '70vh', border: '1px solid var(--line)', background: '#fff' } }),
          file.miniatura ? h('img', { src: file.miniatura, alt: 'Primera página de ' + docDefs[doc.tipo].label, style: { display: 'block', maxWidth: '100%', margin: '0 auto 12px', border: '1px solid var(--line)' } }) : null,
          h('p', { class: 'placeholder' }, (file.miniatura ? 'Vista de la primera página. ' : '') + 'Para revisar el PDF completo usa «Abrir en pestaña nueva» o «Descargar».'));
      }
    }).catch(function (e) {
      if (ctx.viewer !== doc.id) return;
      mount(ctx.viewerBody, h('div', { class: 'notice notice-bad' }, h('p', null, e.message)));
    });
  }

  function reviewModal(doc, dt, action, ctx) {
    var titles = { aprobar: 'Aprobar documento', correccion: 'Solicitar corrección', rechazar: 'Rechazar documento' };
    var requestId = CP.uuid();
    var listId = 'motivos-' + requestId.slice(0, 8);
    var motivo = h('input', { class: 'input', id: 'rv-motivo', list: listId, maxlength: '1000', autocomplete: 'off' });
    var obs = h('textarea', { class: 'input', id: 'rv-obs', maxlength: '2000' });
    var notify = h('input', { type: 'checkbox', id: 'rv-notify', checked: true });
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    var body = [h('p', null, h('strong', null, dt.label), ' | versión ' + doc.version + ' | ' + doc.nombre_original)];
    if (action !== 'aprobar') {
      body.push(field('Motivo', motivo, { req: true, help: action === 'correccion' ? 'El proveedor verá este motivo en el correo y en su registro.' : 'Queda en el expediente y en el Excel.' }));
      body.push(h('datalist', { id: listId }, MOTIVOS.map(function (m) { return h('option', { value: m }); })));
    }
    body.push(field(action === 'aprobar' ? 'Observaciones (opcional)' : 'Observaciones', obs));
    if (action === 'correccion') {
      body.push(h('label', { class: 'check', for: 'rv-notify' }, notify,
        h('span', null, 'Enviar ahora el aviso al proveedor. Si lo desmarcas, puedes marcar más documentos y enviar un solo aviso con «Notificar correcciones».')));
    }
    if (action === 'rechazar') {
      body.push(h('div', { class: 'notice notice-info' }, h('p', null, 'Rechazar no envía aviso al proveedor. Si necesitas que reemplace el archivo, usa «Solicitar corrección».')));
    }
    body.push(err);
    var cls = { aprobar: 'btn-primary', correccion: 'btn-primary', rechazar: 'btn-danger-solid' }[action];
    var confirm = h('button', { type: 'button', class: 'btn ' + cls }, titles[action]);
    var cancel = h('button', { type: 'button', class: 'btn' }, 'Cancelar');
    var m = CP.modal({ title: titles[action], body: body, actions: [cancel, confirm] });
    cancel.addEventListener('click', m.close);
    motivo.addEventListener('input', function () { if (motivo.value.trim()) err.hidden = true; });
    confirm.addEventListener('click', function () {
      err.hidden = true;
      if (action !== 'aprobar' && !motivo.value.trim()) { err.textContent = 'Escribe el motivo.'; err.hidden = false; motivo.focus(); return; }
      CP.busy(confirm, true, 'Guardando…');
      call('POST', '/api/admin/documentos/' + doc.id + '/revision', {
        accion: action, motivo: motivo.value.trim(), observaciones: obs.value.trim(), request_id: requestId,
        notificar: action === 'correccion' ? notify.checked : false
      }).then(function (res) {
        m.close();
        renderDetail(res, ctx.viewer || null);
        var r = res.resultado || {};
        if (action === 'correccion') CP.toast(r.notificados ? emailNote('Corrección solicitada y aviso registrado para el proveedor.')
          : 'Corrección registrada. Envía el aviso con «Notificar correcciones».', 'ok');
        else CP.toast(action === 'aprobar' ? 'Documento aprobado.' : 'Documento rechazado.', 'ok');
        refreshMe();
      }).catch(function (e) { CP.busy(confirm, false); if (!e.handled) { err.textContent = e.message; err.hidden = false; } });
    });
  }

  function reviewPanel(det) {
    var p = det.proveedor;
    var resp = select([['', 'Sin asignar']].concat(det.responsables.map(function (u) { return [String(u.id), u.nombre]; })),
      p.responsable_id ? String(p.responsable_id) : '', { id: 'rv-resp' });
    var resultado = select(Object.keys(cfg.resultados).map(function (k) { return [k, cfg.resultados[k]]; }), p.resultado_revision,
      { id: 'rv-result', disabled: p.estado === 'iniciado' });
    var obs = h('textarea', { class: 'input', id: 'rv-general', maxlength: '4000' });
    obs.value = p.observaciones || '';
    var save = h('button', { type: 'button', class: 'btn btn-dark' }, 'Guardar revisión');
    var msg = h('p', { class: 'small muted', role: 'status', style: { margin: 0 } });
    save.addEventListener('click', function () {
      CP.busy(save, true, 'Guardando…');
      var payload = { responsable_id: resp.value || null, observaciones: obs.value };
      if (!resultado.disabled) payload.resultado_revision = resultado.value;
      call('PATCH', '/api/admin/proveedores/' + p.id, payload).then(function (res) {
        renderDetail(res, null);
        CP.toast('Revisión guardada.', 'ok');
        refreshMe();
      }).catch(function (e) { CP.busy(save, false); fail(e); });
    });
    return h('section', { class: 'panel panel-pad', 'aria-labelledby': 'rv-title' },
      h('h2', { class: 'section-title', id: 'rv-title' }, 'Revisión del expediente'),
      h('div', { class: 'review-form' },
        field('Responsable', resp), field('Resultado de revisión', resultado, {
          help: p.estado === 'iniciado' ? 'Se habilita cuando el proveedor envíe su registro.' : 'Aprobar exige todos los documentos requeridos aprobados.' }),
        field('Observaciones', obs, { cls: 'span-2' }),
        h('div', { class: 'span-2', style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, save, msg)),
      p.fecha_resolucion ? h('p', { class: 'small muted', style: { marginTop: '12px' } }, 'Resuelto el ' + CP.fmtDateTime(p.fecha_resolucion)) : null);
  }

  function dataPanel(det) {
    var groups = cfg.steps.map(function (step) {
      var dl = h('dl', { class: 'kv' });
      step.fields.forEach(function (f) {
        dl.appendChild(h('dt', null, f.label));
        var err = det.errores[step.id] && det.errores[step.id][f.key];
        dl.appendChild(h('dd', null, dash(det.data[f.key]), err && det.proveedor.estado === 'iniciado' ? h('div', { class: 'cell-sub' }, err) : null));
      });
      return h('div', null, h('h3', null, step.title), dl);
    });
    return h('section', { class: 'panel panel-pad', 'aria-labelledby': 'data-title' },
      h('h2', { class: 'section-title', id: 'data-title' }, 'Datos del registro'), h('div', { class: 'data-groups' }, groups));
  }

  function historyPanel(det) {
    var items = det.eventos.map(function (e) {
      return h('li', null, h('time', null, CP.fmtDateTime(e.creado_en)),
        h('div', null, h('strong', null, ACCIONES[e.accion] || e.accion), e.detalle ? h('div', null, e.detalle) : null,
          h('div', { class: 'cell-sub' }, (e.actor_tipo === 'admin' ? 'Usuario: ' : 'Proveedor') + (e.actor_tipo === 'admin' ? e.actor : (e.actor ? ': ' + e.actor : '')))));
    });
    return h('section', { class: 'panel panel-pad', 'aria-labelledby': 'hist-title' },
      h('h2', { class: 'section-title', id: 'hist-title' }, 'Historial'),
      items.length ? h('ul', { class: 'log' }, items) : h('p', { class: 'muted' }, 'Sin movimientos.'));
  }

  function emailsPanel(det) {
    var items = det.correos.map(function (c) { return emailItem(c, function () { showDetail(det.proveedor.id); }); });
    return h('section', { class: 'panel panel-pad', 'aria-labelledby': 'mail-title' },
      h('h2', { class: 'section-title', id: 'mail-title' }, 'Correos del expediente'),
      items.length ? h('ul', { class: 'log' }, items) : h('p', { class: 'muted' }, 'Sin correos.'));
  }

  function emailItem(c, onChange) {
    var actions = h('span', { style: { display: 'inline-flex', gap: '10px', marginTop: '4px' } });
    var preview = h('button', { type: 'button', class: 'link-btn small' }, 'Ver correo');
    preview.addEventListener('click', function () { emailPreview(c); });
    actions.appendChild(preview);
    if (c.estado === 'error' || c.estado === 'sin_configurar') {
      var retry = h('button', { type: 'button', class: 'link-btn small' }, 'Reintentar');
      retry.addEventListener('click', function () {
        retry.disabled = true;
        call('POST', '/api/admin/correos/' + c.id + '/reintentar').then(function (row) {
          CP.toast(row.estado === 'enviado' ? 'Correo enviado.' : 'Sigue sin enviarse: ' + (row.ultimo_error || row.estado), row.estado === 'enviado' ? 'ok' : 'bad');
          if (onChange) onChange();
        }).catch(function (e) { retry.disabled = false; fail(e); });
      });
      actions.appendChild(retry);
    }
    return h('li', null, h('time', null, CP.fmtDateTime(c.enviado_en || c.creado_en)),
      h('div', null, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, emailPill(c.estado), h('strong', null, c.asunto)),
        h('div', { class: 'cell-sub' }, 'Para: ' + (c.destinatarios || 'sin destinatarios')),
        c.ultimo_error && c.estado !== 'enviado' ? h('div', { class: 'cell-sub', style: { color: 'var(--bad)' } }, c.ultimo_error) : null,
        actions));
  }

  function emailPreview(c) {
    var ct = c.contenido || {};
    CP.modal({ title: c.asunto, wide: true, body: [
      h('p', { class: 'small muted' }, 'Para: ' + (c.destinatarios || 'sin destinatarios')),
      h('div', { class: 'notice notice-' + (c.estado === 'enviado' ? 'ok' : (c.estado === 'error' ? 'bad' : 'info')) },
        h('p', null, 'Estado: ' + (EMAIL_ESTADOS[c.estado] ? EMAIL_ESTADOS[c.estado][0] : (c.estado || 'desconocido')) + ' | intentos: ' + (c.intentos || 0)),
        c.ultimo_error ? h('p', null, c.ultimo_error) : null),
      ct.titulo ? h('section', { class: 'panel panel-pad', style: { marginTop: '12px' } },
        h('h3', null, ct.titulo),
        (ct.parrafos || []).map(function (p) { return h('p', null, p); }),
        (ct.datos || []).length ? h('dl', { class: 'kv' }, ct.datos.map(function (r) { return [h('dt', null, r[0]), h('dd', null, r[1])]; })) : null,
        ct.boton ? h('p', { class: 'small muted' }, 'Botón: ' + ct.boton.texto) : null,
        ct.nota ? h('p', { class: 'small muted' }, ct.nota) : null) : null] });
  }

  /* ------------------------------------------------------------------ correos */
  function showEmails() {
    shell('correos');
    var estado = select([['', 'Todos los estados']].concat(Object.keys(EMAIL_ESTADOS).map(function (k) { return [k, EMAIL_ESTADOS[k][0]]; })), '', { id: 'm-estado' });
    var q = h('input', { class: 'input', type: 'search', id: 'm-q', placeholder: 'Folio, destinatario o asunto' });
    var retryAll = h('button', { type: 'button', class: 'btn', hidden: true }, 'Reintentar los no enviados');
    var status = h('div');
    var box = h('div', null, loading());
    var load = function () {
      call('GET', '/api/admin/correos?' + qs({ estado: estado.value, q: q.value.trim() })).then(function (res) {
        var fallidos = (res.conteos.error || 0) + (res.conteos.sin_configurar || 0);
        retryAll.hidden = !fallidos;
        mount(status, res.configurado
          ? h('div', { class: 'notice notice-ok' }, h('p', null, 'Envío activo por ' + (res.backend_label || (res.backend === 'graph' ? 'Microsoft Graph' : 'SMTP')) + '. ' +
            'Cada aviso queda registrado aquí; los que fallen se pueden reintentar.' + (res.cuota_restante !== null && res.cuota_restante !== undefined ? ' Cuota restante hoy: ' + res.cuota_restante + ' destinatarios.' : '')))
          : h('div', { class: 'notice notice-warn' }, h('h3', null, 'El envío de correos no está configurado'),
            h('p', null, 'Los avisos se guardan aquí con estado «Error» hasta configurar EmailJS en js/config.js; después podrás reenviarlos con «Reintentar».')));
        if (!res.items.length) { mount(box, h('div', { class: 'panel empty' }, h('h2', null, 'Sin correos'), h('p', null, 'No hay correos con estos filtros.'))); return; }
        var rows = res.items.map(function (c) {
          var acts = h('td', { class: 'nowrap' });
          var pv = h('button', { type: 'button', class: 'link-btn' }, 'Ver');
          pv.addEventListener('click', function () { emailPreview(c); });
          acts.appendChild(pv);
          if (c.estado === 'error' || c.estado === 'sin_configurar') {
            var rb = h('button', { type: 'button', class: 'link-btn', style: { marginLeft: '12px' } }, 'Reintentar');
            rb.addEventListener('click', function () {
              rb.disabled = true;
              call('POST', '/api/admin/correos/' + c.id + '/reintentar').then(function () { load(); refreshMe(); }).catch(function (e) { rb.disabled = false; fail(e); });
            });
            acts.appendChild(rb);
          }
          return h('tr', null,
            h('td', { class: 'nowrap' }, CP.fmtDateTime(c.creado_en), c.enviado_en ? h('div', { class: 'cell-sub' }, 'Enviado ' + CP.fmtDateTime(c.enviado_en)) : null),
            h('td', null, res.tipos[c.tipo] || c.tipo),
            h('td', null, c.folio ? h('a', { href: '#/proveedor/' + c.supplier_id, class: 'folio-cell' }, c.folio) : '—'),
            h('td', null, h('div', { class: 'cell-clip' }, c.destinatarios || '—')),
            h('td', null, h('div', { class: 'cell-clip' }, c.asunto)),
            h('td', null, emailPill(c.estado)),
            h('td', null, String(c.intentos)),
            h('td', null, c.ultimo_error && c.estado !== 'enviado' ? h('div', { class: 'cell-clip cell-sub' }, c.ultimo_error) : '—'),
            acts);
        });
        mount(box, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, ['Creado', 'Tipo', 'Folio', 'Destinatarios', 'Asunto', 'Estado', 'Intentos', 'Detalle', 'Acciones']
            .map(function (t) { return h('th', { scope: 'col' }, t); }))), h('tbody', null, rows))));
      }).catch(fail);
    };
    estado.addEventListener('change', load);
    q.addEventListener('input', CP.debounce(load, 350));
    retryAll.addEventListener('click', function () {
      CP.busy(retryAll, true, 'Reintentando…');
      call('POST', '/api/admin/correos/reintentar-todos').then(function (r) {
        CP.busy(retryAll, false); CP.toast((r.enviados || 0) + ' de ' + r.reintentados + ' correos enviados.', r.enviados === r.reintentados ? 'ok' : 'bad'); load(); refreshMe();
      }).catch(function (e) { CP.busy(retryAll, false); fail(e); });
    });
    mount(content, pageHead('Correos', retryAll), status,
      h('section', { class: 'panel filters', style: { gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 2fr)', marginTop: '16px' } },
        field('Estado', estado), field('Buscar', q)), box);
    load();
    focusHead();
  }

  /* ------------------------------------------------------------------ destinatarios */
  function showRecipients() {
    shell('destinatarios');
    var box = h('div', null, loading());
    var warn = h('div');
    var editable = isAdmin();
    var load = function () {
      call('GET', '/api/admin/destinatarios').then(function (res) {
        var active = res.items.filter(function (r) { return r.activo; });
        mount(warn, !active.some(function (r) { return r.aviso_inicio; }) || !active.some(function (r) { return r.aviso_envio; })
          ? h('div', { class: 'notice notice-warn' }, h('p', null, 'Hay avisos internos sin destinatario activo. Esos correos quedarán con error hasta que agregues al menos uno.'))
          : null);
        if (!res.items.length) { mount(box, h('div', { class: 'panel empty' }, h('h2', null, 'Sin destinatarios'), h('p', null, 'Agrega los correos de CESANTONI que deben recibir los avisos.'))); return; }
        var rows = res.items.map(function (r) {
          var toggle = function (key) {
            var names = { aviso_inicio: 'Aviso de inicio', aviso_envio: 'Aviso de envío', activo: 'Activo' };
            var cb = h('input', { type: 'checkbox', checked: !!r[key], disabled: !editable, 'aria-label': names[key] + ': ' + r.email });
            cb.addEventListener('change', function () {
              var payload = { nombre: r.nombre, email: r.email, aviso_inicio: !!r.aviso_inicio, aviso_envio: !!r.aviso_envio, activo: !!r.activo };
              payload[key] = cb.checked;
              call('PUT', '/api/admin/destinatarios/' + r.id, payload).then(function () { CP.toast('Destinatario actualizado.', 'ok'); load(); })
                .catch(function (e) { cb.checked = !cb.checked; fail(e); });
            });
            return h('td', null, cb);
          };
          var del = editable ? h('button', { type: 'button', class: 'link-btn' }, 'Eliminar') : null;
          if (del) del.addEventListener('click', function () {
            if (!window.confirm('¿Eliminar a ' + r.email + ' de los avisos?')) return;
            call('DELETE', '/api/admin/destinatarios/' + r.id).then(function () { CP.toast('Destinatario eliminado.', 'ok'); load(); }).catch(fail);
          });
          return h('tr', null, h('td', null, r.nombre || '—'), h('td', null, r.email), toggle('aviso_inicio'), toggle('aviso_envio'), toggle('activo'), h('td', null, del));
        });
        mount(box, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, ['Nombre', 'Correo', 'Aviso de inicio', 'Aviso de envío', 'Activo', ''].map(function (t) { return h('th', { scope: 'col' }, t); }))),
          h('tbody', null, rows))));
      }).catch(fail);
    };
    var form = null;
    if (editable) {
      var nombre = h('input', { class: 'input', id: 'd-nombre', autocomplete: 'off' });
      var email = h('input', { class: 'input', id: 'd-email', type: 'email', autocomplete: 'off' });
      var ini = h('input', { type: 'checkbox', id: 'd-ini', checked: true });
      var env = h('input', { type: 'checkbox', id: 'd-env', checked: true });
      var addBtn = h('button', { type: 'submit', class: 'btn btn-dark' }, 'Agregar');
      form = h('form', { class: 'panel panel-pad', novalidate: true, style: { marginBottom: '16px' } },
        h('h2', { class: 'section-title' }, 'Agregar destinatario'),
        h('div', { class: 'inline-form' }, field('Nombre o área', nombre), field('Correo', email, { req: true }),
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Avisos'),
            h('label', { class: 'check', for: 'd-ini' }, ini, 'Registro iniciado'), h('label', { class: 'check', for: 'd-env' }, env, 'Registro enviado')),
          h('div', null, addBtn)));
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        CP.busy(addBtn, true, 'Agregando…');
        call('POST', '/api/admin/destinatarios', { nombre: nombre.value.trim(), email: email.value.trim(), aviso_inicio: ini.checked, aviso_envio: env.checked, activo: true })
          .then(function () { CP.busy(addBtn, false); nombre.value = ''; email.value = ''; CP.toast('Destinatario agregado.', 'ok'); load(); })
          .catch(function (e) { CP.busy(addBtn, false); fail(e); });
      });
    }
    mount(content, pageHead('Destinatarios internos'),
      h('p', { class: 'muted', style: { maxWidth: '75ch' } }, 'Correos de CESANTONI que reciben los avisos cuando un proveedor inicia su registro y cuando lo envía a revisión. ' +
        'Los cambios aplican a los avisos siguientes y a los reintentos.' + (editable ? '' : ' Solo un administrador puede modificarlos.')),
      warn, form, box);
    load();
    focusHead();
  }

  /* ------------------------------------------------------------------ usuarios */
  function userModal(user, onDone) {
    var isNew = !user;
    var nombre = h('input', { class: 'input', id: 'u-nombre', autocomplete: 'off', value: isNew ? '' : user.nombre });
    var email = h('input', { class: 'input', id: 'u-email', type: 'email', autocomplete: 'off', value: isNew ? '' : user.email, disabled: !isNew });
    var reset = h('input', { type: 'checkbox', id: 'u-reset' });
    var rol = select([['revisor', 'Revisor: revisa expedientes'], ['admin', 'Administrador: además usuarios y destinatarios']], isNew ? 'revisor' : user.rol, { id: 'u-rol' });
    var activo = h('input', { type: 'checkbox', id: 'u-activo', checked: isNew ? true : user.activo });
    var pass = h('input', { class: 'input', id: 'u-pass', type: 'password', autocomplete: 'new-password' });
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    var ok = h('button', { type: 'button', class: 'btn btn-primary' }, isNew ? 'Crear usuario' : 'Guardar cambios');
    var cancel = h('button', { type: 'button', class: 'btn' }, 'Cancelar');
    var m = CP.modal({ title: isNew ? 'Nuevo usuario' : 'Editar usuario', body: [
      h('div', { class: 'form-grid' }, field('Correo (con él inicia sesión)', email, { req: true }), field('Nombre', nombre, { req: true }),
        field('Rol', rol),
        isNew ? field('Contraseña temporal', pass, { cls: 'span-2', req: true,
          help: 'Mínimo 10 caracteres con letras y números. La persona deberá cambiarla al entrar.' }) : null,
        isNew ? null : h('label', { class: 'check span-2', for: 'u-reset' }, reset, 'Enviarle un correo para restablecer su contraseña'),
        isNew ? null : h('label', { class: 'check span-2', for: 'u-activo' }, activo, 'Usuario activo')), err],
      actions: [cancel, ok] });
    cancel.addEventListener('click', m.close);
    ok.addEventListener('click', function () {
      err.hidden = true;
      CP.busy(ok, true, 'Guardando…');
      var payload = { nombre: nombre.value.trim(), email: email.value.trim(), rol: rol.value };
      var req = isNew
        ? call('POST', '/api/admin/usuarios', Object.assign(payload, { password: pass.value }))
        : call('PUT', '/api/admin/usuarios/' + user.id, Object.assign(payload, { activo: activo.checked, restablecer: reset.checked }));
      req.then(function () { m.close(); CP.toast(isNew ? 'Usuario creado.' : 'Usuario actualizado.', 'ok'); onDone(); })
        .catch(function (e) { CP.busy(ok, false); if (!e.handled) { err.textContent = e.message; err.hidden = false; } });
    });
  }

  function showUsers() {
    shell('usuarios');
    var box = h('div', null, loading());
    var load = function () {
      call('GET', '/api/admin/usuarios').then(function (res) {
        var rows = res.items.map(function (u) {
          var edit = h('button', { type: 'button', class: 'link-btn' }, 'Editar');
          edit.addEventListener('click', function () { userModal(u, load); });
          return h('tr', null, h('td', { class: 'cell-strong' }, u.usuario), h('td', null, u.nombre), h('td', null, u.email || '—'),
            h('td', null, u.rol === 'admin' ? 'Administrador' : 'Revisor'),
            h('td', null, u.activo ? CP.pill('ok', 'Activo') : CP.pill('plain', 'Inactivo'), u.debe_cambiar ? h('div', { class: 'cell-sub' }, 'Debe cambiar contraseña') : null),
            h('td', { class: 'nowrap' }, u.ultimo_acceso ? CP.fmtDateTime(u.ultimo_acceso) : 'Nunca'), h('td', null, edit));
        });
        mount(box, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, ['Usuario', 'Nombre', 'Correo', 'Rol', 'Estado', 'Último acceso', ''].map(function (t) { return h('th', { scope: 'col' }, t); }))),
          h('tbody', null, rows))));
      }).catch(fail);
    };
    var add = h('button', { type: 'button', class: 'btn btn-dark' }, 'Nuevo usuario');
    add.addEventListener('click', function () { userModal(null, load); });
    mount(content, pageHead('Usuarios', add),
      h('p', { class: 'muted', style: { maxWidth: '75ch' } }, 'Cada persona entra con su propio usuario; el historial del expediente registra quién aprobó, rechazó o solicitó correcciones.'),
      box);
    load();
    focusHead();
  }

  /* ------------------------------------------------------------------ mi cuenta / cambio de contraseña */
  function showPassword(forced) {
    var target;
    if (forced) {
      target = h('main', { class: 'login-wrap', id: 'content', tabindex: '-1' });
      mount(app, target);
    } else {
      target = shell('cuenta');
    }
    var actual = h('input', { class: 'input', id: 'p-actual', type: 'password', autocomplete: 'current-password' });
    var nueva = h('input', { class: 'input', id: 'p-nueva', type: 'password', autocomplete: 'new-password' });
    var repite = h('input', { class: 'input', id: 'p-repite', type: 'password', autocomplete: 'new-password' });
    var err = h('p', { class: 'error', role: 'alert', hidden: true });
    var btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Cambiar contraseña');
    var form = h('form', { novalidate: true }, field('Contraseña actual', actual),
      field('Nueva contraseña', nueva, { help: 'Mínimo 10 caracteres, con letras y números.' }), field('Repite la nueva contraseña', repite), err, btn);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.hidden = true;
      if (nueva.value !== repite.value) { err.textContent = 'Las contraseñas nuevas no coinciden.'; err.hidden = false; return; }
      CP.busy(btn, true, 'Guardando…');
      call('POST', '/api/admin/cuenta/password', { actual: actual.value, nueva: nueva.value }).then(function () {
        CP.toast('Contraseña actualizada.', 'ok');
        me.debe_cambiar = false;
        if (forced) { renderUserMenu(); if (!location.hash || location.hash === '#/cuenta') history.replaceState(null, '', appHashUrl('#/proveedores')); route(); }
        else { CP.busy(btn, false); actual.value = nueva.value = repite.value = ''; }
      }).catch(function (e) { CP.busy(btn, false); if (!e.handled) { err.textContent = e.message; err.hidden = false; } });
    });
    if (forced) {
      mount(target, h('section', { class: 'panel login-card', 'aria-labelledby': 'pw-title' },
        h('h1', { id: 'pw-title', tabindex: '-1' }, 'Cambia tu contraseña'),
        h('p', { class: 'muted' }, 'Por seguridad debes definir una contraseña personal antes de continuar.'), form));
      actual.focus();
      return;
    }
    mount(target, pageHead('Mi cuenta'), h('div', { class: 'two-col' },
      h('section', { class: 'panel panel-pad' }, h('h2', { class: 'section-title' }, 'Datos'),
        h('dl', { class: 'kv' }, h('dt', null, 'Usuario'), h('dd', null, me.usuario), h('dt', null, 'Nombre'), h('dd', null, me.nombre),
          h('dt', null, 'Correo'), h('dd', null, me.email || '—'), h('dt', null, 'Rol'), h('dd', null, me.rol === 'admin' ? 'Administrador' : 'Revisor'))),
      h('section', { class: 'panel panel-pad login-card', style: { width: '100%' } }, h('h2', { class: 'section-title' }, 'Cambiar contraseña'), form)));
    focusHead();
  }

  /* ------------------------------------------------------------------ sistema */
  function showSystem() {
    shell('sistema');
    mount(content, pageHead('Sistema'), loading());
    call('GET', '/api/admin/sistema').then(function (s) {
      var pending = [];
      if (!s.correo.configurado) pending.push('Correo: completa los datos de EmailJS en js/config.js. Mientras tanto los avisos quedan registrados con error y se pueden reintentar después.');
      s.logos.forEach(function (l) {
        if (l.provisional) pending.push('Logotipo ' + l.nombre + ': se usa una versión provisional. Copia ' + l.archivo_sugerido + ' en app/static/brand/.');
        else if (!l.instalado) pending.push('Logotipo ' + l.nombre + ': no instalado. Copia ' + l.archivo_sugerido + ' en app/static/brand/.');
      });
      if (!s.privacidad_url) pending.push('Aviso de privacidad (opcional): agrega privacyUrl en js/config.js para enlazarlo en el consentimiento del portal.');
      if (/^http:\/\/(localhost|127\.)/.test(s.base_url) || s.base_url.indexOf('https://') !== 0) pending.push('Dirección pública: BASE_URL es ' + s.base_url + '. Publica el servicio con dominio y HTTPS y actualiza BASE_URL (se usa en los enlaces de correos y del Excel).');
      if (!s.ocr.ocr_listo) pending.push('Lectura de documentos: Apps Script no incluye OCR gratuito; todas las fechas y vigencias se revisan manualmente (no se simula lectura automática).');
      var box = function (title, rows, extra) {
        return h('section', { class: 'panel' }, h('h2', null, title), h('dl', { class: 'kv' }, rows.map(function (r) { return [h('dt', null, r[0]), h('dd', null, r[1])]; })), extra || null);
      };
      var test = null;
      if (isAdmin()) {
        var to = h('input', { class: 'input', type: 'email', id: 's-test', value: me.email || '', placeholder: 'correo@cesantoni.com.mx' });
        var send = h('button', { type: 'button', class: 'btn btn-sm' }, 'Enviar correo de prueba');
        send.addEventListener('click', function () {
          CP.busy(send, true, 'Enviando…');
          call('POST', '/api/admin/sistema/correo-prueba', { email: to.value.trim() }).then(function (r) {
            CP.busy(send, false);
            CP.toast(r.estado === 'duplicado' ? 'Ya se envió esta prueba hace unos minutos.' : 'Correo de prueba enviado. Revisa la bandeja de entrada y la sección Correos.', 'ok');
          }).catch(function (e) { CP.busy(send, false); fail(e); });
        });
        test = h('div', { style: { marginTop: '14px', display: 'grid', gap: '8px' } }, field('Correo de prueba', to), h('div', null, send));
        var backup = h('button', { type: 'button', class: 'btn btn-dark' }, 'Descargar respaldo (JSON)');
        backup.addEventListener('click', function () {
          CP.busy(backup, true, 'Preparando…');
          call('GET', '/api/admin/sistema/respaldo').then(function (data) {
            CP.busy(backup, false);
            CP.saveBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'Respaldo_Proveedores_CESANTONI_' + new Date().toISOString().slice(0, 10) + '.json');
          }).catch(function (e) { CP.busy(backup, false); fail(e); });
        });
      }
      mount(content, pageHead('Sistema', isAdmin() ? backup : null),
        pending.length ? h('div', { class: 'notice notice-warn', style: { marginBottom: '18px' } }, h('h3', null, 'Pendientes de configuración'),
          h('ul', null, pending.map(function (t) { return h('li', null, t); })))
          : h('div', { class: 'notice notice-ok', style: { marginBottom: '18px' } }, h('p', null, 'Configuración completa.')),
        h('div', { class: 'status-list' },
          box('Correo', [['Servicio', s.correo.configurado ? ({ graph: 'Microsoft Graph', mailapp: 'Google Apps Script MailApp', emailjs: 'EmailJS' }[s.correo.backend] || 'SMTP') : 'Sin configurar'],
            ['Remitente', s.correo.remitente || '—'], ['Servidor', s.correo.servidor || '—']], test),
          box('Lectura de documentos', [['Tesseract OCR', s.ocr.tesseract || 'No instalado'], ['Idiomas', (s.ocr.idiomas || []).join(', ') || '—'],
            ['Texto de PDF', s.ocr.pdftotext ? 'Disponible' : 'No disponible'], ['PDF escaneados', s.ocr.pdftoppm ? 'Disponible' : 'No disponible']]),
          box('Reglas de validación', [['Antigüedad máxima', s.reglas.antiguedad_meses + ' meses'], ['Aviso de vencimiento', s.reglas.aviso_vencimiento_dias + ' días'],
            ['Confianza OCR mínima', s.reglas.confianza_ocr_minima + '%'], ['Tamaño máximo', s.reglas.max_archivo_mb + ' MB'],
            ['Fecha del servidor', CP.fmtYmd(s.fecha_servidor) + ' (' + s.zona_horaria + ')']]),
          box('Logotipos', s.logos.map(function (l) {
            return [l.nombre, (l.instalado ? 'Instalado: ' + l.archivo : (l.provisional ? 'Provisional: ' + l.archivo : 'No instalado')) + (l.dimensiones ? ' (' + l.dimensiones + ')' : '')];
          })),
          box('Almacenamiento', [['Carpeta de datos', s.almacenamiento.directorio], ['Base de datos', typeof s.almacenamiento.base_datos_mb === 'number' ? s.almacenamiento.base_datos_mb + ' MB' : s.almacenamiento.base_datos_mb],
            ['Documentos', s.almacenamiento.documentos_mb + ' MB']]),
          box('Registros', ORDER_ESTADOS.map(function (k) { return [s.estados[k], String(s.totales[k] || 0)]; })),
          box('Acceso', [['Dirección pública', s.base_url], ['Cookies seguras (HTTPS)', s.cookies_seguras ? 'Sí' : 'No'],
            ['Aviso de privacidad', s.privacidad_url || 'Sin definir'], ['Versión', s.version]])));
      focusHead();
    }).catch(fail);
  }

  CP.ready.then(init);
})();
