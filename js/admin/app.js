/* Panel del equipo de Logística. */
import { start, configured, friendly, CFG } from '../core/firebase.js?v=8';
import { PASOS, DOCS, ESTADOS, REVISION, MOTIVOS, PAISES, CENTROAMERICA, SERVICIOS, ALERTAS, ACCEPT, TODA, docLabel, requeridos, visible, aplica } from '../core/catalog.js?v=8';
import * as E from '../core/equipo.js?v=8';
import { TIPOS, vistaPrevia, mailConfigured } from '../core/mail.js?v=8';
import { h, mount, icon, logos, tag, toast, busy, modal, field, select, fecha, fechaHora, dia, diasDesde, tamano, lista, plural, debounce, b64ToBlob, saveBlob, fatal } from '../core/ui.js?v=8';

const root = document.getElementById('app');
let yo = null, cache = { provs: null, correos: null };
const esAdmin = () => yo && yo.rol === 'admin';
const fail = (e) => toast(friendly(e).message, 'bad');
const etiquetaEstado = (s) => tag((ESTADOS[s] || {}).tag || '', (ESTADOS[s] || { l: s }).l);

/* Cada celda lleva el nombre de su columna: cuando la tabla no cabe, se muestra como tarjetas sin cortar el texto. */
function etiquetarTablas() {
  root.querySelectorAll('table.data:not([data-lbl])').forEach((t) => {
    t.setAttribute('data-lbl', '');
    const cols = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    const pinta = () => t.querySelectorAll('tbody tr').forEach((tr) => Array.from(tr.children).forEach((td, i) => {
      if (!td.hasAttribute('data-label')) td.setAttribute('data-label', cols[i] || '');
    }));
    pinta(); new MutationObserver(pinta).observe(t, { childList: true, subtree: true });
  });
}

async function init() {
  new MutationObserver(etiquetarTablas).observe(root, { childList: true, subtree: true });
  mount(document.getElementById('brand'), logos('#/tablero'));
  if (!configured) return fatal(root, 'El panel aún no está conectado', 'Falta la configuración de Firebase en js/config.js.');
  window.addEventListener('hashchange', ruta);
  try {
    await start('panel');
    yo = await E.yo();
    if (!yo && !(await E.tieneAdmin())) return primerAdmin();
  } catch (e) { return fatal(root, 'No fue posible cargar el panel', friendly(e).message); }
  yo ? despues() : login();
}

/* ------------------------------------------------------------ acceso */
function tarjetaAcceso(titulo, sub, form) {
  mount(document.getElementById('top'));
  mount(root, h('div', { class: 'login' }, h('section', { class: 'card card-pad', 'aria-labelledby': 'acc-t' },
    h('h1', { id: 'acc-t' }, titulo), h('p', { class: 'muted' }, sub), form)));
  const f = root.querySelector('input'); if (f) f.focus();
}
function primerAdmin() {
  const nombre = h('input', { class: 'input', autocomplete: 'name' }), correo = h('input', { class: 'input', type: 'email', autocomplete: 'username' });
  const c1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' }), c2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const err = h('p', { class: 'err', role: 'alert', hidden: true }), btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Crear administrador');
  const form = h('form', { class: 'stack', novalidate: true }, field('Nombre', nombre), field('Correo', correo), field('Contraseña', c1, { help: 'Mínimo 10 caracteres, con letras y números.' }), field('Repite la contraseña', c2), err, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.hidden = true;
    if (c1.value !== c2.value) { err.textContent = 'Las contraseñas no coinciden.'; err.hidden = false; return; }
    busy(btn, true, 'Creando…');
    try { yo = await E.primerAdmin({ nombre: nombre.value, correo: correo.value, clave: c1.value }); toast('Administrador creado.', 'ok'); despues(); }
    catch (e) { busy(btn, false); err.textContent = friendly(e).message; err.hidden = false; }
  });
  tarjetaAcceso('Configurar el panel', 'Primera vez: crea la cuenta del administrador principal. Después podrás invitar al resto del equipo.', form);
}
function login(expirado) {
  const correo = h('input', { class: 'input', id: 'lg-correo', type: 'email', autocomplete: 'username' });
  const clave = h('input', { class: 'input', id: 'lg-clave', type: 'password', autocomplete: 'current-password' });
  const err = h('p', { class: 'err', role: 'alert', hidden: true }), msg = h('p', { class: 'small muted', role: 'status' });
  const btn = h('button', { type: 'submit', class: 'btn btn-dark btn-block' }, 'Entrar');
  const olvido = h('button', { type: 'button', class: 'link small' }, 'Olvidé mi contraseña');
  olvido.addEventListener('click', async () => {
    if (!correo.value.trim()) { err.textContent = 'Escribe tu correo y vuelve a pulsar «Olvidé mi contraseña».'; err.hidden = false; correo.focus(); return; }
    msg.textContent = await E.recuperar(correo.value);
  });
  const form = h('form', { class: 'stack', novalidate: true }, expirado ? h('div', { class: 'note note-warn' }, h('p', null, 'Tu sesión terminó. Vuelve a entrar.')) : null,
    field('Correo', correo), field('Contraseña', clave), err, btn, h('div', null, olvido), msg);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.hidden = true; busy(btn, true, 'Entrando…');
    try { yo = await E.entrar(correo.value, clave.value); despues(); }
    catch (e) { busy(btn, false); err.textContent = friendly(e).message; err.hidden = false; clave.select(); }
  });
  tarjetaAcceso('Panel de proveedores', 'Acceso para el equipo de Logística de CESANTONI.', form);
}
function cambioObligatorio() {
  const a = h('input', { class: 'input', type: 'password', id: 'p-actual', autocomplete: 'current-password' });
  const n = h('input', { class: 'input', type: 'password', id: 'p-nueva', autocomplete: 'new-password' });
  const r = h('input', { class: 'input', type: 'password', id: 'p-repite', autocomplete: 'new-password' });
  const err = h('p', { class: 'err', role: 'alert', hidden: true }), btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Guardar contraseña');
  const form = h('form', { class: 'stack', novalidate: true }, field('Contraseña temporal', a), field('Nueva contraseña', n, { help: 'Mínimo 10 caracteres, con letras y números.' }), field('Repite la nueva contraseña', r), err, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.hidden = true;
    if (n.value !== r.value) { err.textContent = 'Las contraseñas no coinciden.'; err.hidden = false; return; }
    busy(btn, true, 'Guardando…');
    try { await E.cambiarClave(a.value, n.value); toast('Contraseña actualizada.', 'ok'); despues(); }
    catch (e) { busy(btn, false); err.textContent = friendly(e).message; err.hidden = false; }
  });
  tarjetaAcceso('Crea tu contraseña', 'Por seguridad, cambia la contraseña temporal antes de continuar.', form);
}
function despues() {
  if (yo.cambiar_clave) return cambioObligatorio();
  mount(document.getElementById('top'), h('div', { class: 'who' }, h('strong', null, yo.nombre), yo.rol === 'admin' ? 'Administrador' : 'Revisor'),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => { await E.salir(); yo = null; history.replaceState(null, '', location.pathname); login(); } }, 'Salir'));
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/tablero');
  ruta();
}

/* ------------------------------------------------------------ estructura */
const MENU = [['Operación'], ['tablero', 'Tablero', 'grid'], ['proveedores', 'Proveedores', 'list'], ['correos', 'Correos', 'mail'],
  ['Configuración'], ['destinatarios', 'Destinatarios', 'bell'], ['usuarios', 'Usuarios', 'users', true], ['sistema', 'Sistema', 'gear'], ['cuenta', 'Mi cuenta', 'key']];
