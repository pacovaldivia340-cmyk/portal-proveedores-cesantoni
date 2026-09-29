/* Portal del proveedor. */
import { start, configured, friendly, AppError } from '../core/firebase.js?v=12';
import { PASOS, DOCS, ACCEPT, ACCEPT_ATTR, MAX_MB, ESTADOS, REVISION, CENTROAMERICA, TODA, requeridos, validar, visible, aplica } from '../core/catalog.js?v=12';
import * as P from '../core/proveedor.js?v=12';
import { h, mount, icon, logos, tag, toast, busy, modal, fecha, fechaHora, hora, tamano, lista, plural, debounce, copy, fileToB64, comprimirImagen, b64ToBlob, saveBlob, fatal } from '../core/ui.js?v=12';
import { fb, auth, db, COL, ref, col, getAll } from '../core/firebase.js?v=12';

const root = document.getElementById('app');
const PASOS_UI = [...PASOS.map((p) => ({ id: p.id, t: p.titulo, s: p.sub })), { id: 'documentos', t: 'Documentos', s: 'PDF o imagen' }, { id: 'revision', t: 'Enviar', s: 'Revisa y envía' }];
const PASO_ICON = { contacto: 'user', empresa: 'building', operacion: 'truck', documentos: 'doc', revision: 'send' };
const TITULO_ICON = PASO_ICON;
/* Íconos de las opciones de selección. */
const OPC_ICON = {
  servicios: ['truck', 'boxes', 'pin', 'globe', 'swap', 'send', 'warehouse', 'layers'],
  unidades: ['truck', 'truck', 'layers', 'truck', 'truck', 'truck', 'layers'],
  monitoreo: ['radar', 'clock'],
  gps: ['sat', 'x'],
  fw_modalidades: ['globe', 'send', 'truck', 'swap', 'layers'],
  man_horario: ['radar', 'clock', 'cal']
};
const DRAFT = 'cp_borrador';
let prov = null, docs = [], errores = {}, actual = '';
const guard = { dirty: false, vuelo: null, otra: false, cambiados: {}, seq: 0, texto: 'Todo guardado', mal: false, el: null };
let borrador = (() => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); } catch (e) { return {}; } })();
borrador.datos = borrador.datos || {};

/* ------------------------------------------------------------ arranque */
async function init() {
  mount(document.getElementById('brand'), logos('#inicio'));
  if (!configured) return fatal(root, 'La plataforma aún no está conectada', 'Falta la configuración de Firebase en js/config.js.');
  try {
    await start('portal');
    prov = await P.sesion();
    if (prov) { docs = await P.documentos(prov.id); errores = validar(prov.datos || {}); }
  } catch (e) { return fatal(root, 'No fue posible cargar el registro', friendly(e).message); }
  window.addEventListener('hashchange', ruta);
  window.addEventListener('pagehide', () => { if (guard.dirty) guardar(); });
  ruta();
}

function ir(pantalla) { if (location.hash === '#' + pantalla) ruta(); else location.hash = pantalla; }
function inicial() {
  if (!prov) return 'inicio';
  if (!['captura'].includes(prov.estado)) return 'estado';
  return PASOS_UI.some((p) => p.id === prov.paso) ? prov.paso : 'empresa';
}
function ruta() {
  const h0 = location.hash.replace(/^#\/?/, '');
  if (!prov) return h0 === 'contacto' ? asistente('contacto') : portada();
  if (h0 === 'estado' && prov.estado !== 'captura') return estado();
  if (PASOS_UI.some((p) => p.id === h0) && h0 !== 'contacto' && prov.estado === 'captura') return asistente(h0);
  if (['empresa', 'operacion'].includes(h0) && prov.estado === 'correccion') return asistente(h0);
  const d = inicial();
  history.replaceState(null, '', '#' + d);
  return d === 'estado' ? estado() : asistente(d);
}
function barraSuperior() {
  const box = document.getElementById('top');
  if (!prov) { box.replaceChildren(); return; }
  mount(box, h('div', { class: 'who' }, h('span', { class: 'muted' }, 'Folio'), h('strong', { class: 'folio' }, prov.folio)),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: salir }, 'Salir'));
}
function enfocar(el) { const t = el || root.querySelector('h1'); if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } window.scrollTo(0, 0); }

/* ------------------------------------------------------------ portada */
function portada() {
  actual = 'inicio'; barraSuperior();
  const req = DOCS.map((d) => h('li', null, h('span', null, d.l, d.condicional ? h('span', { class: 'muted' }, ' · si operas en Centroamérica') : null),
    tag(d.regla === 'antiguedad' ? 'accent' : 'info', d.regla === 'antiguedad' ? 'Máx. 3 meses' : 'Vigente')));
  mount(root, h('div', { class: 'portal-hero' },
    h('section', null,
      h('span', { class: 'eyebrow' }, 'Red de transporte · CESANTONI'),
      h('h1', { class: 'hero-title' }, 'Alta de proveedores de transporte'),
      h('p', { class: 'hero-lead' }, 'Registra tu empresa, sube tus documentos y sigue tu revisión en línea. Tu avance se guarda solo: puedes pausar y continuar cuando quieras.'),
      h('div', { class: 'steps-mini' },
        h('div', null, h('b', null, '01'), h('span', null, 'Datos de tu empresa')),
        h('div', null, h('b', null, '02'), h('span', null, 'Documentos en PDF o foto')),
        h('div', null, h('b', null, '03'), h('span', null, 'Revisión y alta'))),
      h('div', { class: 'card card-pad' }, h('h2', { style: { fontSize: '16px', marginBottom: '12px' } }, 'Documentos que te pediremos'),
        h('ul', { class: 'doclist' }, req),
        h('p', { class: 'small muted', style: { margin: '12px 0 0' } }, 'PDF, JPG, PNG o WEBP de hasta ' + MAX_MB + ' MB. Operación nacional y cobertura en Centroamérica: ' + CENTROAMERICA.join(', ') + '.'))),
    h('aside', { class: 'access' }, accesos())));
  enfocar();
}