let main = null;
function shell(activo) {
  const side = h('nav', { class: 'side', 'aria-label': 'Secciones' });
  MENU.forEach((m) => {
    if (m.length === 1) { side.appendChild(h('div', { class: 'grp' }, m[0])); return; }
    if (m[3] && !esAdmin()) return;
    side.appendChild(h('a', { href: '#/' + m[0], 'aria-current': activo === m[0] ? 'page' : null }, icon(m[2]), m[1], h('span', { class: 'badge', 'data-badge': m[0], hidden: true })));
  });
  main = h('main', { class: 'main', id: 'contenido', tabindex: '-1' });
  mount(root, h('div', { class: 'shell' }, side, main));
  insignias();
  return main;
}
async function insignias() {
  try {
    const provs = cache.provs || await E.proveedores();
    const n = provs.filter((p) => p.estado === 'enviado').length;
    const b = root.querySelector('[data-badge="proveedores"]'); if (b) { b.textContent = n; b.hidden = !n; }
  } catch (e) { /* sin insignias */ }
}
function cabecera(titulo, sub, ...acciones) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', { tabindex: '-1' }, titulo), sub ? h('div', { class: 'sub' }, sub) : null), h('span', { class: 'spacer' }), acciones);
}
async function ruta() {
  if (!yo) return login();
  if (yo.cambiar_clave) return cambioObligatorio();
  const [p, q] = location.hash.replace(/^#\/?/, '').split('?');
  const m = p.match(/^proveedor\/(.+)$/);
  try {
    if (m) return await expediente(m[1]);
    if (p === 'proveedores') return await listado(new URLSearchParams(q || ''));
    if (p === 'correos') return await vistaCorreos();
    if (p === 'destinatarios') return await vistaDestinatarios();
    if (p === 'usuarios' && esAdmin()) return await vistaUsuarios();
    if (p === 'sistema') return await vistaSistema();
    if (p === 'cuenta') return vistaCuenta();
    if (p !== 'tablero') history.replaceState(null, '', '#/tablero');
    return await tablero();
  } catch (e) {
    const fe = friendly(e);
    if (fe.status === 401 || fe.status === 403) { yo = null; return login(true); }
    fail(e);
  }
}
const cargando = (t) => h('p', { class: 'muted', role: 'status' }, t || 'Cargando…');

/* ------------------------------------------------------------ tablero */
async function tablero() {
  shell('tablero');
  mount(main, cabecera('Tablero', 'Resumen y alertas del registro de proveedores'), cargando());
  const [provs, correos] = await Promise.all([E.proveedores(), E.correos()]);
  cache.provs = provs; cache.correos = correos;
  const cuenta = (s) => provs.filter((p) => p.estado === s).length;
  const kpi = (v, k, c, href) => h('a', { class: 'kpi', href, style: { '--c': c, textDecoration: 'none', color: 'inherit' } }, h('div', { class: 'v' }, String(v)), h('div', { class: 'k' }, k), h('div', { class: 'bar' }));
  const A = E.alertas(provs, correos);
  const fila = (x, extra) => h('li', null, h('a', { class: 'folio', href: '#/proveedor/' + x.id, style: { fontSize: '15px' } }, x.folio), h('span', { class: 'grow' }, x.empresa), extra);
  const bloque = (tipo, ico, titulo, texto, items, pintarFila, vacio) => h('div', { class: 'alert-card a-' + tipo },
    h('div', { class: 'ico' }, icon(ico)), h('div', null, h('h3', null, titulo), h('p', null, items.length ? texto : vacio)), h('div', { class: 'count' }, String(items.length)),
    items.length ? h('ul', { class: 'alert-list' }, items.slice(0, 6).map(pintarFila)) : null);
  mount(main, cabecera('Tablero', 'Resumen y alertas del registro de proveedores', h('a', { class: 'btn btn-dark', href: '#/proveedores' }, 'Ver proveedores')),
    h('div', { class: 'kpis' },
      kpi(provs.length, 'Registros totales', 'var(--ink)', '#/proveedores'),
      kpi(cuenta('captura'), 'En captura', '#9DB3CC', '#/proveedores?estado=captura'),
      kpi(cuenta('enviado') + cuenta('revision'), 'Por revisar / en revisión', 'var(--violet)', '#/proveedores?estado=enviado'),
      kpi(cuenta('correccion'), 'Con corrección', 'var(--warn)', '#/proveedores?estado=correccion'),
      kpi(cuenta('aprobado'), 'Aprobados', 'var(--ok)', '#/proveedores?estado=aprobado')),
    h('h2', { style: { fontSize: '18px', marginTop: '6px' } }, 'Alertas'),
    h('div', { class: 'stack' },
      bloque(A.revisar.some((x) => x.dias >= ALERTAS.revisarDias) ? 'bad' : 'violet', 'inbox', 'Registros completos por revisar',
        'Expedientes enviados que esperan revisión. Los de ' + ALERTAS.revisarDias + ' días o más aparecen en rojo.', A.revisar,
        (x) => fila(x, tag(x.dias >= ALERTAS.revisarDias ? 'bad' : 'violet', x.dias ? 'hace ' + plural(x.dias, 'día', 'días') : 'hoy')), 'No hay registros esperando revisión.'),
      bloque('warn', 'alert', 'Correcciones sin respuesta', 'Proveedores con corrección solicitada hace ' + ALERTAS.correccionDias + ' días o más.', A.correccion,
        (x) => fila(x, tag('warn', plural(x.dias, 'día', 'días'))), 'Ningún proveedor tiene correcciones atrasadas.'),
      bloque('accent', 'cal', 'Documentos por vencer', 'Pólizas y permisos aprobados que vencen en ' + ALERTAS.venceDias + ' días o menos.', A.vence,
        (x) => fila(x, [h('span', { class: 'small' }, x.doc), tag(x.dias < 0 ? 'bad' : 'warn', x.dias < 0 ? 'vencido ' + fecha(x.fecha + 'T12:00:00') : 'vence ' + fecha(x.fecha + 'T12:00:00'))]),
        'Sin vencimientos próximos. Captura la fecha de vencimiento al aprobar pólizas y permisos.'),
      bloque('ok', 'clock', 'Registros sin avance', 'Proveedores en captura sin cambios en ' + ALERTAS.abandonoDias + ' días o más.', A.abandono,
        (x) => fila(x, [h('span', { class: 'small muted' }, x.correo), tag('', plural(x.dias, 'día', 'días'))]), 'No hay registros abandonados.'),
      bloque('bad', 'mail', 'Correos no entregados', 'Avisos que no salieron; puedes reintentarlos desde Correos.', A.fallidos,
        (c) => h('li', null, h('span', { class: 'grow' }, c.asunto), h('span', { class: 'small muted' }, c.error.slice(0, 80)), h('a', { class: 'btn btn-sm', href: '#/correos' }, 'Ver')), 'Todos los correos se entregaron.')));
  insignias();
  main.querySelector('h1').focus({ preventScroll: true });
}

/* ------------------------------------------------------------ listado */
async function listado(params) {
  shell('proveedores');
  mount(main, cabecera('Proveedores'), cargando());
  const provs = cache.provs = await E.proveedores();
  const f = { q: params.get('q') || '', estado: params.get('estado') || '', pais: '', cobertura: '', servicio: '', desde: '', hasta: '', orden: 'reciente', pagina: 1 };
  const POR = 25;
  const cont = h('div');
  const q = h('input', { class: 'input', id: 'f-q', type: 'search', placeholder: 'Folio, empresa, RFC, contacto o correo', value: f.q });
  const pais = select([['', 'Todos los países'], ...PAISES.map((p) => [p, p])], '', { id: 'f-pais' });
  const cob = select([['', 'Cualquier cobertura'], ['nacional', 'Solo México'], ['centroamerica', 'Con Centroamérica'], ...CENTROAMERICA.map((p) => [p, 'Centroamérica: ' + p])], '', { id: 'f-cob' });
  const serv = select([['', 'Todos los servicios'], ...SERVICIOS.map((s) => [s, s])], '', { id: 'f-serv' });
  const orden = select([['reciente', 'Actividad reciente'], ['empresa', 'Empresa A–Z'], ['inicio', 'Fecha de inicio'], ['envio', 'Fecha de envío']], 'reciente', { id: 'f-orden' });
  const desde = h('input', { class: 'input', type: 'date', id: 'f-desde' }), hasta = h('input', { class: 'input', type: 'date', id: 'f-hasta' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Estado' });
  const filtrar = () => {
    const txt = f.q.toLowerCase();
    let r = provs.filter((p) => {
      const d = p.datos || {}, ca = d.centroamerica || [];
      if (txt && ![p.folio, p.razon_social, d.nombre_comercial, d.rfc, p.contacto, p.correo].join(' ').toLowerCase().includes(txt)) return false;
      if (f.pais && p.pais !== f.pais) return false;
      if (f.servicio && !(d.servicios || []).includes(f.servicio)) return false;
      if (f.cobertura === 'nacional' && ca.length) return false;
      if (f.cobertura === 'centroamerica' && !ca.length) return false;
      if (f.cobertura && !['nacional', 'centroamerica'].includes(f.cobertura) && !ca.includes(f.cobertura)) return false;
      const dd = dia(p.creado_en);
      if (f.desde && dd < f.desde) return false;
      if (f.hasta && dd > f.hasta) return false;
      return true;
    });
    const porEstado = r;
    if (f.estado) r = r.filter((p) => p.estado === f.estado);
    const cmp = { empresa: (a, b) => String(a.razon_social).localeCompare(String(b.razon_social), 'es'), inicio: (a, b) => String(b.creado_en).localeCompare(String(a.creado_en)),
      envio: (a, b) => String(b.enviado_en || '').localeCompare(String(a.enviado_en || '')) }[f.orden] || ((a, b) => String(b.actualizado_en).localeCompare(String(a.actualizado_en)));
    return { r: r.sort(cmp), porEstado };
  };
  const pintar = () => {
    const { r, porEstado } = filtrar();
    const n = (s) => porEstado.filter((p) => p.estado === s).length;
    mount(seg, [['', 'Todos', porEstado.length], ...Object.keys(ESTADOS).map((k) => [k, ESTADOS[k].l, n(k)])].map(([k, l, c]) =>
      h('button', { type: 'button', 'aria-pressed': String(f.estado === k), onclick: () => { f.estado = k; f.pagina = 1; pintar(); } }, h('b', null, String(c)), l)));
    const paginas = Math.max(1, Math.ceil(r.length / POR)); f.pagina = Math.min(f.pagina, paginas);
    const vista = r.slice((f.pagina - 1) * POR, f.pagina * POR);
    if (!r.length) { mount(cont, h('div', { class: 'card empty' }, h('h2', null, provs.length ? 'Sin resultados' : 'Aún no hay registros'), h('p', null, provs.length ? 'Ajusta los filtros.' : 'Aparecerán aquí en cuanto un proveedor genere su folio.'))); return; }
    mount(cont, h('p', { class: 'small muted', role: 'status', id: 'conteo' }, plural(r.length, 'registro', 'registros')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, ['Folio', 'Empresa', 'Estado', 'Documentos', 'Contacto', 'Cobertura', 'Responsable', 'Actualizado', ...(esAdmin() ? [''] : [])].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, vista.map((p) => {
          const rd = E.resumenDocs(p), d = p.datos || {};
          const tr = h('tr', { class: 'go', tabindex: '0' },
            h('td', null, h('a', { class: 'folio', href: '#/proveedor/' + p.id }, p.folio)),
            h('td', null, h('strong', null, p.razon_social || '—'), h('div', { class: 'cell-sub' }, [d.nombre_comercial, d.rfc].filter(Boolean).join(' · '))),
            h('td', null, etiquetaEstado(p.estado)),
            h('td', null, h('div', { class: 'meter', 'aria-hidden': 'true' }, rd.det.map((x) => h('i', { class: { falta: '', pendiente: 'up', aprobado: 'ok', correccion: 'bad', rechazado: 'bad' }[x.estado] || '', title: docLabel(x.k) }))),
              h('div', { class: 'cell-sub' }, rd.entregados + ' de ' + rd.req + (rd.aprobados ? ' · ' + rd.aprobados + ' aprobados' : ''))),
            h('td', null, p.contacto, h('div', { class: 'cell-sub' }, p.correo), h('div', { class: 'cell-sub' }, p.telefono)),
            h('td', null, p.pais, h('div', { class: 'cell-sub' }, (d.cobertura || [])[0] === TODA ? 'Toda la República' : plural((d.cobertura || []).length, 'estado', 'estados')),
              (d.centroamerica || []).length ? h('div', { class: 'cell-sub' }, 'CA: ' + d.centroamerica.join(', ')) : null),
            h('td', null, p.responsable || h('span', { class: 'muted' }, 'Sin asignar')),
            h('td', null, fecha(p.actualizado_en)),
            esAdmin() ? h('td', null, botonBorrarProveedor(p, () => ruta())) : null);
          const abrir = () => { location.hash = '#/proveedor/' + p.id; };
          tr.addEventListener('click', (ev) => { if (!ev.target.closest('a, button')) abrir(); });
          tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') abrir(); });
          return tr;
        })))),
      paginas > 1 ? h('div', { class: 'pager' }, h('span', null, 'Página ' + f.pagina + ' de ' + paginas),
        h('span', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-sm', disabled: f.pagina <= 1, onclick: () => { f.pagina--; pintar(); } }, 'Anterior'),
          h('button', { type: 'button', class: 'btn btn-sm', disabled: f.pagina >= paginas, onclick: () => { f.pagina++; pintar(); } }, 'Siguiente'))) : null);
  };
  q.addEventListener('input', debounce(() => { f.q = q.value.trim(); f.pagina = 1; pintar(); }, 250));
  [[pais, 'pais'], [cob, 'cobertura'], [serv, 'servicio'], [orden, 'orden'], [desde, 'desde'], [hasta, 'hasta']].forEach(([el, k]) => el.addEventListener('change', () => { f[k] = el.value; f.pagina = 1; pintar(); }));
  const limpiar = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { Object.assign(f, { q: '', estado: '', pais: '', cobertura: '', servicio: '', desde: '', hasta: '' }); [q, pais, cob, serv, desde, hasta].forEach((x) => { x.value = ''; }); pintar(); } }, 'Limpiar filtros');
  const exportar = h('button', { type: 'button', class: 'btn btn-dark' }, 'Exportar CSV');
  exportar.addEventListener('click', () => exportarCsv(filtrar().r));
  mount(main, cabecera('Proveedores', 'Busca, filtra y abre cada expediente', exportar),
    h('section', { class: 'card card-pad stack' }, h('div', { class: 'toolbar' }, field('Buscar', q), field('País', pais), field('Cobertura', cob), field('Servicio', serv), field('Ordenar', orden)),
      h('div', { class: 'row' }, field('Registrado desde', desde), field('Hasta', hasta), h('span', { class: 'spacer' }), limpiar), seg), cont);
  pintar();
}