function accesos() {
  const card = h('div', { class: 'card card-pad' });
  const tabs = [['nuevo', 'Nuevo registro'], ['continuar', 'Continuar'], ['olvide', 'Olvidé mi clave']];
  let activa = 'nuevo';
  const barra = h('div', { class: 'tabs', role: 'tablist' });
  const cuerpo = h('div');
  function pintar() {
    mount(barra, tabs.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === activa), onclick: () => { activa = k; pintar(); } }, l)));
    if (activa === 'nuevo') {
      mount(cuerpo, h('h2', { style: { fontSize: '22px', marginBottom: '8px' } }, 'Empieza tu registro'),
        h('p', { class: 'muted' }, 'Primero tus datos de contacto. Al terminar ese paso recibes tu folio y una clave para continuar desde cualquier dispositivo.'),
        h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => ir('contacto') }, 'Iniciar registro'));
    } else if (activa === 'continuar') {
      const folio = h('input', { class: 'input', id: 'c-folio', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'PROV-0001' });
      const clave = h('input', { class: 'input', id: 'c-clave', autocomplete: 'off', placeholder: 'XXXX-XXXX' });
      const err = h('p', { class: 'err', role: 'alert', hidden: true });
      const btn = h('button', { type: 'submit', class: 'btn btn-dark btn-block' }, 'Entrar');
      const form = h('form', { class: 'stack', novalidate: true }, fieldOf('Folio', folio), fieldOf('Clave de acceso', clave), err, btn);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault(); err.hidden = true;
        if (!folio.value.trim() || !clave.value.trim()) { err.textContent = 'Escribe tu folio y tu clave.'; err.hidden = false; return; }
        busy(btn, true, 'Entrando…');
        try { prov = await P.entrar(folio.value, clave.value); docs = await P.documentos(prov.id); errores = validar(prov.datos || {}); ir(inicial()); }
        catch (e) { busy(btn, false); err.textContent = friendly(e).message; err.hidden = false; }
      });
      mount(cuerpo, h('h2', { style: { fontSize: '22px', marginBottom: '12px' } }, 'Continuar mi registro'), form);
    } else {
      const folio = h('input', { class: 'input', id: 'o-folio', autocomplete: 'off', placeholder: 'PROV-0001' });
      const correo = h('input', { class: 'input', id: 'o-correo', type: 'email', autocomplete: 'email', placeholder: 'nombre@empresa.com' });
      const msg = h('p', { class: 'small', role: 'status' });
      const btn = h('button', { type: 'submit', class: 'btn btn-block' }, 'Enviarme el correo');
      const form = h('form', { class: 'stack', novalidate: true }, fieldOf('Folio', folio), fieldOf('Correo registrado', correo), btn, msg);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!folio.value.trim() || !correo.value.trim()) { msg.textContent = 'Escribe tu folio y tu correo.'; return; }
        busy(btn, true, 'Enviando…');
        try { msg.textContent = await P.recuperar(folio.value, correo.value); } catch (e) { msg.textContent = friendly(e).message; }
        busy(btn, false);
      });
      mount(cuerpo, h('h2', { style: { fontSize: '22px', marginBottom: '8px' } }, 'Recuperar mi clave'),
        h('p', { class: 'muted' }, 'Te enviaremos un correo para crear una nueva clave. Después entra con tu folio y esa clave.'), form);
    }
  }
  pintar();
  card.append(barra, cuerpo);
  return card;
}
function fieldOf(l, c) { return h('div', { class: 'field' }, h('label', { for: c.id }, l), c); }

/* ------------------------------------------------------------ asistente */
function asistente(paso) {
  if (actual !== paso && guard.dirty) guardar();
  actual = paso; barraSuperior();
  const card = h('section', { class: 'card card-pad step-card', 'aria-labelledby': 'paso-titulo' });
  const barra = h('div', { class: 'actionbar-inner' });
  if (PASOS.some((p) => p.id === paso)) pasoDatos(card, barra, paso);
  else if (paso === 'documentos') pasoDocumentos(card, barra);
  else pasoEnvio(card, barra);
  mount(root, h('div', { class: 'wizard' }, lateral(paso), h('div', null, card, h('div', { class: 'actionbar' }, barra))));
  enfocar(document.getElementById('paso-titulo'));
}