/* Agrupa los campos de un paso por sección (flota, forwarder, almacenes, maniobras), solo los que aplican. */
function bloquesDatos(ps, d) {
  const out = [{ t: null, items: [] }];
  ps.campos.forEach((c) => {
    if (!visible(c, d)) return;
    if (c.t === 'sec') out.push({ t: c.l, icon: c.icon, items: [] }); else out[out.length - 1].items.push(c);
  });
  return out.filter((b) => b.items.length);
}
const EXTRA_CSV = PASOS.find((x) => x.id === 'operacion').campos.filter((c) => c.t !== 'sec' && /^(fw|alm|man)_/.test(c.k));

function exportarCsv(provs) {
  const cols = ['Folio', 'Estado', 'Resultado', 'Razón social', 'Nombre comercial', 'RFC', 'País', 'Contacto', 'Puesto', 'Correo', 'Teléfono', 'Domicilio', 'Ciudad', 'Estado (domicilio)', 'CP',
    'Servicios', 'Cobertura nacional', 'Centroamérica', 'Tipos de unidad', 'Número de unidades', 'Monitoreo', 'GPS', 'Documentos entregados', 'Documentos aprobados', 'Responsable',
    'Notas internas', 'Inicio', 'Envío', 'Actualización', ...EXTRA_CSV.map((c) => (c.k.startsWith('fw_') ? 'Forwarder: ' : c.k.startsWith('alm_') ? 'Almacenes: ' : 'Maniobras: ') + c.l)];
  const cel = (v) => { let s = String(v === null || v === undefined ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const filas = provs.map((p) => { const d = p.datos || {}, r = E.resumenDocs(p);
    return [p.folio, (ESTADOS[p.estado] || {}).l, p.resultado, p.razon_social, d.nombre_comercial, d.rfc, p.pais, p.contacto, d.puesto, p.correo, p.telefono,
      [d.calle, d.colonia].filter(Boolean).join(', '), d.ciudad, d.estado, d.cp, lista(d.servicios), lista(d.cobertura), lista(d.centroamerica), lista(d.unidades),
      d.num_unidades, d.monitoreo, d.gps, r.entregados + ' de ' + r.req, r.aprobados, p.responsable, p.notas, fechaHora(p.creado_en), fechaHora(p.enviado_en), fechaHora(p.actualizado_en),
      ...EXTRA_CSV.map((c) => (aplica(c, d) ? (Array.isArray(d[c.k]) ? d[c.k].join(', ') : d[c.k]) : ''))]; });
  const csv = '﻿' + [cols, ...filas].map((f) => f.map(cel).join(',')).join('\r\n');
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'Proveedores_CESANTONI_' + dia(new Date().toISOString()) + '.csv');
  toast(plural(filas.length, 'registro exportado', 'registros exportados') + '.', 'ok');
}

/* Borrar un registro completo (solo administradores): pide escribir el folio para confirmar. */
function botonBorrarProveedor(p, despues, conTexto) {
  return h('button', { type: 'button', class: 'btn btn-bad' + (conTexto ? '' : ' btn-sm btn-icon'), title: 'Borrar proveedor', 'aria-label': 'Borrar proveedor ' + p.folio,
    onclick: (ev) => { ev.stopPropagation(); confirmarBorrado(p, despues); } }, icon('trash'), conTexto ? 'Borrar proveedor' : null);
}
function confirmarBorrado(p, despues) {
  const inp = h('input', { class: 'input', id: 'del-folio', autocomplete: 'off', placeholder: p.folio });
  const err = h('p', { class: 'err', hidden: true }, 'El folio no coincide.');
  const cancelar = h('button', { type: 'button', class: 'btn' }, 'Cancelar');
  const borrar = h('button', { type: 'button', class: 'btn btn-bad', id: 'del-ok' }, icon('trash'), 'Borrar definitivamente');
  const m = modal({ title: 'Borrar proveedor', body: [
    h('div', { class: 'note note-bad' }, h('h3', null, p.razon_social || p.folio),
      h('p', null, 'Se borran para siempre su registro, documentos, historial y correos. El folio ' + p.folio + ' dejará de funcionar. No se puede deshacer.')),
    h('p', { class: 'small muted' }, 'Si necesitas conservarlo, descarga antes el respaldo en Sistema o el CSV.'),
    field('Escribe el folio para confirmar', inp), err], actions: [cancelar, borrar] });
  cancelar.addEventListener('click', m.close);
  borrar.addEventListener('click', async () => {
    if (inp.value.trim().toUpperCase() !== p.folio) { err.hidden = false; inp.focus(); return; }
    busy(borrar, true, 'Borrando…');
    try { await E.borrarProveedor(p); m.close(); toast('Proveedor ' + p.folio + ' borrado.', 'ok'); despues(); }
    catch (e) { busy(borrar, false); fail(e); }
  });
}

/* ------------------------------------------------------------ expediente */
async function expediente(id) {
  shell('proveedores');
  mount(main, h('a', { href: '#/proveedores', class: 'link' }, '← Proveedores'), cargando('Cargando expediente…'));
  const D = await E.detalle(id);
  const p = D.p;
  let pestana = 'documentos', docSel = null;
  const vigentes = () => D.docs.filter((d) => d.vigente);
  const cab = h('section', { class: 'card' });
  const cuerpo = h('div');
  const pintarCab = () => {
    const rd = E.resumenDocs(p), dd = p.datos || {};
    mount(cab, h('div', { class: 'dossier-head' },
      h('div', null, h('div', { class: 'folio' }, p.folio), h('div', { class: 'cell-sub' }, 'Actualizado ' + fechaHora(p.actualizado_en))),
      h('div', null, h('h1', { id: 'exp-t', tabindex: '-1' }, p.razon_social), h('div', { class: 'row', style: { marginTop: '8px' } }, etiquetaEstado(p.estado),
        tag(rd.entregados === rd.req ? 'ok' : '', 'Documentos ' + rd.entregados + '/' + rd.req), rd.aprobados ? tag('ok', rd.aprobados + ' aprobados') : null,
        rd.correccion ? tag('warn', rd.correccion + ' en corrección') : null)),
      h('div', { class: 'row' }, D.docs.some((d) => d.vigente && d.revision === 'correccion' && d.notificada === false)
        ? h('button', { type: 'button', class: 'btn btn-primary', onclick: async (ev) => { busy(ev.currentTarget, true, 'Avisando…'); try { const n = await E.notificar(p); toast('Aviso enviado (' + plural(n, 'corrección', 'correcciones') + ').', 'ok'); expediente(id); } catch (e) { busy(ev.currentTarget, false); fail(e); } } }, 'Avisar correcciones al proveedor') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => exportarCsv([p]) }, 'CSV'),
        esAdmin() ? botonBorrarProveedor(p, () => { location.hash = '#/proveedores'; }, true) : null)),
      h('dl', { class: 'facts' },
        [['Contacto', [p.contacto, dd.puesto].filter(Boolean).join(' · ')], ['Correo', p.correo], ['Teléfono', p.telefono], ['País', p.pais],
          ['Inicio', fechaHora(p.creado_en)], ['Envío', p.enviado_en ? fechaHora(p.enviado_en) + (p.envios > 1 ? ' (envío ' + p.envios + ')' : '') : 'Sin enviar'],
          ['Responsable', p.responsable || 'Sin asignar'], ['Resultado', { pendiente: 'Pendiente', observaciones: 'Con observaciones', aprobado: 'Aprobado', rechazado: 'Rechazado' }[p.resultado] || p.resultado]].map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v || '—')))));
  };
  const tabs = h('div', { class: 'tabbar', role: 'tablist' });
  const pintarTabs = () => mount(tabs, [['documentos', 'Documentos'], ['resolucion', 'Resolución'], ['datos', 'Datos del registro'], ['historial', 'Historial'], ['correos', 'Correos']]
    .map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === pestana), onclick: () => { pestana = k; pintarTabs(); pintarCuerpo(); } }, l)));

  const pintarCuerpo = () => {
    if (pestana === 'documentos') return pintarDocumentos();
    if (pestana === 'resolucion') return pintarResolucion();
    if (pestana === 'datos') return mount(cuerpo, h('section', { class: 'card card-pad' }, h('div', { class: 'data-groups' }, PASOS.map((ps) =>
      h('div', null, h('h3', null, ps.titulo), bloquesDatos(ps, p.datos || {}).map((b) => [b.t ? h('h4', { class: 'kv-sec' }, icon(b.icon || 'doc'), b.t) : null,
        h('dl', { class: 'kv' }, b.items.map((c) => [h('dt', null, c.l), h('dd', null, lista((p.datos || {})[c.k]))]))]))))));
    if (pestana === 'historial') return mount(cuerpo, h('section', { class: 'card card-pad' }, D.hist.length ? h('ul', { class: 'timeline' }, D.hist.map((x) =>
      h('li', null, h('time', null, fechaHora(x.creado_en)), h('div', null, h('strong', null, x.texto), h('div', { class: 'cell-sub' }, (x.actor_tipo === 'equipo' ? 'Equipo: ' : 'Proveedor: ') + (x.actor || '—')))))) : h('p', { class: 'muted' }, 'Sin movimientos.')));
    return mount(cuerpo, h('section', { class: 'card card-pad' }, D.correos.length ? h('ul', { class: 'timeline' }, D.correos.map((c) =>
      h('li', null, h('time', null, fechaHora(c.enviado_en || c.creado_en)), h('div', null, h('div', { class: 'row' }, tag(c.estado === 'enviado' ? 'ok' : 'bad', c.estado === 'enviado' ? 'Enviado' : 'Error'),
        h('strong', null, c.asunto)), h('div', { class: 'cell-sub' }, (TIPOS[c.tipo] || c.tipo) + ' · para ' + (c.para || '—')),
        c.error ? h('div', { class: 'err' }, c.error) : null, h('button', { type: 'button', class: 'link small', onclick: () => previa(c) }, 'Ver tarjeta'))))) : h('p', { class: 'muted' }, 'Sin correos.')));
  };

  const visor = h('section', { class: 'card viewer', 'aria-label': 'Visor de documentos' });
  const pintarDocumentos = () => {
    const req = requeridos(p.datos || {});
    const items = DOCS.filter((d) => req.includes(d.k) || D.docs.some((x) => x.tipo === d.k)).map((d) => {
      const v = D.docs.find((x) => x.tipo === d.k && x.vigente);
      const r = v ? REVISION[v.revision] : null;
      return h('button', { type: 'button', class: 'doc-item', id: 'item-' + d.k, 'aria-current': docSel && v && docSel.id === v.id ? 'true' : null, disabled: !v, onclick: () => { docSel = v; pintarDocumentos(); } },
        h('span', { class: 'n' }, d.l), v ? tag(r.tag, r.l) : tag('', 'Sin entregar'),
        h('span', { class: 'm' }, v ? v.nombre + ' · v' + v.version + ' · ' + fecha(v.subido_en) + (v.vence ? ' · vence ' + fecha(v.vence + 'T12:00:00') : '') : (req.includes(d.k) ? 'Requerido' : 'Opcional')));
    });
    if (!docSel) docSel = vigentes()[0] || null;
    mount(cuerpo, p.estado === 'captura' ? h('div', { class: 'note note-info', style: { marginBottom: '14px' } }, h('p', null, 'El proveedor aún no envía su registro. Puedes consultar los documentos; la revisión se habilita cuando lo envíe.')) : null,
      h('div', { class: 'review-grid' }, h('div', { class: 'doc-list' }, items), visor));
    pintarVisor();
  };
  let zoom = 1, giro = 0, blobActual = null;
  const pintarVisor = async () => {
    if (!docSel) { mount(visor, h('div', { class: 'stage' }, h('div', { class: 'ph' }, 'Sin documentos entregados.'))); return; }
    const d = docSel, versiones = D.docs.filter((x) => x.tipo === d.tipo);
    const stage = h('div', { class: 'stage' }, h('div', { class: 'ph' }, 'Cargando documento…'));
    const ver = select(versiones.map((x) => [x.id, 'Versión ' + x.version + (x.vigente ? ' (vigente)' : '') + ' · ' + fecha(x.subido_en)]), d.id, { 'aria-label': 'Versión', style: { width: 'auto', minHeight: '34px', padding: '4px 8px' } });
    ver.addEventListener('change', () => { docSel = versiones.find((x) => x.id === ver.value); zoom = 1; giro = 0; pintarVisor(); });
    const esImg = d.mime !== 'application/pdf';
    const aplicar = () => { const im = stage.querySelector('img'); if (im) im.style.transform = 'scale(' + zoom + ') rotate(' + giro + 'deg)'; };
    const herramientas = h('div', { class: 'tools' }, h('strong', { style: { marginRight: '6px' } }, docLabel(d.tipo)), ver, h('span', { class: 'spacer' }),
      esImg ? [h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Alejar', onclick: () => { zoom = Math.max(.25, zoom - .25); aplicar(); } }, '−'),
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Acercar', onclick: () => { zoom = Math.min(4, zoom + .25); aplicar(); } }, '+'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { giro = (giro + 90) % 360; aplicar(); } }, 'Girar')] : null,
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => blobActual && window.open(URL.createObjectURL(blobActual), '_blank') }, 'Pestaña nueva'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => blobActual && saveBlob(blobActual, d.nombre) }, 'Descargar'));
    mount(visor, herramientas, stage, cajaRevision(d));
    try {
      const b64 = await E.contenido(p.id, d);
      if (docSel !== d) return;
      blobActual = b64ToBlob(b64, d.mime);
      const url = URL.createObjectURL(blobActual);
      mount(stage, esImg ? h('img', { src: url, alt: docLabel(d.tipo) + ' versión ' + d.version, style: { maxWidth: '92%', maxHeight: '92%' } }) : h('iframe', { src: url, title: docLabel(d.tipo) }));
      aplicar();
    } catch (e) { mount(stage, h('div', { class: 'ph' }, friendly(e).message)); }
  };
  const cajaRevision = (d) => {
    const info = d.revision !== 'pendiente' ? h('div', { class: 'note note-' + ({ aprobado: 'ok', correccion: 'warn', rechazado: 'bad' }[d.revision]) },
      h('p', null, h('strong', null, REVISION[d.revision].l), ' por ' + (d.revisado_por_nombre || '—') + ' · ' + fechaHora(d.revisado_en)),
      d.motivo ? h('p', null, 'Motivo: ' + d.motivo) : null, d.notas ? h('p', null, 'Notas: ' + d.notas) : null, d.vence ? h('p', null, 'Vence: ' + fecha(d.vence + 'T12:00:00')) : null) : null;
    if (!d.vigente) return h('div', { class: 'review-box' }, info, h('p', { class: 'small muted' }, 'Versión anterior: se conserva como historial.'));
    const bloqueado = p.estado === 'captura';
    const b = (accion, texto, cls) => h('button', { type: 'button', class: 'btn btn-sm ' + cls, disabled: bloqueado, onclick: () => dialogoRevision(d, accion) }, texto);
    return h('div', { class: 'review-box' }, info, h('div', { class: 'row' }, b('aprobado', 'Aprobar', 'btn-ok'), b('correccion', 'Solicitar corrección', 'btn-warn'), b('rechazado', 'Rechazar', 'btn-bad')));
  };
  const dialogoRevision = (d, accion) => {
    const def = DOCS.find((x) => x.k === d.tipo);
    const titulos = { aprobado: 'Aprobar documento', correccion: 'Solicitar corrección', rechazado: 'Rechazar documento' };
    const motivo = h('input', { class: 'input', id: 'rv-motivo', list: 'rv-motivos', maxlength: 500, autocomplete: 'off' });
    const notas = h('textarea', { class: 'input', id: 'rv-notas', maxlength: 2000 });
    const vence = h('input', { class: 'input', id: 'rv-vence', type: 'date', value: d.vence || '' });
    const avisar = h('input', { type: 'checkbox', id: 'rv-avisar', checked: true });
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    const ok = h('button', { type: 'button', class: 'btn ' + (accion === 'rechazado' ? 'btn-dark' : 'btn-primary') }, titulos[accion]);
    const cancel = h('button', { type: 'button', class: 'btn' }, 'Cancelar');
    const m = modal({ title: titulos[accion], actions: [cancel, ok], body: [
      h('p', null, h('strong', null, def.l), ' · versión ' + d.version + ' · ' + d.nombre),
      accion !== 'aprobado' ? [field('Motivo', motivo, { req: true, help: accion === 'correccion' ? 'El proveedor verá este motivo en su correo y en el portal.' : 'Queda en el expediente.' }),
        h('datalist', { id: 'rv-motivos' }, MOTIVOS.map((x) => h('option', { value: x })))] : null,
      accion === 'aprobado' && def.regla === 'vigencia' ? field('Fecha de vencimiento', vence, { help: 'Opcional. Activa la alerta «Documentos por vencer».' }) : null,
      field(accion === 'aprobado' ? 'Notas (opcional)' : 'Observaciones', notas),
      accion === 'correccion' ? h('label', { class: 'check', for: 'rv-avisar' }, avisar, h('span', null, 'Avisar ahora al proveedor. Desmárcalo para marcar varios documentos y enviar un solo aviso.')) : null,
      accion === 'rechazado' ? h('div', { class: 'note note-info' }, h('p', null, 'Rechazar no avisa al proveedor. Si debe reemplazar el archivo, usa «Solicitar corrección».')) : null, err] });
    cancel.addEventListener('click', m.close);
    ok.addEventListener('click', async () => {
      err.hidden = true; busy(ok, true, 'Guardando…');
      try {
        const r = await E.revisar(p, d, { accion, motivo: motivo.value, notas: notas.value, vence: vence.value, notificar: avisar.checked });
        m.close();
        toast(accion === 'correccion' ? (r.avisados ? 'Corrección solicitada y aviso enviado al proveedor.' : 'Corrección registrada. Usa «Avisar correcciones» cuando termines.') : (accion === 'aprobado' ? 'Documento aprobado.' : 'Documento rechazado.'), 'ok');
        const nuevo = await E.detalle(p.id); Object.assign(D, nuevo); Object.assign(p, nuevo.p);
        docSel = D.docs.find((x) => x.id === d.id) || null;
        pintarCab(); pintarCuerpo(); insignias();
      } catch (e) { busy(ok, false); err.textContent = friendly(e).message; err.hidden = false; }
    });
  };
  const pintarResolucion = () => {
    const resp = select([['', 'Sin asignar'], ...D.equipo.map((u) => [u.id, u.nombre])], p.responsable_id || '', { id: 'rs-resp' });
    const res = select([['pendiente', 'Pendiente'], ['observaciones', 'Con observaciones'], ['aprobado', 'Aprobado (alta del proveedor)'], ['rechazado', 'Rechazado']], p.resultado, { id: 'rs-res', disabled: p.estado === 'captura' });
    const notas = h('textarea', { class: 'input', id: 'rs-notas', maxlength: 4000 }); notas.value = p.notas || '';
    const guardar = h('button', { type: 'button', class: 'btn btn-dark' }, 'Guardar');
    guardar.addEventListener('click', async () => {
      busy(guardar, true, 'Guardando…');
      try { await E.resolver(p, D.docs, { resultado: res.value, notas: notas.value, responsableId: resp.value, equipo: D.equipo }); toast('Guardado.', 'ok'); const n = await E.detalle(p.id); Object.assign(D, n); Object.assign(p, n.p); pintarCab(); pintarCuerpo(); }
      catch (e) { busy(guardar, false); fail(e); }
    });
    mount(cuerpo, h('section', { class: 'card card-pad stack', style: { maxWidth: '760px' } },
      h('div', { class: 'grid-2' }, field('Responsable', resp), field('Resultado general', res, { help: p.estado === 'captura' ? 'Se habilita cuando el proveedor envíe su registro.' : 'Aprobar exige todos los documentos requeridos aprobados; se avisa por correo al proveedor.' }),
        field('Notas internas', notas, { wide: true })), h('div', null, guardar), p.resuelto_en ? h('p', { class: 'small muted' }, 'Resuelto el ' + fechaHora(p.resuelto_en)) : null));
  };

  pintarCab(); pintarTabs();
  mount(main, h('a', { href: '#/proveedores', class: 'link' }, '← Proveedores'), cab, tabs, cuerpo);
  pintarCuerpo();
  document.getElementById('exp-t').focus({ preventScroll: true });
}

function previa(c) {
  modal({ title: c.asunto, wide: true, body: [h('p', { class: 'small muted' }, (TIPOS[c.tipo] || c.tipo) + ' · para ' + (c.para || '—') + ' · intentos: ' + (c.intentos || 0)),
    c.error ? h('div', { class: 'note note-bad' }, h('p', null, c.error)) : null,
    h('iframe', { title: 'Vista previa del correo', sandbox: '', srcdoc: vistaPrevia(c), style: { width: '100%', height: '60vh', border: '1px solid var(--line)', borderRadius: '12px', background: '#fff' } })] });
}

/* ------------------------------------------------------------ correos */
async function vistaCorreos() {
  shell('correos');
  mount(main, cabecera('Correos'), cargando());
  let todos = cache.correos = await E.correos();
  const estado = select([['', 'Todos'], ['enviado', 'Enviados'], ['error', 'Con error']], '', { id: 'm-estado' });
  const tipo = select([['', 'Todas las tarjetas'], ['proveedor', 'Tarjetas al proveedor'], ['interno', 'Alertas internas']], '', { id: 'm-tipo' });
  const q = h('input', { class: 'input', type: 'search', id: 'm-q', placeholder: 'Folio, destinatario o asunto' });
  const cont = h('div');
  const reintentarTodos = h('button', { type: 'button', class: 'btn' }, 'Reintentar los no enviados');
  const pintar = () => {
    const t = q.value.trim().toLowerCase();
    const r = todos.filter((c) => (!estado.value || c.estado === estado.value) && (!tipo.value || c.plantilla === tipo.value) && (!t || [c.folio, c.para, c.asunto].join(' ').toLowerCase().includes(t)));
    reintentarTodos.hidden = !todos.some((c) => c.estado === 'error');
    if (!r.length) { mount(cont, h('div', { class: 'card empty' }, h('h2', null, 'Sin correos'), h('p', null, 'No hay correos con estos filtros.'))); return; }
    mount(cont, h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Fecha', 'Tarjeta', 'Folio', 'Para', 'Asunto', 'Estado', ''].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, r.map((c) => h('tr', null, h('td', null, fechaHora(c.creado_en)), h('td', null, tag(c.plantilla === 'interno' ? 'violet' : 'accent', c.plantilla === 'interno' ? 'Alerta interna' : 'Proveedor'), h('div', { class: 'cell-sub' }, TIPOS[c.tipo] || c.tipo)),
        h('td', null, c.proveedor_id ? h('a', { class: 'folio', href: '#/proveedor/' + c.proveedor_id }, c.folio) : '—'), h('td', null, c.para || '—'), h('td', null, c.asunto),
        h('td', null, tag(c.estado === 'enviado' ? 'ok' : 'bad', c.estado === 'enviado' ? 'Enviado' : 'Error'), c.error ? h('div', { class: 'cell-sub' }, c.error.slice(0, 90)) : null),
        h('td', { style: { whiteSpace: 'nowrap' } }, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => previa(c) }, 'Ver'), ' ',
          c.estado === 'error' ? h('button', { type: 'button', class: 'btn btn-sm', onclick: async (ev) => { busy(ev.currentTarget, true, '…'); try { const n = await E.reintentar(c); toast(n.estado === 'enviado' ? 'Correo enviado.' : 'Sigue sin enviarse: ' + n.error, n.estado === 'enviado' ? 'ok' : 'bad'); todos = await E.correos(); pintar(); } catch (e) { fail(e); } } }, 'Reintentar') : null, ' ',
          c.estado !== 'enviado' && esAdmin() ? h('button', { type: 'button', class: 'btn btn-sm btn-bad btn-icon', title: 'Borrar correo no enviado', 'aria-label': 'Borrar correo no enviado: ' + c.asunto,
            onclick: async (ev) => {
              if (!confirm('¿Borrar este correo no enviado?\n\n' + c.asunto + '\n\nSe quita de la bitácora y ya no se podrá reintentar.')) return;
              busy(ev.currentTarget, true, '…');
              try { await E.borrarCorreo(c); toast('Correo borrado.', 'ok'); todos = await E.correos(); pintar(); } catch (e) { busy(ev.currentTarget, false); fail(e); }
            } }, icon('trash')) : null)))))));
  };
  [estado, tipo].forEach((x) => x.addEventListener('change', pintar));
  q.addEventListener('input', debounce(pintar, 250));
  reintentarTodos.addEventListener('click', async () => {
    busy(reintentarTodos, true, 'Reintentando…'); let ok = 0; const f = todos.filter((c) => c.estado === 'error').slice(0, 20);
    for (const c of f) { try { if ((await E.reintentar(c)).estado === 'enviado') ok++; } catch (e) { /* sigue */ } }
    busy(reintentarTodos, false); toast(ok + ' de ' + f.length + ' enviados.', ok === f.length ? 'ok' : 'bad'); todos = await E.correos(); pintar();
  });
  mount(main, cabecera('Correos', 'Tarjetas al proveedor y alertas internas enviadas automáticamente', reintentarTodos),
    mailConfigured() ? null : h('div', { class: 'note note-warn' }, h('h3', null, 'El envío de correos no está configurado'), h('p', null, 'Completa los datos de EmailJS en js/config.js. Los avisos quedan aquí con error y se pueden reintentar después.')),
    h('section', { class: 'card card-pad' }, h('div', { class: 'toolbar', style: { gridTemplateColumns: 'minmax(220px,2fr) 1fr 1fr' } }, field('Buscar', q), field('Estado', estado), field('Tarjeta', tipo))), cont);
  pintar();
}