function lateral(paso) {
  const idx = PASOS_UI.findIndex((p) => p.id === paso);
  const falt = prov ? new Set(P.pendientes(prov, docs).map((f) => f.paso)) : new Set();
  const nav = h('nav', { class: 'stepper', 'aria-label': 'Pasos del registro' });
  PASOS_UI.forEach((p, i) => {
    const cls = [i < idx && !falt.has(p.id) ? 'done' : '', i === idx ? 'current' : '', i < idx && falt.has(p.id) ? 'flag' : ''].join(' ').trim();
    nav.appendChild(h('button', { type: 'button', class: cls || null, disabled: !prov && i > 0, 'aria-current': i === idx ? 'step' : null,
      onclick: () => { if (p.id !== 'contacto' || !prov) ir(p.id); } },
      h('span', { class: 'dot' }, i < idx && !falt.has(p.id) ? icon('check') : icon(PASO_ICON[p.id] || 'doc')), h('span', null, h('span', { class: 't' }, p.t), h('br'), h('span', { class: 's' }, p.s))));
  });
  if (prov) {
    guard.el = h('div', { class: 'save' + (guard.mal ? ' bad' : ''), 'aria-live': 'polite' }, guard.texto);
    const nueva = h('button', { type: 'button', class: 'folio-key' }, icon('key'), 'Generar nueva clave');
    nueva.addEventListener('click', async () => {
      if (!confirm('Tu clave actual dejará de funcionar. ¿Generar una nueva?')) return;
      try { await credenciales(await P.nuevaClave(prov), false); } catch (e) { toast(friendly(e).message, 'bad'); }
    });
    nav.appendChild(h('div', { class: 'folio-box' }, h('div', { class: 'k' }, icon('flag'), 'Tu folio'), h('div', { class: 'v' }, prov.folio), guard.el, nueva));
  }
  return nav;
}

function encabezado(id, titulo) {
  const n = PASOS_UI.findIndex((x) => x.id === id) + 1;
  return h('div', { class: 'step-head' }, h('span', { class: 'step-ico' }, icon(TITULO_ICON[id] || 'doc')),
    h('div', null, h('div', { class: 'step-kicker' }, 'Paso ' + n + ' de ' + PASOS_UI.length), h('h1', { id: 'paso-titulo' }, titulo)));
}

function valor(k) { return prov ? (prov.datos || {})[k] : borrador.datos[k]; }
function errorDe(pasoId, k) {
  if (!prov) return (borrador.errores || {})[k];
  if (guard.cambiados[k]) return '';
  return (errores[pasoId] || {})[k];
}
const tocados = {};
let mostrarTodo = {};

function datosActuales() { return prov ? prov.datos || {} : borrador.datos; }
function control(c, pasoId) {
  const el = controlBase(c, pasoId);
  if (c.si && !visible(c, datosActuales())) el.hidden = true;
  return el;
}
/* Muestra u oculta flota, forwarder, almacenes y maniobras según los servicios marcados. */
function refrescarVisibles(pasoId) {
  const p = PASOS.find((x) => x.id === pasoId), d = datosActuales();
  if (!p) return;
  p.campos.forEach((c) => { if (!c.si) return; const w = document.getElementById('w-' + c.k); if (w) w.hidden = !visible(c, d); });
}