/* ------------------------------------------------------------ destinatarios */
async function vistaDestinatarios() {
  shell('destinatarios');
  mount(main, cabecera('Destinatarios'), cargando());
  const lista0 = await E.destinatarios();
  const editable = esAdmin();
  const nombre = h('input', { class: 'input', id: 'd-nombre' }), correo = h('input', { class: 'input', id: 'd-correo', type: 'email' });
  const ini = h('input', { type: 'checkbox', id: 'd-ini' }), env = h('input', { type: 'checkbox', id: 'd-env', checked: true });
  const add = h('button', { type: 'submit', class: 'btn btn-dark' }, 'Agregar');
  const form = h('form', { class: 'card card-pad stack', novalidate: true }, h('h2', { style: { fontSize: '16px' } }, 'Agregar destinatario'),
    h('div', { class: 'grid-2' }, field('Nombre o área', nombre), field('Correo', correo, { req: true })),
    h('div', { class: 'row' }, h('label', { class: 'check', for: 'd-env' }, env, 'Alerta de registro completo y correcciones reenviadas'), h('label', { class: 'check', for: 'd-ini' }, ini, 'Alerta de registro iniciado')), h('div', null, add));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); busy(add, true, 'Agregando…');
    try { await E.guardarDestinatario(null, { nombre: nombre.value, correo: correo.value, avisos: { inicio: ini.checked, envio: env.checked } }); toast('Destinatario agregado.', 'ok'); vistaDestinatarios(); }
    catch (e) { busy(add, false); fail(e); }
  });
  const fila = (r) => {
    const tg = (k, l) => { const cb = h('input', { type: 'checkbox', checked: !!(r.avisos || {})[k], disabled: !editable, 'aria-label': l + ': ' + r.correo });
      cb.addEventListener('change', async () => { try { await E.guardarDestinatario(r.id, { ...r, avisos: { ...(r.avisos || {}), [k]: cb.checked } }); r.avisos = { ...(r.avisos || {}), [k]: cb.checked }; toast('Actualizado.', 'ok'); } catch (e) { cb.checked = !cb.checked; fail(e); } });
      return h('td', null, cb); };
    const act = h('input', { type: 'checkbox', checked: r.activo !== false, disabled: !editable, 'aria-label': 'Activo: ' + r.correo });
    act.addEventListener('change', async () => { try { await E.guardarDestinatario(r.id, { ...r, activo: act.checked }); toast('Actualizado.', 'ok'); } catch (e) { fail(e); } });
    return h('tr', null, h('td', null, r.nombre || '—'), h('td', null, r.correo), tg('envio', 'Registro completo'), tg('inicio', 'Registro iniciado'), h('td', null, act),
      h('td', null, editable ? h('button', { type: 'button', class: 'btn btn-sm btn-bad', onclick: async () => { if (!confirm('¿Quitar a ' + r.correo + '?')) return; try { await E.borrarDestinatario(r.id); vistaDestinatarios(); } catch (e) { fail(e); } } }, 'Quitar') : null));
  };
  const sinEnvio = !lista0.some((r) => r.activo !== false && (r.avisos || {}).envio);
  mount(main, cabecera('Destinatarios', 'Correos de CESANTONI que reciben las alertas internas'),
    sinEnvio ? h('div', { class: 'note note-warn' }, h('p', null, 'Nadie recibe la alerta de «registro completo». Agrega al menos un destinatario.')) : null,
    editable ? form : h('p', { class: 'muted' }, 'Solo un administrador puede modificar esta lista.'),
    lista0.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Nombre', 'Correo', 'Registro completo', 'Registro iniciado', 'Activo', ''].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', null, lista0.map(fila))))
      : h('div', { class: 'card empty' }, h('h2', null, 'Sin destinatarios'), h('p', null, 'Agrega los correos del equipo que deben recibir las alertas.')));
}