function controlBase(c, pasoId) {
  if (c.t === 'sec') {
    return h('div', { class: 'span-2 sec-title', id: 'w-' + c.k }, h('span', { class: 'sec-ico' }, icon(c.icon || 'doc')),
      h('div', null, h('h2', null, c.l), c.s ? h('p', null, c.s) : null));
  }
  const v = valor(c.k), e = errorDe(pasoId, c.k), ver = e && (mostrarTodo[pasoId] || tocados[c.k]);
  const err = h('p', { class: 'err', id: 'e-' + c.k, hidden: !ver }, ver ? e : '');
  const help = c.help ? h('p', { class: 'help', id: 'h-' + c.k }, c.help) : null;
  const req = c.req ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null;
  const desc = [c.help ? 'h-' + c.k : '', 'e-' + c.k].filter(Boolean).join(' ');
  if (c.t === 'multi' || c.t === 'radio') {
    const tipo = c.k === 'servicios' ? 'tiles-lg' : ['cobertura', 'centroamerica', 'fw_aduanas'].includes(c.k) ? 'tiles-sm' : 'tiles-md';
    const grupo = h('div', { class: 'tiles ' + tipo + (c.t === 'radio' ? ' is-radio' : '') });
    const cuenta = c.t === 'multi' ? h('span', { class: 'count' }) : null;
    const contar = () => { if (!cuenta) return; const n = grupo.querySelectorAll('input:checked').length; cuenta.textContent = n ? n + (n === 1 ? ' seleccionado' : ' seleccionados') : ''; };
    c.op.forEach((o, i) => {
      const inp = h('input', { type: c.t === 'multi' ? 'checkbox' : 'radio', name: c.k, value: o, id: 'f-' + c.k + '-' + i,
        checked: c.t === 'multi' ? (v || []).includes(o) : v === o });
      inp.addEventListener('change', () => {
        tocados[c.k] = true;
        if (c.t === 'radio') return cambiar(c.k, o, pasoId);
        let arr = Array.from(grupo.querySelectorAll('input:checked')).map((x) => x.value);
        if (c.k === 'cobertura') {
          if (o === TODA && inp.checked) arr = [TODA];
          else if (inp.checked) arr = arr.filter((x) => x !== TODA);
          grupo.querySelectorAll('input').forEach((x) => { x.checked = arr.includes(x.value); });
        }
        contar();
        cambiar(c.k, arr, pasoId);
      });
      const ic = o === TODA ? 'map' : c.k === 'centroamerica' ? 'globe' : c.k === 'cobertura' ? 'pin' : (OPC_ICON[c.k] || [])[i];
      grupo.appendChild(h('label', { class: 'opt' + (o === TODA ? ' all' : '') }, inp,
        h('span', { class: 'box' }, ic ? h('span', { class: 'ico' }, icon(ic)) : null, h('span', { class: 'txt' }, o), h('span', { class: 'mark' }, icon('check')))));
    });
    contar();
    return h('fieldset', { class: 'field span-2 choice' + (ver ? ' invalid' : ''), id: 'w-' + c.k, 'aria-describedby': desc },
      h('legend', { class: 'label' }, c.l, req, cuenta), help, grupo, err);
  }
  let inp;
  const base = { class: 'input', id: 'f-' + c.k, name: c.k, autocomplete: c.ac || 'off', 'aria-describedby': desc, 'aria-invalid': ver ? 'true' : null };
  if (c.t === 'select') {
    inp = h('select', base, h('option', { value: '' }, 'Selecciona…'), c.op.map((o) => h('option', { value: o }, o)));
    inp.value = v || '';
    inp.addEventListener('change', () => { tocados[c.k] = true; cambiar(c.k, inp.value, pasoId); });
  } else {
    inp = h('input', Object.assign(base, { type: c.t === 'number' ? 'number' : c.t, inputmode: c.t === 'number' ? 'numeric' : null, min: c.min, max: c.t === 'number' ? c.max : null,
      maxlength: c.t !== 'number' && c.max ? c.max : null, autocapitalize: c.k === 'rfc' ? 'characters' : null }));
    inp.value = v === undefined || v === null ? '' : String(v);
    inp.addEventListener('input', () => cambiar(c.k, inp.value, pasoId));
    inp.addEventListener('blur', () => { if (!tocados[c.k]) { tocados[c.k] = true; pintarErrores(pasoId); } });
  }
  return h('div', { class: 'field' + (c.wide ? ' span-2' : '') + (ver ? ' invalid' : ''), id: 'w-' + c.k },
    h('label', { for: inp.id }, c.l, req), inp, help, err);
}

function pintarErrores(pasoId) {
  const p = PASOS.find((x) => x.id === pasoId);
  if (!p) return;
  p.campos.forEach((c) => {
    const w = document.getElementById('w-' + c.k), er = document.getElementById('e-' + c.k);
    if (!w || !er) return;
    const e = errorDe(pasoId, c.k), ver = e && (mostrarTodo[pasoId] || tocados[c.k]);
    er.textContent = ver ? e : ''; er.hidden = !ver; w.classList.toggle('invalid', !!ver);
  });
}

function cambiar(k, v, pasoId) {
  if (k === 'servicios') setTimeout(() => refrescarVisibles(pasoId), 0);
  if (!prov) {
    borrador.datos[k] = v;
    if (borrador.errores) delete borrador.errores[k];
    try { sessionStorage.setItem(DRAFT, JSON.stringify(borrador)); } catch (e) { /* sin almacenamiento */ }
    pintarErrores(pasoId);
    return;
  }
  prov.datos = { ...(prov.datos || {}), [k]: v };
  guard.cambiados[k] = ++guard.seq;
  guard.dirty = true; estadoGuardado('Cambios sin guardar');
  pronto();
}
const pronto = debounce(() => guardar(), 800);
function estadoGuardado(t, mal) { guard.texto = t; guard.mal = !!mal; if (guard.el) { guard.el.textContent = t; guard.el.classList.toggle('bad', !!mal); } }

async function guardar() {
  if (!prov || !['captura', 'correccion'].includes(prov.estado)) return;
  pronto.cancel();
  if (guard.vuelo) { guard.otra = true; return guard.vuelo; }
  guard.dirty = false;
  const enviados = { ...guard.cambiados };
  const paso = PASOS_UI.some((p) => p.id === actual) ? actual : prov.paso;
  estadoGuardado('Guardando…');
  guard.vuelo = P.guardar(prov, prov.datos, paso).then((r) => {
    Object.keys(enviados).forEach((k) => { if (guard.cambiados[k] === enviados[k]) delete guard.cambiados[k]; });
    errores = r.errores;
    estadoGuardado('Guardado a las ' + hora(r.en));
    PASOS.forEach((p) => pintarErrores(p.id));
  }).catch((e) => {
    guard.dirty = true;
    const err = friendly(e);
    if (err.status === 401 || err.status === 403) { toast('Tu sesión terminó. Entra de nuevo con tu folio y clave.', 'bad'); prov = null; ir('inicio'); return; }
    estadoGuardado('Sin guardar: ' + err.message, true);
    setTimeout(() => { if (guard.dirty) guardar(); }, 8000);
  }).finally(() => { guard.vuelo = null; if (guard.otra) { guard.otra = false; if (guard.dirty) guardar(); } });
  return guard.vuelo;
}

function pasoDatos(card, barra, pasoId) {
  const p = PASOS.find((x) => x.id === pasoId);
  card.append(encabezado(pasoId, p.titulo), h('p', { class: 'intro' }, p.intro),
    h('div', { class: 'grid-2' }, p.campos.map((c) => control(c, pasoId))));
  const idx = PASOS_UI.findIndex((x) => x.id === pasoId);
  if (!prov) {
    const ok = h('input', { type: 'checkbox', id: 'consent', checked: !!borrador.consent });
    const errC = h('p', { class: 'err', id: 'consent-err', hidden: true }, 'Marca la casilla para continuar.');
    ok.addEventListener('change', () => { borrador.consent = ok.checked; errC.hidden = true; try { sessionStorage.setItem(DRAFT, JSON.stringify(borrador)); } catch (e) { /* nada */ } });
    const priv = (window.CP_CONFIG || {}).privacyUrl;
    card.append(h('div', { style: { marginTop: '22px' } }, h('label', { class: 'check', for: 'consent' }, ok,
      h('span', null, priv ? ['He leído el ', h('a', { href: priv, target: '_blank', rel: 'noopener' }, 'aviso de privacidad'), ' y '] : null,
        (priv ? 'otorgo' : 'Otorgo') + ' mi consentimiento expreso para que CESANTONI trate mis datos, incluidos los fiscales y bancarios, para evaluar mi registro como proveedor.')), errC));
    const go = h('button', { type: 'button', class: 'btn btn-primary' }, 'Generar mi folio');
    go.addEventListener('click', async () => {
      const e = validar(borrador.datos).contacto || {};
      borrador.errores = e; mostrarTodo.contacto = true; pintarErrores('contacto');
      errC.hidden = ok.checked;
      if (Object.keys(e).length || !ok.checked) { const f = root.querySelector('.field.invalid input, .field.invalid select'); if (f) f.focus(); else if (!ok.checked) ok.focus(); return; }
      busy(go, true, 'Generando folio…');
      try {
        const r = await P.iniciar(borrador.datos, true);
        prov = r.prov; docs = []; errores = validar(prov.datos);
        borrador = { datos: {} }; try { sessionStorage.removeItem(DRAFT); } catch (x) { /* nada */ }
        await credenciales(r.clave, true);
        ir('empresa');
      } catch (err) {
        busy(go, false);
        const fe = friendly(err);
        if (fe.errors && Object.keys(fe.errors).length) { borrador.errores = fe.errors; pintarErrores('contacto'); }
        toast(fe.message, 'bad');
      }
    });
    mount(barra, h('a', { class: 'btn btn-ghost', href: '#inicio' }, 'Cancelar'), h('span', { class: 'spacer' }), go);
    return;
  }
  const next = h('button', { type: 'button', class: 'btn btn-primary' }, 'Guardar y continuar');
  next.addEventListener('click', async () => {
    busy(next, true, 'Guardando…');
    guard.dirty = true;
    await (guard.vuelo || Promise.resolve()); await guardar();
    busy(next, false);
    if (Object.keys(errores[pasoId] || {}).length) {
      mostrarTodo[pasoId] = true; pintarErrores(pasoId);
      toast('Revisa los datos marcados.', 'bad');
      const f = root.querySelector('.field.invalid input, .field.invalid select, .field.invalid'); if (f) { f.scrollIntoView({ block: 'center' }); if (f.focus) f.focus({ preventScroll: true }); }
      return;
    }
    ir(prov.estado === 'correccion' ? 'estado' : PASOS_UI[idx + 1].id);
  });
  mount(barra, idx > 1 ? h('button', { type: 'button', class: 'btn', onclick: () => ir(PASOS_UI[idx - 1].id) }, 'Anterior') : null,
    h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, 'Se guarda automáticamente'), next);
}