/* ------------------------------------------------------------ usuarios */
async function vistaUsuarios() {
  shell('usuarios');
  mount(main, cabecera('Usuarios'), cargando());
  const us = await E.usuarios();
  const nuevo = h('button', { type: 'button', class: 'btn btn-dark' }, 'Nuevo usuario');
  nuevo.addEventListener('click', () => dialogoUsuario(null));
  mount(main, cabecera('Usuarios', 'Cada persona entra con su correo; el historial registra quién revisó cada documento', nuevo),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Nombre', 'Correo', 'Rol', 'Estado', 'Último acceso', ''].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, us.map((u) => h('tr', null, h('td', null, h('strong', null, u.nombre)), h('td', null, u.correo), h('td', null, u.rol === 'admin' ? 'Administrador' : 'Revisor'),
        h('td', null, u.activo !== false ? tag('ok', 'Activo') : tag('', 'Inactivo'), u.cambiar_clave ? h('div', { class: 'cell-sub' }, 'Debe cambiar su contraseña') : null),
        h('td', null, u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : 'Nunca'), h('td', null, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dialogoUsuario(u) }, 'Editar'))))))));
}
function dialogoUsuario(u) {
  const nuevo = !u;
  const nombre = h('input', { class: 'input', id: 'u-nombre', value: u ? u.nombre : '' }), correo = h('input', { class: 'input', id: 'u-correo', type: 'email', value: u ? u.correo : '', disabled: !nuevo });
  const rol = select([['revisor', 'Revisor: revisa expedientes'], ['admin', 'Administrador: además usuarios y destinatarios']], u ? u.rol : 'revisor', { id: 'u-rol' });
  const clave = h('input', { class: 'input', id: 'u-clave', type: 'password', autocomplete: 'new-password' });
  const activo = h('input', { type: 'checkbox', id: 'u-activo', checked: u ? u.activo !== false : true }), rest = h('input', { type: 'checkbox', id: 'u-rest' });
  const err = h('p', { class: 'err', role: 'alert', hidden: true }), ok = h('button', { type: 'button', class: 'btn btn-primary' }, nuevo ? 'Crear usuario' : 'Guardar'), cancel = h('button', { type: 'button', class: 'btn' }, 'Cancelar');
  const m = modal({ title: nuevo ? 'Nuevo usuario' : 'Editar usuario', actions: [cancel, ok], body: [h('div', { class: 'grid-2' }, field('Nombre', nombre, { req: true }), field('Correo', correo, { req: true }), field('Rol', rol, { wide: true }),
    nuevo ? field('Contraseña temporal', clave, { req: true, wide: true, help: 'Mínimo 10 caracteres con letras y números. Deberá cambiarla al entrar.' }) : null),
    nuevo ? null : h('label', { class: 'check', for: 'u-activo' }, activo, 'Usuario activo'), nuevo ? null : h('label', { class: 'check', for: 'u-rest' }, rest, 'Enviarle un correo para restablecer su contraseña'), err] });
  cancel.addEventListener('click', m.close);
  ok.addEventListener('click', async () => {
    err.hidden = true; busy(ok, true, 'Guardando…');
    try { if (nuevo) await E.crearUsuario({ nombre: nombre.value, correo: correo.value, rol: rol.value, clave: clave.value }); else await E.editarUsuario(u, { nombre: nombre.value, rol: rol.value, activo: activo.checked, restablecer: rest.checked });
      m.close(); toast(nuevo ? 'Usuario creado.' : 'Usuario actualizado.', 'ok'); vistaUsuarios(); }
    catch (e) { busy(ok, false); err.textContent = friendly(e).message; err.hidden = false; }
  });
}