/* ------------------------------------------------------------ documentos */
function tarjetaDocumento(t, alCambiar) {
  const d = t.def, a = t.actual;
  const rev = a && prov.estado !== 'captura' ? REVISION[a.revision] : null;
  const estadoTag = t.correccion ? tag('warn', 'Corrección solicitada') : a ? (rev ? tag(rev.tag, rev.l) : tag('info', 'Entregado')) : tag('', t.requerido ? 'Pendiente' : 'Opcional');
  const card = h('article', { class: 'doc-card' + (!a && t.requerido ? ' need' : '') + (t.correccion ? ' fix' : ''), id: 'doc-' + d.k });
  const resultado = h('div', { 'aria-live': 'polite' });
  const archivo = a ? h('div', { class: 'file' }, h('span', { class: 'ext' }, ACCEPT[a.mime] || 'DOC'),
    h('div', null, h('div', { class: 'nm' }, a.nombre), h('div', { class: 'cell-sub' }, tamano(a.tamano) + ' · ' + fecha(a.subido_en) + ' · versión ' + a.version))) : null;
  card.append(
    h('div', { class: 'top' }, h('div', { class: 'row' }, h('h3', null, d.l), h('span', { class: 'spacer' }), estadoTag),
      h('div', { class: 'rule' }, (d.regla === 'antiguedad' ? 'Antigüedad máxima 3 meses. ' : 'Debe estar vigente. ') + d.help)),
    h('div', { class: 'mid' },
      t.correccion ? h('div', { class: 'note note-warn', style: { marginBottom: '10px' } }, h('h3', null, 'Motivo: ' + t.correccion.motivo), t.correccion.notas ? h('p', null, t.correccion.notas) : null) : null,
      archivo || h('p', { class: 'muted', style: { margin: 0 } }, t.puede ? 'Arrastra el archivo aquí o usa el botón.' : 'Sin archivo.'), resultado));
  const bot = h('div', { class: 'bot' });
  if (a) bot.appendChild(h('button', { type: 'button', class: 'btn btn-sm', onclick: () => verPropio(a) }, 'Ver'));
  if (t.puede) {
    const inp = h('input', { type: 'file', accept: ACCEPT_ATTR, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
    const b = h('button', { type: 'button', class: 'btn btn-sm ' + (a ? '' : 'btn-dark'), 'aria-label': (a ? 'Reemplazar ' : 'Subir ') + d.l }, a ? 'Reemplazar' : 'Subir archivo');
    b.addEventListener('click', () => { inp.value = ''; inp.click(); });
    inp.addEventListener('change', () => { if (inp.files[0]) cargar(t, inp.files[0], card, resultado, b, alCambiar); });
    card.addEventListener('dragover', (ev) => { ev.preventDefault(); card.classList.add('drag'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag'));
    card.addEventListener('drop', (ev) => { ev.preventDefault(); card.classList.remove('drag'); if (ev.dataTransfer.files[0]) cargar(t, ev.dataTransfer.files[0], card, resultado, b, alCambiar); });
    bot.append(h('span', { class: 'spacer' }), b, inp);
  }
  card.appendChild(bot);
  return card;
}

async function cargar(t, file, card, resultado, btn, alCambiar) {
  if (!ACCEPT[file.type]) { mount(resultado, h('p', { class: 'err', role: 'alert' }, 'Formato no permitido. Sube PDF, JPG, PNG o WEBP.')); return; }
  const esFoto = file.type !== 'application/pdf';
  // Las fotos se optimizan antes de validar el tamaño: una foto de celular de 12 MB queda en menos de 1 MB.
  if (file.size > (esFoto ? 30 : MAX_MB) * 1048576) { mount(resultado, h('p', { class: 'err', role: 'alert' }, 'El archivo pesa ' + tamano(file.size) + '; el máximo es ' + MAX_MB + ' MB.')); return; }
  const barra = h('span');
  const estado = h('p', { class: 'small muted', style: { margin: '8px 0 6px' } }, (esFoto ? 'Optimizando ' : 'Subiendo ') + file.name + '…');
  mount(resultado, estado, h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Carga' }, barra));
  busy(btn, true, 'Subiendo…');
  try {
    if (esFoto) {
      const original = file.size;
      file = await comprimirImagen(file);
      if (file.size > MAX_MB * 1048576) throw new AppError('La imagen pesa ' + tamano(file.size) + ' aun optimizada; el máximo es ' + MAX_MB + ' MB.', 413);
      estado.textContent = 'Subiendo ' + file.name + (file.size < original ? ' (optimizada: ' + tamano(original) + ' → ' + tamano(file.size) + ')' : '') + '…';
    }
    const b64 = await fileToB64(file);
    barra.style.width = '10%';
    const r = await P.subir(prov, t.def.k, file, b64, (x) => { barra.style.width = Math.round(10 + x * 90) + '%'; });
    docs = r.docs;
    toast(r.repetido ? 'Ese mismo archivo ya estaba cargado.' : t.def.l + ': archivo guardado.', 'ok');
    alCambiar();
  } catch (e) { busy(btn, false); mount(resultado, h('p', { class: 'err', role: 'alert' }, friendly(e).message)); }
}

async function verPropio(d) {
  const m = modal({ title: d.nombre, wide: true, body: h('p', { class: 'muted' }, 'Cargando…') });
  try {
    const partes = (await getAll(col(COL.prov, prov.id, 'documentos', d.id, 'partes'))).sort((a, b) => a.id.localeCompare(b.id));
    const blob = b64ToBlob(partes.map((x) => x.d).join(''), d.mime), url = URL.createObjectURL(blob);
    const cuerpo = m.el.querySelector('.modal-body');
    mount(cuerpo, d.mime === 'application/pdf' ? h('iframe', { src: url, title: d.nombre, style: { width: '100%', height: '65vh', border: 0 } })
      : h('img', { src: url, alt: d.nombre, style: { display: 'block', margin: '0 auto', maxHeight: '65vh' } }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => saveBlob(blob, d.nombre) }, 'Descargar')));
  } catch (e) { mount(m.el.querySelector('.modal-body'), h('p', { class: 'err' }, friendly(e).message)); }
}

function pasoDocumentos(card, barra) {
  const pintar = () => {
    const tabla = P.tablero(prov, docs);
    const req = tabla.filter((t) => t.requerido), opc = tabla.filter((t) => !t.requerido);
    const n = req.filter((t) => t.actual).length;
    mount(card, encabezado('documentos', 'Documentos'),
      h('p', { class: 'intro' }, 'Sube cada documento en PDF o foto legible. El equipo de Logística revisa manualmente fechas y vigencias.'),
      h('div', { class: 'row', style: { marginBottom: '16px' } }, tag(n === req.length ? 'ok' : 'accent', n + ' de ' + req.length + ' requeridos entregados')),
      h('div', { class: 'docs-grid' }, req.map((t) => tarjetaDocumento(t, pintar))),
      opc.length ? h('p', { class: 'small muted', style: { marginTop: '16px' } }, 'Opcional: ' + opc.map((t) => t.def.l).join(', ') + '. Se vuelve obligatorio si marcas cobertura en Centroamérica.') : null);
    const s = root.querySelector('.stepper');
    if (s) s.replaceWith(lateral('documentos'));
  };
  pintar();
  mount(barra, h('button', { type: 'button', class: 'btn', onclick: () => ir('operacion') }, 'Anterior'), h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => ir('revision') }, 'Continuar'));
}

function resumen(pasoId, editar) {
  const p = PASOS.find((x) => x.id === pasoId), d = prov.datos || {};
  return h('section', { class: 'card card-pad' },
    h('div', { class: 'row', style: { marginBottom: '12px' } }, h('h2', { style: { fontSize: '16px' } }, p.titulo), h('span', { class: 'spacer' }),
      editar ? h('button', { type: 'button', class: 'link', onclick: () => ir(pasoId) }, 'Editar') : null),
    h('dl', { class: 'kv' }, p.campos.filter((c) => aplica(c, d)).filter((c) => c.req ||(d[c.k] !== undefined && d[c.k] !== '' && !(Array.isArray(d[c.k]) && !d[c.k].length)))
      .map((c) => [h('dt', null, c.l), h('dd', null, lista(d[c.k]))])));
}

function pasoEnvio(card, barra) {
  const faltan = P.pendientes(prov, docs);
  const entregados = P.tablero(prov, docs).filter((t) => t.actual);
  const aviso = h('div', { id: 'aviso-envio' }, faltan.length
    ? h('div', { class: 'note note-warn' }, h('h3', null, 'Antes de enviar'), h('ul', { style: { margin: 0, paddingLeft: '18px' } },
      faltan.map((f) => h('li', null, h('button', { type: 'button', class: 'link', onclick: () => { mostrarTodo[f.paso] = true; ir(f.paso); } }, f.texto)))))
    : h('div', { class: 'note note-ok' }, h('h3', null, 'Todo listo para enviar'), h('p', null, 'Al enviar recibirás una confirmación en ' + prov.correo + ' y el equipo de Logística recibirá una alerta para revisarlo.')));
  mount(card, encabezado('revision', 'Revisa y envía'),
    h('p', { class: 'intro' }, 'Confirma tu información. Después de enviar ya no podrás modificarla, salvo que te pidamos una corrección.'),
    aviso, h('div', { class: 'stack', style: { marginTop: '18px' } }, PASOS.map((p) => resumen(p.id, true)),
      h('section', { class: 'card card-pad' }, h('div', { class: 'row', style: { marginBottom: '12px' } }, h('h2', { style: { fontSize: '16px' } }, 'Documentos'),
        h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'link', onclick: () => ir('documentos') }, 'Editar')),
        h('dl', { class: 'kv' }, entregados.map((t) => [h('dt', null, t.def.l), h('dd', null, t.actual.nombre)])))));
  const send = h('button', { type: 'button', class: 'btn btn-primary', disabled: faltan.length > 0 }, 'Enviar registro');
  send.addEventListener('click', () => enviarRegistro(send));
  mount(barra, h('button', { type: 'button', class: 'btn', onclick: () => ir('documentos') }, 'Anterior'), h('span', { class: 'spacer' }), send);
}

async function enviarRegistro(btn) {
  busy(btn, true, 'Enviando…');
  try {
    if (guard.dirty || guard.vuelo) { await guard.vuelo; await guardar(); }
    const eraCorreccion = prov.estado === 'correccion';
    prov = await P.enviar(prov);
    toast(eraCorreccion ? 'Correcciones enviadas a revisión.' : '¡Registro enviado! Te enviamos una confirmación por correo.', 'ok');
    ir('estado');
  } catch (e) {
    busy(btn, false);
    const fe = friendly(e);
    if (fe.errors && fe.errors.lista) toast(fe.errors.lista.join(' '), 'bad'); else toast(fe.message, 'bad');
  }
}

/* ------------------------------------------------------------ estado */
function tarjetaAlerta(tipo, ico, titulo, texto, extra) {
  return h('div', { class: 'alert-card a-' + tipo }, h('div', { class: 'ico' }, icon(ico)), h('div', null, h('h3', null, titulo), h('p', null, texto)), extra || h('span'));
}

function estado() {
  actual = 'estado'; barraSuperior();
  const E = ESTADOS[prov.estado] || { l: prov.estado };
  const pasos = [['Enviado', ['enviado', 'revision', 'correccion', 'aprobado', 'rechazado']], ['En revisión', ['revision', 'correccion', 'aprobado', 'rechazado']],
    ['Correcciones', prov.envios > 1 || prov.estado === 'correccion' ? ['correccion', 'revision', 'aprobado', 'rechazado', 'enviado'] : []], ['Resolución', ['aprobado', 'rechazado']]];
  const alertasEl = [];
  const tabla = P.tablero(prov, docs);
  if (prov.estado === 'correccion') {
    const fix = tabla.filter((t) => t.correccion || (t.requerido && !t.actual));
    alertasEl.push(tarjetaAlerta('warn', 'alert', 'Necesitamos ' + plural(fix.length, 'corrección', 'correcciones'),
      'Sustituye los documentos marcados; los demás se conservan. Después pulsa «Enviar correcciones».'));
    const zona = h('div', { class: 'docs-grid' });
    const pintarFix = () => { mount(zona, P.tablero(prov, docs).filter((t) => t.correccion || (t.requerido && !t.actual) || (t.puede && t.actual && t.actual.revision === 'pendiente' && t.versiones.length > 1)).map((t) => tarjetaDocumento(t, () => { pintarFix(); pintarBoton(); }))); };
    const boton = h('div');
    const pintarBoton = () => {
      const faltan = P.pendientes(prov, docs);
      const b = h('button', { type: 'button', class: 'btn btn-primary', disabled: faltan.length > 0 }, 'Enviar correcciones');
      b.addEventListener('click', () => enviarRegistro(b));
      mount(boton, h('div', { class: 'row', style: { marginTop: '16px' } }, h('span', { class: 'small muted' }, faltan.length ? 'Sube todos los documentos marcados para habilitar el envío.' : 'Listo: envía tus correcciones.'), h('span', { class: 'spacer' }), b));
    };
    pintarFix(); pintarBoton();
    alertasEl.push(h('section', { class: 'card card-pad', 'aria-labelledby': 'fix-t' }, h('h2', { id: 'fix-t', style: { fontSize: '18px', marginBottom: '14px' } }, 'Documentos por corregir'), zona, boton,
      h('p', { class: 'small muted', style: { marginTop: '12px' } }, '¿También debes actualizar datos? ', h('button', { type: 'button', class: 'link', onclick: () => ir('empresa') }, 'Editar datos de la empresa'))));
  } else if (prov.estado === 'aprobado') {
    alertasEl.push(tarjetaAlerta('ok', 'check', '¡Tu registro fue aprobado!', 'Tu empresa quedó dada de alta como proveedor. El equipo de Logística de CESANTONI se pondrá en contacto contigo.'));
  } else if (prov.estado === 'rechazado') {
    alertasEl.push(tarjetaAlerta('bad', 'alert', 'Tu registro no fue aprobado', 'Si tienes dudas sobre la resolución, comunícate con tu contacto de Logística de CESANTONI.'));
  } else {
    alertasEl.push(tarjetaAlerta('violet', 'clock', 'Tu expediente está en revisión', 'Te avisaremos a ' + prov.correo + ' si necesitamos una corrección o cuando haya una resolución.'));
  }
  mount(root, h('div', { class: 'page' },
    h('section', { class: 'status-hero', 'aria-labelledby': 'st-t' },
      h('div', null, h('div', { class: 'small', style: { color: '#A9B4C4', fontWeight: 700, letterSpacing: '1px' } }, 'FOLIO'), h('div', { class: 'fol' }, prov.folio)),
      h('div', null, tag(E.tag || '', E.l), h('h1', { id: 'st-t' }, prov.razon_social),
        h('p', null, 'Enviado el ' + fechaHora(prov.enviado_en) + (prov.envios > 1 ? ' · último envío ' + fechaHora(prov.reenviado_en) : '')),
        h('div', { class: 'track' }, pasos.map(([l, on]) => h('div', { class: on.includes(prov.estado) ? 'on' : null }, l))))),
    alertasEl,
    h('div', { class: 'grid-2' },
      h('section', { class: 'card card-pad' }, h('h2', { style: { fontSize: '16px', marginBottom: '12px' } }, 'Documentos entregados'),
        h('dl', { class: 'kv' }, tabla.filter((t) => t.actual).map((t) => [h('dt', null, t.def.l), h('dd', null, t.actual.nombre, ' ', prov.estado !== 'enviado' ? tag(REVISION[t.actual.revision].tag, REVISION[t.actual.revision].l) : null)]))),
      h('div', { class: 'stack' }, PASOS.map((p) => resumen(p.id, false))))));
  enfocar(document.getElementById('st-t'));
}