/* ------------------------------------------------------------ cuenta y sistema */
function vistaCuenta() {
  shell('cuenta');
  const a = h('input', { class: 'input', type: 'password', id: 'p-actual', autocomplete: 'current-password' });
  const n = h('input', { class: 'input', type: 'password', id: 'p-nueva', autocomplete: 'new-password' });
  const r = h('input', { class: 'input', type: 'password', id: 'p-repite', autocomplete: 'new-password' });
  const btn = h('button', { type: 'submit', class: 'btn btn-dark' }, 'Cambiar contraseña');
  const form = h('form', { class: 'card card-pad stack', novalidate: true, style: { maxWidth: '520px' } }, h('h2', { style: { fontSize: '16px' } }, 'Cambiar contraseña'),
    field('Contraseña actual', a), field('Nueva contraseña', n, { help: 'Mínimo 10 caracteres, con letras y números.' }), field('Repite la nueva contraseña', r), h('div', null, btn));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (n.value !== r.value) return toast('Las contraseñas no coinciden.', 'bad');
    busy(btn, true, 'Guardando…');
    try { await E.cambiarClave(a.value, n.value); toast('Contraseña actualizada.', 'ok'); a.value = n.value = r.value = ''; } catch (e) { fail(e); }
    busy(btn, false);
  });
  mount(main, cabecera('Mi cuenta', yo.nombre + ' · ' + yo.correo + ' · ' + (yo.rol === 'admin' ? 'Administrador' : 'Revisor')), form);
}

async function vistaSistema() {
  shell('sistema');
  mount(main, cabecera('Sistema'), cargando());
  const [provs, bytes] = await Promise.all([E.proveedores(), E.usoAlmacenamiento().catch(() => 0)]);
  const mb = bytes / 1048576;
  const para = h('input', { class: 'input', type: 'email', id: 's-prueba', value: yo.correo });
  const probar = h('button', { type: 'button', class: 'btn btn-sm' }, 'Enviar correo de prueba');
  probar.addEventListener('click', async () => { busy(probar, true, 'Enviando…'); try { await E.probarCorreo(para.value.trim()); toast('Correo de prueba enviado.', 'ok'); } catch (e) { fail(e); } busy(probar, false); });
  const resp = h('button', { type: 'button', class: 'btn btn-dark' }, 'Descargar respaldo (JSON)');
  resp.addEventListener('click', async () => { busy(resp, true, 'Preparando…'); try { const d = await E.respaldo(); saveBlob(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), 'Respaldo_Proveedores_CESANTONI_' + dia(new Date().toISOString()) + '.json'); } catch (e) { fail(e); } busy(resp, false); });
  const caja = (t, filas, extra) => h('section', { class: 'card card-pad' }, h('h2', { style: { fontSize: '16px', marginBottom: '12px' } }, t), h('dl', { class: 'kv' }, filas.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])), extra || null);
  mount(main, cabecera('Sistema', 'Servicios gratuitos, uso y respaldo', esAdmin() ? resp : null),
    h('div', { class: 'grid-2' },
      caja('Correo', [['Servicio', 'EmailJS (200 correos al mes gratis)'], ['Estado', mailConfigured() ? 'Configurado' : 'Pendiente: datos de EmailJS en js/config.js']],
        esAdmin() ? h('div', { class: 'stack', style: { marginTop: '14px' } }, field('Correo de prueba', para), h('div', null, probar)) : null),
      caja('Base de datos', [['Servicio', 'Cloud Firestore · plan Spark (sin costo)'], ['Proyecto', CFG.firebase.projectId], ['Documentos guardados', mb.toFixed(1) + ' MB de 1024 MB gratuitos'],
        ['Registros', String(provs.length)]]),
      caja('Reglas', [['Tamaño máximo por archivo', '5 MB (PDF, JPG, PNG o WEBP)'], ['Lectura de fechas', 'Manual (sin lectura automática)'],
        ['Alertas', 'Revisión ≥ ' + ALERTAS.revisarDias + ' días · corrección ≥ ' + ALERTAS.correccionDias + ' · sin avance ≥ ' + ALERTAS.abandonoDias + ' · vencimiento ≤ ' + ALERTAS.venceDias]]),
      caja('Direcciones', [['Portal', new URL('./', location.href).href], ['Panel', location.href.split('#')[0]], ['Logotipos', 'Originales sin modificar']])));
}

init();