/* ------------------------------------------------------------ credenciales y salida */
function credenciales(clave, primera) {
  return new Promise((resolve) => {
    const ok = h('button', { type: 'button', class: 'btn btn-primary', autofocus: true }, 'Ya guardé mis datos');
    const cp = h('button', { type: 'button', class: 'btn' }, 'Copiar');
    cp.addEventListener('click', () => copy('Folio: ' + prov.folio + '\nClave de acceso: ' + clave).then(() => toast('Copiado.', 'ok'), () => toast('No se pudo copiar; anótalos.', 'bad')));
    const m = modal({ title: primera ? 'Tu folio está listo' : 'Nueva clave de acceso', locked: true, onClose: resolve, actions: [cp, ok],
      body: [h('p', null, primera ? 'Guarda estos datos: con ellos continúas desde cualquier dispositivo.' : 'La clave anterior dejó de funcionar.'),
        h('dl', { class: 'credential' }, h('dt', null, 'Folio'), h('dd', null, prov.folio), h('dt', null, 'Clave'), h('dd', null, clave)),
        primera ? h('p', { class: 'small muted' }, 'También te los enviamos a ' + prov.correo + '.') : null] });
    ok.addEventListener('click', m.close);
  });
}

async function salir() {
  if (guard.dirty) await guardar();
  await P.salir().catch(() => null);
  prov = null; docs = []; errores = {};
  history.replaceState(null, '', location.pathname);
  portada();
}

init();
