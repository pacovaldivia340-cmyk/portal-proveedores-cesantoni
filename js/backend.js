/* Lógica de la plataforma sobre Firebase (Authentication + Firestore, plan gratuito Spark).
 * Expone window.CPBackend.request(método, ruta, cuerpo) con las mismas rutas que usaba el
 * servidor original, para que el portal y el panel funcionen sin servidor propio ni Apps Script.
 * La seguridad real está en firestore.rules: cada proveedor solo puede leer y modificar su
 * propio registro, y solo el personal activo (pv_admins) puede ver y revisar expedientes.
 */
import * as fb from './firebase-sdk.js';

const CFG = window.CP_CONFIG || {};
const APP_VERSION = '3.0-web';
const TZ = 'America/Mexico_City';
const MAX_UPLOAD_MB = 5;
const CHUNK = 700000;                 // caracteres base64 por parte (Firestore admite ~1 MB por documento)
const COL = { config: 'pv_config', admins: 'pv_admins', folios: 'pv_folios', prov: 'pv_proveedores',
  correos: 'pv_correos', dest: 'pv_destinatarios' };

/* ------------------------------------------------------------------ catálogos */
const CENTROAMERICA = ['Belice', 'Guatemala', 'El Salvador', 'Honduras', 'Nicaragua', 'Costa Rica', 'Panamá'];
const PAISES = ['México'].concat(CENTROAMERICA);
const ESTADOS_MX = ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco',
  'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'];
const TODA_LA_REPUBLICA = 'Toda la República';
const SERVICIOS = ['Transporte nacional (carga completa)', 'Carga consolidada', 'Última milla y reparto local',
  'Transporte a Centroamérica', 'Importación y exportación', 'Logística operativa (maniobras y almacenaje)'];
const TIPOS_UNIDAD = ["Caja seca 53'", "Caja seca 48'", 'Full (doble remolque)', 'Torton', 'Rabón', 'Camioneta 3.5 t', 'Plataforma', 'Refrigerado'];
const STEPS = [
  { id: 'contacto', title: 'Contacto', intro: 'Con estos datos generamos tu folio y tu clave de acceso para continuar cuando quieras.', fields: [
    { key: 'contacto_nombre', label: 'Nombre completo', type: 'text', required: true, max: 120 },
    { key: 'contacto_puesto', label: 'Puesto', type: 'text', max: 80 },
    { key: 'contacto_email', label: 'Correo electrónico', type: 'email', required: true },
    { key: 'contacto_telefono', label: 'Teléfono', type: 'tel', required: true },
    { key: 'razon_social', label: 'Empresa o razón social', type: 'text', required: true, max: 200 },
    { key: 'pais', label: 'País de la empresa', type: 'select', options: PAISES, required: true }] },
  { id: 'empresa', title: 'Empresa', intro: 'Datos fiscales y de ubicación de la empresa.', fields: [
    { key: 'nombre_comercial', label: 'Nombre comercial', type: 'text', max: 200 },
    { key: 'tax_id', label: 'RFC o identificación fiscal', type: 'text', required: true, max: 30, help: 'Empresas en México: RFC de 12 o 13 caracteres.' },
    { key: 'domicilio_calle', label: 'Calle y número', type: 'text', required: true, max: 200 },
    { key: 'domicilio_colonia', label: 'Colonia o zona', type: 'text', max: 120 },
    { key: 'domicilio_ciudad', label: 'Ciudad o municipio', type: 'text', required: true, max: 120 },
    { key: 'domicilio_estado', label: 'Estado, provincia o departamento', type: 'text', required: true, max: 120 },
    { key: 'domicilio_cp', label: 'Código postal', type: 'text', required: true, max: 12 },
    { key: 'anios_operacion', label: 'Años de operación', type: 'number', min: 0, max: 150 },
    { key: 'sitio_web', label: 'Sitio web', type: 'text', max: 200 },
    { key: 'operaciones_nombre', label: 'Contacto de operaciones (tráfico)', type: 'text', max: 120 },
    { key: 'operaciones_telefono', label: 'Teléfono de operaciones', type: 'tel' },
    { key: 'operaciones_email', label: 'Correo de operaciones', type: 'email' }] },
  { id: 'operacion', title: 'Operación y cobertura', intro: 'Servicios que ofreces, dónde operas y cómo monitoreas tus unidades.', fields: [
    { key: 'servicios', label: 'Tipo de servicio', type: 'multi', options: SERVICIOS, required: true },
    { key: 'cobertura_nacional', label: 'Cobertura nacional', type: 'multi', options: [TODA_LA_REPUBLICA].concat(ESTADOS_MX), required: true, help: 'Marca «Toda la República» o los estados donde operas.' },
    { key: 'cobertura_internacional', label: 'Cobertura internacional (Centroamérica)', type: 'multi', options: CENTROAMERICA, help: 'Solo países de Centroamérica. Déjalo vacío si operas únicamente en México.' },
    { key: 'tipos_unidad', label: 'Tipos de unidad', type: 'multi', options: TIPOS_UNIDAD, required: true },
    { key: 'numero_unidades', label: 'Número de unidades', type: 'number', required: true, min: 0, max: 100000 },
    { key: 'monitoreo', label: 'Monitoreo de unidades', type: 'radio', options: ['24/7', 'Intermitente'], required: true },
    { key: 'gps', label: '¿Tus unidades cuentan con GPS?', type: 'radio', options: ['Sí', 'No'], required: true }] }
];
const DOC_TYPES = [
  { key: 'constancia_fiscal', label: 'Constancia de situación fiscal', rule: 'max_age', help: 'Emitida dentro de los últimos 3 meses. Fuera de México: registro tributario equivalente.' },
  { key: 'opinion_cumplimiento', label: 'Opinión de cumplimiento', rule: 'max_age', help: 'Opinión de cumplimiento de obligaciones fiscales con antigüedad máxima de 3 meses.' },
  { key: 'caratula_bancaria', label: 'Carátula bancaria', rule: 'max_age', help: 'Estado de cuenta o carta bancaria con la cuenta a registrar; máximo 3 meses.' },
  { key: 'comprobante_domicilio', label: 'Comprobante de domicilio', rule: 'max_age', help: 'Recibo o constancia con antigüedad máxima de 3 meses.' },
  { key: 'poliza_seguro', label: 'Póliza de seguro', rule: 'expiry', help: 'Debe estar vigente: revisamos su fecha de vencimiento.' },
  { key: 'permiso_autotransporte', label: 'Permiso de autotransporte', rule: 'expiry', help: 'Permiso SICT o su equivalente en tu país. Revisamos su vigencia.' },
  { key: 'permiso_internacional', label: 'Permiso de operación internacional', rule: 'expiry', required_if: 'internacional', help: 'Obligatorio si marcaste cobertura en Centroamérica. Revisamos su vigencia.' }
];
const ESTADOS = { iniciado: 'En captura', enviado: 'Enviado, pendiente de revisión', en_revision: 'En revisión', correccion: 'Corrección solicitada', aprobado: 'Aprobado', rechazado: 'Rechazado' };
const RESULTADOS = { pendiente: 'Pendiente', con_observaciones: 'Con observaciones', aprobado: 'Aprobado', rechazado: 'Rechazado' };
const VALIDACIONES = { valido: 'Fecha validada', rechazado: 'Rechazado por fecha', revision_manual: 'Revisión manual de fecha' };
const REVISIONES = { pendiente: 'Por revisar', aprobado: 'Aprobado', rechazado: 'Rechazado', correccion: 'Corrección solicitada' };
const EMAIL_TIPOS = { acceso: 'Acceso al registro (folio y clave)', aviso_inicio: 'Aviso interno: registro iniciado',
  confirmacion_envio: 'Confirmación de envío al proveedor', aviso_envio: 'Aviso interno: registro enviado',
  correccion: 'Corrección solicitada al proveedor', aviso_correcciones: 'Aviso interno: correcciones reenviadas', prueba: 'Correo de prueba' };
const FIELDS = {};
STEPS.forEach((s) => s.fields.forEach((f) => { FIELDS[f.key] = f; }));
const docLabel = (k) => (DOC_TYPES.find((d) => d.key === k) || {}).label || k;
const stepTitle = (k) => (STEPS.find((s) => s.id === k) || {}).title || k;

/* ------------------------------------------------------------------ utilidades */
const nowIso = () => new Date().toISOString();
function apiError(message, status, errors) { const e = new Error(message); e.apiStatus = status || 400; e.apiErrors = errors || {}; return e; }
function randomChars(n, chars) { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, (x) => chars[x % chars.length]).join(''); }
const newCode = () => { const c = randomChars(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); return c.slice(0, 4) + '-' + c.slice(4); };
const newId = () => randomChars(20, 'abcdefghijklmnopqrstuvwxyz0123456789');
async function sha256(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
}
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
const localDay = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso)) : '');
const baseUrl = () => new URL('./', location.href).href;
const portalUrl = () => baseUrl();
const adminUrl = () => new URL('admin.html', baseUrl()).href;

function validateAll(data) {
  const result = {};
  STEPS.forEach((step) => {
    const errors = {};
    step.fields.forEach((f) => {
      const v = data[f.key];
      const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
      const digits = String(v || '').replace(/\D/g, '').length;
      if (f.required && empty) errors[f.key] = 'Este campo es obligatorio.';
      else if (!empty && f.type === 'email' && !emailOk(v)) errors[f.key] = 'Escribe un correo válido.';
      else if (!empty && f.type === 'tel' && (digits < 7 || digits > 15)) errors[f.key] = 'Escribe un teléfono válido de 7 a 15 dígitos.';
      else if (!empty && f.max && f.type !== 'number' && String(v).length > f.max) errors[f.key] = 'Máximo ' + f.max + ' caracteres.';
      else if (!empty && f.type === 'number' && (isNaN(Number(v)) || Number(v) < (f.min || 0) || Number(v) > f.max)) errors[f.key] = 'Escribe un número válido.';
    });
    if (data.pais === 'México' && step.id === 'empresa' && data.tax_id && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(String(data.tax_id).replace(/[\s-]/g, ''))) {
      errors.tax_id = 'El RFC debe tener 12 o 13 caracteres válidos.';
    }
    if (Object.keys(errors).length) result[step.id] = errors;
  });
  return result;
}
function normalizeField(f, value) {
  if (f.type === 'multi') return Array.isArray(value) ? f.options.filter((o) => value.indexOf(o) >= 0) : [];
  if (value === null || value === undefined || typeof value === 'object') return '';
  return String(value).trim().slice(0, 1000);
}
const requiredDocKeys = (data) => DOC_TYPES.filter((d) => !d.required_if || (data.cobertura_internacional || []).length).map((d) => d.key);

/* ------------------------------------------------------------------ Firebase */
const configured = !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.projectId && CFG.firebase.appId);
const scope = document.body.classList.contains('admin') ? 'panel' : 'portal';   // sesiones separadas para portal y panel
let auth = null, db = null;
function connectEmulators(a, d) {
  if (!CFG.emulator) return;
  fb.connectAuthEmulator(a, 'http://' + CFG.emulator.auth, { disableWarnings: true });
  if (d) { const [host, port] = CFG.emulator.firestore.split(':'); fb.connectFirestoreEmulator(d, host, Number(port)); }
}
const ready = new Promise((resolve) => {
  if (!configured) { resolve(); return; }
  const app = fb.initializeApp(CFG.firebase, scope);
  auth = fb.getAuth(app); db = fb.getFirestore(app);
  connectEmulators(auth, db);
  const off = fb.onAuthStateChanged(auth, () => { off(); resolve(); });
});

const ref = (...p) => fb.doc(db, ...p);
const coll = (...p) => fb.collection(db, ...p);
async function getOne(r) { const s = await fb.getDoc(r); return s.exists() ? Object.assign({ id: s.id }, s.data()) : null; }
async function getAll(q) { return (await fb.getDocs(q)).docs.map((s) => Object.assign({ id: s.id }, s.data())); }
const byDateDesc = (a, b) => String(b.creado_en || b.subido_en || '').localeCompare(String(a.creado_en || a.subido_en || ''));

function mapFirebaseError(e) {
  if (e && e.apiStatus) return e;
  const code = (e && e.code) || '';
  const table = {
    'permission-denied': ['No tienes permiso para esta acción o tu sesión cambió. Vuelve a entrar.', 403],
    'unavailable': ['No hay conexión con la base de datos. Revisa tu internet e inténtalo de nuevo.', 0],
    'auth/network-request-failed': ['No hay conexión. Revisa tu internet e inténtalo de nuevo.', 0],
    'auth/too-many-requests': ['Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 429],
    'auth/invalid-credential': ['Datos de acceso incorrectos.', 401],
    'auth/wrong-password': ['Datos de acceso incorrectos.', 401],
    'auth/user-not-found': ['Datos de acceso incorrectos.', 401],
    'auth/user-disabled': ['Esta cuenta está desactivada.', 401],
    'auth/email-already-in-use': ['Ya existe una cuenta con ese correo.', 409],
    'auth/weak-password': ['La contraseña es demasiado débil.', 400],
    'auth/requires-recent-login': ['Por seguridad vuelve a entrar e inténtalo de nuevo.', 401],
    'resource-exhausted': ['Se alcanzó el límite gratuito diario de la base de datos. Inténtalo mañana.', 429]
  };
  const hit = table[code];
  const err = apiError(hit ? hit[0] : 'Ocurrió un error inesperado. Inténtalo de nuevo.', hit ? hit[1] : 500);
  err.cause = e;
  return err;
}

/* ------------------------------------------------------------------ bitácora y correos (EmailJS) */
async function logEvent(uid, actorType, actor, accion, detalle) {
  const id = newId();
  await fb.setDoc(ref(COL.prov, uid, 'eventos', id), { supplier_id: uid, actor_tipo: actorType, actor: actor || '', accion, detalle: detalle || '', creado_en: nowIso() });
}
const emailConfigured = () => !!(CFG.emailjs && CFG.emailjs.publicKey && CFG.emailjs.serviceId && CFG.emailjs.templateId);
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function emailText(c) {
  const lines = [c.titulo, ''].concat(c.parrafos || []);
  if ((c.datos || []).length) { lines.push(''); c.datos.forEach((r) => lines.push(r[0] + ': ' + r[1])); }
  if (c.boton) lines.push('', c.boton.texto + ': ' + c.boton.url);
  if (c.nota) lines.push('', c.nota);
  lines.push('', 'CESANTONI | Somos Logística');
  return lines.join('\n');
}
function emailHtml(c) {
  const img = (f) => new URL('img/' + f, baseUrl()).href;
  const rows = (c.datos || []).map((r) => '<tr><td style="padding:6px 12px 6px 0;color:#565D63;font-size:13px;vertical-align:top;white-space:nowrap">' + esc(r[0]) +
    '</td><td style="padding:6px 0;color:#1B1C1E;font-size:14px;font-weight:600">' + esc(r[1]) + '</td></tr>').join('');
  return '<div style="margin:0;background:#F3F4F5;padding:24px 12px;font-family:Montserrat,Arial,sans-serif;color:#1B1C1E">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden">' +
    '<tr><td style="border-top:4px solid #D77129;padding:18px 24px;border-bottom:1px solid #E7E5E1">' +
    '<img src="' + img('logo-cesantoni.png') + '" alt="CESANTONI" width="150" style="display:inline-block;vertical-align:middle;height:auto;border:0">' +
    '<span style="display:inline-block;width:1px;height:44px;background:#D8D6D1;margin:0 14px;vertical-align:middle"></span>' +
    '<img src="' + img('logo-somos.png') + '" alt="Somos Logística CESANTONI" width="170" style="display:inline-block;vertical-align:middle;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:24px"><h1 style="margin:0 0 14px;font-family:Antonio,\'Arial Narrow\',Arial,sans-serif;font-size:28px;font-weight:700;color:#1B1C1E">' + esc(c.titulo) + '</h1>' +
    (c.parrafos || []).map((p) => '<p style="margin:0 0 12px;font-size:14px;line-height:1.55">' + esc(p) + '</p>').join('') +
    (rows ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 16px;background:#F3F4F5;border-radius:8px;padding:10px 14px;width:100%">' + rows + '</table>' : '') +
    (c.boton ? '<p style="margin:18px 0"><a href="' + esc(c.boton.url) + '" style="display:inline-block;background:#D77129;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;font-size:14px">' + esc(c.boton.texto) + '</a></p>' : '') +
    (c.nota ? '<p style="margin:0;font-size:12px;color:#565D63">' + esc(c.nota) + '</p>' : '') +
    '</td></tr><tr><td style="padding:14px 24px;background:#1B1C1E;color:#FFFFFF;font-size:12px">CESANTONI | Somos Logística · Registro de proveedores de transporte</td></tr></table></div>';
}
function redact(c) {
  const copy = JSON.parse(JSON.stringify({ titulo: c.titulo, parrafos: c.parrafos || [], datos: c.datos || [], boton: c.boton || null, nota: c.nota || '', secreto: !!c.secreto }));
  if (c.secreto) copy.datos = copy.datos.map((r) => (r[0] === 'Clave de acceso' ? [r[0], '(oculta por seguridad)'] : r));
  return copy;
}
async function deliver(to, c) {
  if (!emailConfigured()) throw new Error('El envío de correos no está configurado (EmailJS).');
  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: CFG.emailjs.serviceId, template_id: CFG.emailjs.templateId, user_id: CFG.emailjs.publicKey,
      template_params: { to_email: to, subject: c.asunto, html: emailHtml(c), message: emailText(c) } })
  });
  if (!r.ok) throw new Error('EmailJS respondió ' + r.status + ': ' + (await r.text()).slice(0, 200));
}
const recentMail = new Map();
async function recipientsFor(flag) {
  try { return (await getAll(coll(COL.dest))).filter((r) => r.activo !== false && r[flag] && emailOk(r.email)).map((r) => r.email.toLowerCase()); }
  catch (e) { return []; }
}
/* Envía y registra cada intento; un aviso idéntico no se repite en 10 minutos (evita duplicados). */
async function sendEmail(c) {
  const to = [...new Set((Array.isArray(c.to) ? c.to : [c.to]).map((x) => String(x || '').trim().toLowerCase()).filter(emailOk))];
  const s = c.supplier || {};
  const record = { tipo: c.tipo, audiencia: c.audiencia || 'proveedor', supplier_id: s.id || null, folio: s.folio || '',
    destinatarios: to.join(', '), asunto: c.asunto, contenido: JSON.stringify(redact(c)), estado: 'pendiente', intentos: 0,
    ultimo_error: '', creado_en: nowIso(), enviado_en: null };
  const key = await sha256([record.tipo, record.supplier_id, record.destinatarios, record.asunto, record.contenido].join('|'));
  if (recentMail.has(key) && Date.now() - recentMail.get(key) < 600000) return { estado: 'duplicado' };
  recentMail.set(key, Date.now());
  if (!to.length) {
    record.estado = 'error';
    record.ultimo_error = c.audiencia === 'interno' ? 'No hay destinatarios internos activos para este aviso. Agrégalos en Destinatarios.' : 'Correo del destinatario no válido.';
  } else {
    record.intentos = 1;
    try { await deliver(to.join(','), c); record.estado = 'enviado'; record.enviado_en = nowIso(); }
    catch (e) { record.estado = 'error'; record.ultimo_error = String(e.message || e).slice(0, 500); recentMail.delete(key); }
  }
  record.id = newId();
  try { await fb.setDoc(ref(COL.correos, record.id), stripUndef(record)); } catch (e) { /* la bitácora no debe impedir el flujo */ }
  return record;
}
function stripUndef(o) { const out = {}; Object.keys(o).forEach((k) => { if (o[k] !== undefined && k !== 'id') out[k] = o[k]; }); return out; }

/* ------------------------------------------------------------------ proveedor */
async function currentSupplier() {
  await ready;
  const u = auth && auth.currentUser;
  if (!u) throw apiError('Tu sesión terminó. Entra de nuevo con tu folio y tu clave.', 401);
  let s = null;
  try { s = await getOne(ref(COL.prov, u.uid)); }
  catch (e) { if (e.code === 'permission-denied' || /auth\//.test(e.code || '')) { await fb.signOut(auth).catch(() => null); s = null; } else throw e; }
  if (!s) throw apiError('Tu sesión terminó. Entra de nuevo con tu folio y tu clave.', 401);
  return s;
}
const docsOf = async (uid) => (await getAll(coll(COL.prov, uid, 'documentos'))).sort(byDateDesc);
function currentFrom(docs) { const out = {}; docs.forEach((d) => { if (d.es_actual && !out[d.tipo]) out[d.tipo] = d; }); return out; }
function docPublic(d) {
  return { id: d.supplier_id + '~' + d.id, version: d.version, nombre_original: d.nombre_original, mime: d.mime, tamano: d.tamano, subido_en: d.subido_en,
    fecha_detectada: null, tipo_fecha: d.tipo_fecha || '', validacion: 'revision_manual', validacion_label: VALIDACIONES.revision_manual,
    validacion_detalle: 'Documento recibido. La fecha y la vigencia las revisa manualmente el equipo de Logística.',
    revision: d.revision || 'pendiente', revision_label: REVISIONES[d.revision || 'pendiente'], es_actual: !!d.es_actual, archivo_url: '' };
}
function canUpload(s, current, required, tipo) {
  if (s.estado === 'iniciado') return true;
  if (s.estado !== 'correccion') return false;
  const cur = current[tipo];
  return cur ? cur.revision === 'correccion' : required.indexOf(tipo) >= 0;
}
function supplierView(s, docs) {
  const data = s.data || {}, required = requiredDocKeys(data), current = currentFrom(docs), grouped = {};
  docs.forEach((d) => { (grouped[d.tipo] = grouped[d.tipo] || []).push(d); });
  return {
    id: s.id, folio: s.folio, estado: s.estado, estado_label: ESTADOS[s.estado], data, paso_actual: s.paso_actual || 'empresa',
    envios: s.envios || 0, fecha_inicio: s.fecha_inicio, fecha_envio: s.fecha_envio || null, fecha_ultimo_envio: s.fecha_ultimo_envio || null,
    fecha_actualizacion: s.fecha_actualizacion, editable: ['iniciado', 'correccion'].indexOf(s.estado) >= 0, requeridos: required, errores: validateAll(data),
    documentos: DOC_TYPES.map((dt) => {
      const versions = grouped[dt.key] || [], cur = current[dt.key] || null, fix = cur && cur.revision === 'correccion';
      return { tipo: dt.key, requerido: required.indexOf(dt.key) >= 0, entregado: !!cur, actual: cur ? docPublic(cur) : null,
        ultimo_intento: !cur && versions[0] ? docPublic(versions[0]) : null, puede_subir: canUpload(s, current, required, dt.key),
        motivo: fix ? (cur.motivo || 'Corrección solicitada.') : '', observaciones: fix ? (cur.observaciones || '') : '' };
    })
  };
}

async function startRegistration(payload) {
  if (!payload.consentimiento) throw apiError('Debes aceptar el aviso de privacidad para continuar.', 422, { contacto: { consentimiento: 'Obligatorio.' } });
  const data = {};
  STEPS[0].fields.forEach((f) => { data[f.key] = normalizeField(f, (payload.data || {})[f.key]); });
  data.contacto_email = String(data.contacto_email || '').toLowerCase();
  const errors = validateAll(data).contacto || {};
  if (Object.keys(errors).length) throw apiError('Revisa los datos marcados.', 422, { contacto: errors });
  let folio = '';
  for (let i = 0; i < 6 && !folio; i++) {
    const f = 'PRV-' + new Date().getFullYear() + '-' + randomChars(8, '0123456789');
    if (!(await getOne(ref(COL.folios, f)))) folio = f;
  }
  if (!folio) throw apiError('No fue posible generar el folio. Inténtalo de nuevo.', 503);
  const code = newCode();
  let cred;
  try { cred = await fb.createUserWithEmailAndPassword(auth, data.contacto_email, code); }
  catch (e) {
    if (e.code === 'auth/email-already-in-use') throw apiError('Ya existe un registro con este correo. Continúa con tu folio y clave, o usa «No tengo mi clave».', 409, { contacto: { contacto_email: 'Este correo ya tiene un registro.' } });
    throw e;
  }
  const uid = cred.user.uid, now = nowIso();
  const s = { folio, estado: 'iniciado', acceso_email: data.contacto_email, razon_social: data.razon_social, pais: data.pais,
    contacto_nombre: data.contacto_nombre, contacto_email: data.contacto_email, contacto_telefono: data.contacto_telefono, data,
    paso_actual: 'empresa', envios: 0, fecha_inicio: now, fecha_envio: null, fecha_ultimo_envio: null, fecha_actualizacion: now,
    resultado_revision: 'pendiente', responsable_id: null, responsable_nombre: '', observaciones: '', fecha_resolucion: null,
    consentimiento_en: now, entregados: {}, revisiones: {} };
  try {
    const batch = fb.writeBatch(db);
    batch.set(ref(COL.prov, uid), s);
    batch.set(ref(COL.folios, folio), { email: data.contacto_email, uid });
    batch.set(ref(COL.prov, uid, 'eventos', newId()), { supplier_id: uid, actor_tipo: 'proveedor', actor: data.contacto_email, accion: 'registro_iniciado', detalle: 'Folio ' + folio + ' generado.', creado_en: now });
    await batch.commit();
  } catch (e) { try { await cred.user.delete(); } catch (x) { /* nada */ } throw e; }
  s.id = uid;
  await sendEmail({ tipo: 'acceso', audiencia: 'proveedor', supplier: s, to: s.contacto_email, secreto: true,
    asunto: 'Tu folio de registro de proveedor ' + folio, titulo: 'Tu registro quedó iniciado',
    parrafos: ['Hola ' + s.contacto_nombre + ', generamos tu folio de registro como proveedor de transporte de CESANTONI.',
      'Guarda estos datos: con ellos puedes continuar tu registro desde cualquier dispositivo. Tu avance se guarda automáticamente.'],
    datos: [['Folio', folio], ['Clave de acceso', code], ['Empresa', s.razon_social]],
    boton: { texto: 'Continuar mi registro', url: portalUrl() },
    nota: 'Si pierdes tu clave, en el portal elige «No tengo mi clave» para definir una nueva.' });
  await sendEmail({ tipo: 'aviso_inicio', audiencia: 'interno', supplier: s, to: await recipientsFor('aviso_inicio'),
    asunto: 'Nuevo registro de proveedor iniciado ' + folio, titulo: 'Un proveedor inició su registro',
    parrafos: ['Se generó un nuevo folio en el portal de proveedores. El expediente estará completo cuando el proveedor lo envíe a revisión.'],
    datos: [['Folio', folio], ['Empresa', s.razon_social], ['País', s.pais], ['Contacto', s.contacto_nombre], ['Correo', s.contacto_email], ['Teléfono', s.contacto_telefono]],
    boton: { texto: 'Abrir el panel', url: adminUrl() } });
  const view = supplierView(s, []); view.clave_acceso = code; return view;
}

async function resumeRegistration(payload) {
  const folio = String(payload.folio || '').trim().toUpperCase(), code = String(payload.codigo || '').trim().toUpperCase();
  const entry = /^PRV-\d{4}-\d{8}$/.test(folio) ? await getOne(ref(COL.folios, folio)) : null;
  if (!entry) throw apiError('Folio o clave de acceso incorrectos.', 401);
  // La clave generada es XXXX-XXXX (sin distinguir mayúsculas); una clave definida con el correo de recuperación va tal cual.
  const typed = String(payload.codigo || '').trim();
  try { await fb.signInWithEmailAndPassword(auth, entry.email, /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(typed) ? code : typed); }
  catch (e) {
    if (e.code === 'auth/too-many-requests') throw mapFirebaseError(e);
    throw apiError('Folio o clave de acceso incorrectos.', 401);
  }
  const s = await currentSupplier();
  await logEvent(s.id, 'proveedor', s.contacto_email, 'acceso_clave', 'Ingreso con folio y clave.');
  return supplierView(s, await docsOf(s.id));
}

async function requestAccess(payload) {
  const folio = String(payload.folio || '').trim().toUpperCase(), email = String(payload.email || '').trim().toLowerCase();
  const answer = { ok: true, mensaje: 'Si el folio y el correo coinciden, te enviaremos un correo para definir una nueva clave de acceso.' };
  if (!/^PRV-\d{4}-\d{8}$/.test(folio) || !emailOk(email)) return answer;
  const entry = await getOne(ref(COL.folios, folio));
  if (entry && entry.email === email) {
    try { await fb.sendPasswordResetEmail(auth, email, { url: portalUrl() }); } catch (e) { try { await fb.sendPasswordResetEmail(auth, email); } catch (x) { /* respuesta genérica */ } }
  }
  return answer;
}

async function saveProgress(s, payload) {
  if (['iniciado', 'correccion'].indexOf(s.estado) < 0) throw apiError('Tu registro ya fue enviado y no se puede modificar.', 409);
  const data = Object.assign({}, s.data || {});
  Object.keys(payload.data || {}).forEach((k) => { if (FIELDS[k]) data[k] = normalizeField(FIELDS[k], payload.data[k]); });
  if (data.pais === 'México' && data.tax_id) data.tax_id = String(data.tax_id).replace(/[\s-]/g, '').toUpperCase();
  data.contacto_email = String(data.contacto_email || '').toLowerCase();
  const patch = { data, razon_social: data.razon_social || '', pais: data.pais || '', contacto_nombre: data.contacto_nombre || '',
    contacto_email: data.contacto_email, contacto_telefono: data.contacto_telefono || '', fecha_actualizacion: nowIso() };
  if (['contacto', 'empresa', 'operacion', 'documentos', 'revision'].indexOf(payload.paso_actual) >= 0) patch.paso_actual = payload.paso_actual;
  await fb.updateDoc(ref(COL.prov, s.id), patch);
  return { ok: true, errores: validateAll(data), guardado_en: patch.fecha_actualizacion, requeridos: requiredDocKeys(data) };
}

function b64ToBytes(b64) { const bin = atob(b64), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function uploadDocument(s, tipo, payload) {
  const def = DOC_TYPES.find((d) => d.key === tipo);
  if (!def) throw apiError('Tipo de documento inválido.', 404);
  const file = payload && payload.archivo;
  if (!file || !file.base64 || !file.nombre) throw apiError('Selecciona un archivo válido.', 400);
  const size = Number(file.tamano || 0);
  if (size <= 0 || size > MAX_UPLOAD_MB * 1048576) throw apiError('El archivo supera el límite de ' + MAX_UPLOAD_MB + ' MB.', 413);
  if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].indexOf(file.mime) < 0) throw apiError('Formato no permitido. Usa PDF, JPG, PNG o WEBP.', 415);
  const docs = await docsOf(s.id), current = currentFrom(docs), required = requiredDocKeys(s.data || {});
  if (['iniciado', 'correccion'].indexOf(s.estado) < 0) throw apiError('El expediente ya no admite cambios.', 409);
  if (!canUpload(s, current, required, tipo)) throw apiError('Solo puedes reemplazar los documentos que tienen corrección solicitada.', 409);
  const huella = await sha256(b64ToBytes(file.base64));
  const cur = current[tipo];
  if (cur && cur.huella === huella && cur.revision !== 'correccion') {
    const same = docPublic(cur); same.duplicado = true; return { documento: same, registro: supplierView(s, docs) };
  }
  const id = newId(), now = nowIso(), partes = Math.ceil(file.base64.length / CHUNK);
  for (let i = 0; i < partes; i++) {
    await fb.setDoc(ref(COL.prov, s.id, 'documentos', id, 'partes', String(i).padStart(3, '0')), { d: file.base64.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
  const version = 1 + docs.filter((d) => d.tipo === tipo).length;
  const clean = String(file.nombre).replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ._ -]/g, '_').slice(0, 160);
  const d = { supplier_id: s.id, tipo, version, es_actual: true, nombre_original: clean, mime: file.mime, tamano: size, huella, partes,
    subido_en: now, tipo_fecha: def.rule, revision: 'pendiente', motivo: '', observaciones: '', revisado_por: null, revisado_en: null, correccion_notificada: true };
  const batch = fb.writeBatch(db);
  docs.filter((x) => x.tipo === tipo && x.es_actual).forEach((x) => { batch.update(ref(COL.prov, s.id, 'documentos', x.id), { es_actual: false }); x.es_actual = false; });
  batch.set(ref(COL.prov, s.id, 'documentos', id), d);
  const entregados = Object.assign({}, s.entregados || {}); entregados[tipo] = version;
  batch.update(ref(COL.prov, s.id), { entregados, fecha_actualizacion: now });
  batch.set(ref(COL.prov, s.id, 'eventos', newId()), { supplier_id: s.id, actor_tipo: 'proveedor', actor: s.contacto_email, accion: 'documento_subido', detalle: def.label + ' v' + version + ' (' + clean + ')', creado_en: now });
  await batch.commit();
  d.id = id; docs.unshift(d); s.entregados = entregados;
  return { documento: docPublic(d), registro: supplierView(s, docs) };
}

async function submitRegistration(s) {
  if (['iniciado', 'correccion'].indexOf(s.estado) < 0) { const v = supplierView(s, await docsOf(s.id)); v.resultado_envio = { ya_enviado: true, estado: s.estado, envios: s.envios || 0 }; return v; }
  const docs = await docsOf(s.id), current = currentFrom(docs), problems = [];
  Object.keys(validateAll(s.data || {})).forEach((k) => problems.push('Completa la sección «' + stepTitle(k) + '».'));
  requiredDocKeys(s.data || {}).forEach((k) => {
    if (!current[k]) problems.push('Falta subir: ' + docLabel(k) + '.');
    else if (current[k].revision === 'correccion') problems.push('Sube la versión corregida de: ' + docLabel(k) + '.');
  });
  if (problems.length) throw apiError('Aún faltan datos o documentos para enviar tu registro.', 422, { envio: problems });
  const wasFix = s.estado === 'correccion', now = nowIso(), envios = (s.envios || 0) + 1;
  const batch = fb.writeBatch(db);
  batch.update(ref(COL.prov, s.id), { estado: 'enviado', envios, fecha_envio: s.fecha_envio || now, fecha_ultimo_envio: now, fecha_actualizacion: now, paso_actual: 'revision' });
  batch.set(ref(COL.prov, s.id, 'eventos', newId()), { supplier_id: s.id, actor_tipo: 'proveedor', actor: s.contacto_email,
    accion: wasFix ? 'correcciones_enviadas' : 'registro_enviado', detalle: wasFix ? 'Correcciones enviadas a revisión (envío ' + envios + ').' : 'Registro enviado a revisión.', creado_en: now });
  await batch.commit();
  Object.assign(s, { estado: 'enviado', envios, fecha_envio: s.fecha_envio || now, fecha_ultimo_envio: now, fecha_actualizacion: now, paso_actual: 'revision' });
  const docRows = requiredDocKeys(s.data || {}).map((k) => [docLabel(k), current[k] ? current[k].nombre_original + ' (v' + current[k].version + ')' : '—']);
  await sendEmail({ tipo: 'confirmacion_envio', audiencia: 'proveedor', supplier: s, to: s.contacto_email,
    asunto: (wasFix ? 'Recibimos tus correcciones ' : 'Recibimos tu registro ') + s.folio, titulo: wasFix ? 'Recibimos tus correcciones' : 'Recibimos tu registro',
    parrafos: [wasFix ? 'Tus documentos corregidos quedaron pendientes de revisión.' : 'Tu expediente quedó enviado y pendiente de revisión por el equipo de Logística de CESANTONI.',
      'Si necesitamos alguna corrección te escribiremos a este correo.'],
    datos: [['Folio', s.folio], ['Empresa', s.razon_social], ['Estado', ESTADOS.enviado]], boton: { texto: 'Consultar mi registro', url: portalUrl() } });
  await sendEmail({ tipo: wasFix ? 'aviso_correcciones' : 'aviso_envio', audiencia: 'interno', supplier: s, to: await recipientsFor('aviso_envio'),
    asunto: (wasFix ? 'Correcciones reenviadas ' : 'Registro enviado a revisión ') + s.folio,
    titulo: wasFix ? 'Un proveedor reenvió sus correcciones' : 'Un proveedor envió su registro a revisión',
    parrafos: ['El expediente está listo para revisión en el panel de proveedores.'],
    datos: [['Folio', s.folio], ['Empresa', s.razon_social], ['País', s.pais], ['Contacto', s.contacto_nombre], ['Correo', s.contacto_email], ['Envío número', String(envios)]].concat(docRows),
    boton: { texto: 'Revisar expediente', url: adminUrl() } });
  const v = supplierView(s, docs); v.resultado_envio = { ya_enviado: false, estado: 'enviado', envios }; return v;
}

async function regenerateCode(s) {
  const code = newCode();
  try { await fb.updatePassword(auth.currentUser, code); }
  catch (e) {
    if (e.code === 'auth/requires-recent-login') throw apiError('Por seguridad, sal y vuelve a entrar con tu folio y clave para generar una nueva.', 409);
    throw e;
  }
  await logEvent(s.id, 'proveedor', s.contacto_email, 'clave_regenerada', 'Se generó una nueva clave de acceso.');
  return { clave_acceso: code };
}

/* ------------------------------------------------------------------ personal (panel) */
let adminCache = null;
async function currentAdmin() {
  await ready;
  const u = auth && auth.currentUser;
  if (!u) throw apiError('Tu sesión terminó. Inicia sesión de nuevo.', 401);
  const a = await getOne(ref(COL.admins, u.uid)).catch(() => null);
  if (!a || a.activo === false) { await fb.signOut(auth).catch(() => null); throw apiError('Tu sesión terminó. Inicia sesión de nuevo.', 401); }
  adminCache = a;
  return a;
}
const requireAdminRole = (a) => { if (a.rol !== 'admin') throw apiError('Esta acción requiere rol de administrador.', 403); };
const adminPublic = (u) => ({ id: u.id, usuario: u.email, nombre: u.nombre, email: u.email || '', rol: u.rol || 'revisor', activo: u.activo !== false,
  debe_cambiar: !!u.debe_cambiar, ultimo_acceso: u.ultimo_acceso || null, creado_en: u.creado_en });
const passwordOk = (p) => String(p).length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);

async function adminLogin(payload) {
  const email = String(payload.usuario || '').trim().toLowerCase(), pass = String(payload.password || '');
  if (!emailOk(email)) throw apiError('Escribe el correo con el que te dieron de alta.', 400);
  try { await fb.signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { if (e.code === 'auth/too-many-requests') throw mapFirebaseError(e); throw apiError('Correo o contraseña incorrectos.', 401); }
  const a = await getOne(ref(COL.admins, auth.currentUser.uid)).catch(() => null);
  if (!a || a.activo === false) { await fb.signOut(auth); throw apiError('Esta cuenta no tiene acceso al panel.', 403); }
  await fb.updateDoc(ref(COL.admins, a.id), { ultimo_acceso: nowIso() });
  return adminPublic(a);
}
async function firstAdmin(payload) {
  const email = String(payload.email || '').trim().toLowerCase(), nombre = String(payload.nombre || '').trim(), pass = String(payload.password || '');
  if (!emailOk(email) || !nombre || !passwordOk(pass)) throw apiError('Escribe nombre, correo y una contraseña de al menos 10 caracteres con letras y números.', 400);
  if (await getOne(ref(COL.config, 'bootstrap'))) throw apiError('La plataforma ya tiene administrador. Inicia sesión.', 409);
  let cred;
  try { cred = await fb.createUserWithEmailAndPassword(auth, email, pass); }
  catch (e) { if (e.code !== 'auth/email-already-in-use') throw e; cred = await fb.signInWithEmailAndPassword(auth, email, pass); }
  const uid = cred.user.uid, now = nowIso();
  const batch = fb.writeBatch(db);
  batch.set(ref(COL.admins, uid), { email, nombre, rol: 'admin', activo: true, debe_cambiar: false, creado_en: now, ultimo_acceso: now });
  batch.set(ref(COL.config, 'bootstrap'), { creado_en: now, por: uid });
  await batch.commit();
  return adminPublic({ id: uid, email, nombre, rol: 'admin', activo: true, creado_en: now });
}
async function createStaff(payload) {
  const email = String(payload.email || payload.usuario || '').trim().toLowerCase(), nombre = String(payload.nombre || '').trim(), pass = String(payload.password || '');
  if (!emailOk(email) || !nombre || !passwordOk(pass)) throw apiError('Revisa correo, nombre y contraseña temporal (mínimo 10 caracteres con letras y números).', 400);
  /* Se crea la cuenta en una instancia secundaria para no cerrar la sesión del administrador. */
  const second = fb.initializeApp(CFG.firebase, 'alta-' + Date.now());
  const a2 = fb.getAuth(second); connectEmulators(a2, null);
  let uid;
  try { uid = (await fb.createUserWithEmailAndPassword(a2, email, pass)).user.uid; }
  catch (e) { if (e.code === 'auth/email-already-in-use') throw apiError('Ya existe una cuenta con ese correo.', 409); throw e; }
  finally { try { await fb.signOut(a2); } catch (e) { /* nada */ } }
  const u = { email, nombre, rol: payload.rol === 'admin' ? 'admin' : 'revisor', activo: true, debe_cambiar: true, creado_en: nowIso(), ultimo_acceso: null };
  await fb.setDoc(ref(COL.admins, uid), u);
  u.id = uid; return adminPublic(u);
}
async function updateStaff(actor, id, body) {
  const u = await getOne(ref(COL.admins, id));
  if (!u) throw apiError('Usuario no encontrado.', 404);
  const rol = body.rol === 'admin' ? 'admin' : 'revisor', activo = body.activo !== false;
  if (actor.id === id && (!activo || rol !== 'admin')) throw apiError('No puedes desactivar ni quitar tu propio rol de administrador.', 409);
  await fb.updateDoc(ref(COL.admins, id), { nombre: String(body.nombre || u.nombre).trim(), rol, activo });
  if (body.restablecer) await fb.sendPasswordResetEmail(auth, u.email);
  return adminPublic(Object.assign(u, { nombre: String(body.nombre || u.nombre).trim(), rol, activo }));
}
async function changePassword(a, body) {
  const actual = String(body.actual || ''), nueva = String(body.nueva || '');
  if (!passwordOk(nueva)) throw apiError('La nueva contraseña debe tener al menos 10 caracteres, con letras y números.', 400);
  if (nueva === actual) throw apiError('La nueva contraseña debe ser distinta de la actual.', 400);
  try { await fb.reauthenticateWithCredential(auth.currentUser, fb.EmailAuthProvider.credential(auth.currentUser.email, actual)); }
  catch (e) { throw apiError('La contraseña actual no es correcta.', 403); }
  await fb.updatePassword(auth.currentUser, nueva);
  await fb.updateDoc(ref(COL.admins, a.id), { debe_cambiar: false });
  return { ok: true };
}

function summaryDocs(s) {
  const required = requiredDocKeys(s.data || {}), ent = s.entregados || {}, rev = s.revisiones || {}, detalle = {};
  required.forEach((k) => {
    if (!ent[k]) { detalle[k] = null; return; }
    const r = rev[k] && rev[k].version === ent[k] ? rev[k].revision : 'pendiente';
    detalle[k] = { revision: r, validacion: 'revision_manual', version: ent[k] };
  });
  const delivered = required.filter((k) => detalle[k]);
  return { requeridos: required.length, entregados: delivered.length, detalle, pendientes: required.filter((k) => !detalle[k]).map(docLabel),
    aprobados: delivered.filter((k) => detalle[k].revision === 'aprobado').length, correccion: delivered.filter((k) => detalle[k].revision === 'correccion').length,
    revision_manual: delivered.length };
}
function supplierSummary(s) {
  const data = s.data || {};
  return { id: s.id, folio: s.folio, razon_social: s.razon_social, nombre_comercial: data.nombre_comercial || '', tax_id: data.tax_id || '',
    contacto_nombre: s.contacto_nombre, contacto_email: s.contacto_email, contacto_telefono: s.contacto_telefono, pais: s.pais,
    cobertura_nacional: data.cobertura_nacional || [], cobertura_internacional: data.cobertura_internacional || [], servicios: data.servicios || [],
    estado: s.estado, fecha_inicio: s.fecha_inicio, fecha_envio: s.fecha_envio, fecha_ultimo_envio: s.fecha_ultimo_envio, fecha_actualizacion: s.fecha_actualizacion,
    resultado_revision: s.resultado_revision, responsable: s.responsable_nombre || '', observaciones: s.observaciones || '', data, documentos: summaryDocs(s) };
}
function filterSuppliers(all, p) {
  const q = String(p.q || '').toLowerCase();
  return all.filter((s) => {
    const d = s.data || {}, intl = d.cobertura_internacional || [];
    if (q && [s.folio, s.razon_social, d.nombre_comercial, d.tax_id, s.contacto_nombre, s.contacto_email].join(' ').toLowerCase().indexOf(q) < 0) return false;
    if (p.pais && s.pais !== p.pais) return false;
    if (p.estado && s.estado !== p.estado) return false;
    if (p.resultado && s.resultado_revision !== p.resultado) return false;
    if (p.servicio && (d.servicios || []).indexOf(p.servicio) < 0) return false;
    if (p.cobertura === 'nacional' && intl.length) return false;
    if (p.cobertura === 'centroamerica' && !intl.length) return false;
    if (p.cobertura && p.cobertura !== 'nacional' && p.cobertura !== 'centroamerica' && intl.indexOf(p.cobertura) < 0) return false;
    if (p.desde || p.hasta) {
      const day = localDay(p.fecha_campo === 'finalizacion' ? s.fecha_envio : s.fecha_inicio);
      if (!day || (p.desde && day < p.desde) || (p.hasta && day > p.hasta)) return false;
    }
    return true;
  });
}
function sortSuppliers(list, orden) {
  const by = {
    folio: (a, b) => String(b.folio).localeCompare(String(a.folio)),
    empresa: (a, b) => String(a.razon_social || '').localeCompare(String(b.razon_social || ''), 'es'),
    inicio: (a, b) => String(b.fecha_inicio || '').localeCompare(String(a.fecha_inicio || '')),
    finalizacion: (a, b) => String(b.fecha_envio || '').localeCompare(String(a.fecha_envio || ''))
  }[orden] || ((a, b) => String(b.fecha_actualizacion || '').localeCompare(String(a.fecha_actualizacion || '')));
  return list.sort(by);
}
async function querySuppliers(p) {
  const all = await getAll(coll(COL.prov));
  const filtered = sortSuppliers(filterSuppliers(all, p), p.orden), counts = {};
  Object.keys(ESTADOS).forEach((k) => { counts[k] = all.filter((s) => s.estado === k).length; });
  const size = Math.min(Math.max(Number(p.por_pagina || 25), 5), 5000), page = Math.max(Number(p.pagina || 1), 1), start = (page - 1) * size;
  return { items: filtered.slice(start, start + size).map(supplierSummary), total: filtered.length, pagina: page,
    paginas: Math.max(1, Math.ceil(filtered.length / size)), por_pagina: size, conteos: counts };
}
const emailPublic = (e) => { const o = Object.assign({}, e); try { o.contenido = JSON.parse(e.contenido || '{}'); } catch (x) { o.contenido = {}; } return o; };
async function adminDetail(s, extra) {
  const admins = await getAll(coll(COL.admins)), names = {};
  admins.forEach((a) => { names[a.id] = a.nombre; });
  const docs = (await docsOf(s.id)).map((d) => Object.assign({}, d, { id: s.id + '~' + d.id, revisado_por_nombre: names[d.revisado_por] || '', drive_url: '',
    fecha_servidor: localDay(d.subido_en), metodo_lectura: 'revision_manual', certeza: '', validacion: 'revision_manual',
    validacion_detalle: 'Documento recibido. La fecha y la vigencia se revisan manualmente.' }));
  const current = currentFrom(docs);
  const prov = Object.assign({}, s, { responsable_nombre: s.responsable_id ? (names[s.responsable_id] || s.responsable_nombre || '') : '' });
  const out = { proveedor: prov, data: s.data || {}, requeridos: requiredDocKeys(s.data || {}), documentos: docs, revisiones: [],
    eventos: (await getAll(coll(COL.prov, s.id, 'eventos'))).sort(byDateDesc),
    correos: (await getAll(fb.query(coll(COL.correos), fb.where('supplier_id', '==', s.id)))).sort(byDateDesc).map(emailPublic),
    pendientes_notificar: Object.keys(current).filter((k) => current[k].revision === 'correccion' && current[k].correccion_notificada === false).length,
    responsables: admins.filter((a) => a.activo !== false).map((a) => ({ id: a.id, nombre: a.nombre, usuario: a.email })), errores: validateAll(s.data || {}) };
  if (extra) out.resultado = extra;
  return out;
}
async function getSupplier(id) { const s = await getOne(ref(COL.prov, id)); if (!s) throw apiError('Proveedor no encontrado.', 404); return s; }
function splitDocId(id) { const [uid, docId] = String(id).split('~'); if (!uid || !docId) throw apiError('Documento no encontrado.', 404); return [uid, docId]; }

async function notifyPending(a, s, docs) {
  const cur = currentFrom(docs);
  const pending = Object.values(cur).filter((d) => d.revision === 'correccion' && d.correccion_notificada === false);
  if (!pending.length) return 0;
  const batch = fb.writeBatch(db), now = nowIso();
  pending.forEach((d) => { batch.update(ref(COL.prov, s.id, 'documentos', d.id), { correccion_notificada: true }); d.correccion_notificada = true; });
  batch.update(ref(COL.prov, s.id), { estado: 'correccion', fecha_actualizacion: now });
  batch.set(ref(COL.prov, s.id, 'eventos', newId()), { supplier_id: s.id, actor_tipo: 'admin', actor: a.email, accion: 'correccion_notificada',
    detalle: 'Aviso de corrección enviado: ' + pending.map((d) => docLabel(d.tipo)).join(', ') + '.', creado_en: now });
  await batch.commit();
  s.estado = 'correccion';
  await sendEmail({ tipo: 'correccion', audiencia: 'proveedor', supplier: s, to: s.contacto_email,
    asunto: 'Corrección solicitada en tu registro ' + s.folio, titulo: 'Necesitamos algunas correcciones',
    parrafos: ['Revisamos tu expediente y necesitamos que sustituyas los siguientes documentos.',
      'Entra al portal con tu folio y tu clave, sube la versión corregida y envía tus correcciones. Los demás documentos se conservan.'],
    datos: [['Folio', s.folio]].concat(pending.map((d) => [docLabel(d.tipo), d.motivo + (d.observaciones ? ' — ' + d.observaciones : '')])),
    boton: { texto: 'Atender correcciones', url: portalUrl() } });
  return pending.length;
}
const doneRequests = new Map();
async function reviewDocument(a, fullId, p) {
  if (p.request_id && doneRequests.has(p.request_id)) { const [u0] = splitDocId(fullId); return adminDetail(await getSupplier(u0), doneRequests.get(p.request_id)); }
  const [uid, docId] = splitDocId(fullId);
  const s = await getSupplier(uid), d = await getOne(ref(COL.prov, uid, 'documentos', docId));
  if (!d) throw apiError('Documento no encontrado.', 404);
  let action = { aprobar: 'aprobado', rechazar: 'rechazado', correccion: 'correccion' }[p.accion] || p.accion;
  if (['aprobado', 'rechazado', 'correccion'].indexOf(action) < 0) throw apiError('Acción de revisión inválida.', 400);
  const motivo = String(p.motivo || '').trim().slice(0, 1000), obs = String(p.observaciones || '').trim().slice(0, 2000);
  if (action !== 'aprobado' && !motivo) throw apiError('Escribe el motivo.', 400);
  if (!d.es_actual) throw apiError('Solo se revisa la versión vigente del documento.', 409);
  if (s.estado === 'iniciado') throw apiError('La revisión se habilita cuando el proveedor envía su registro.', 409);
  const now = nowIso(), batch = fb.writeBatch(db);
  batch.update(ref(COL.prov, uid, 'documentos', docId), { revision: action, motivo, observaciones: obs, revisado_por: a.id, revisado_en: now, correccion_notificada: action !== 'correccion' });
  const revisiones = Object.assign({}, s.revisiones || {}); revisiones[d.tipo] = { revision: action, version: d.version };
  const patch = { revisiones, fecha_actualizacion: now };
  if (s.estado === 'enviado') patch.estado = 'en_revision';
  batch.update(ref(COL.prov, uid), patch);
  batch.set(ref(COL.prov, uid, 'eventos', newId()), { supplier_id: uid, actor_tipo: 'admin', actor: a.email,
    accion: { aprobado: 'documento_aprobado', rechazado: 'documento_rechazado', correccion: 'documento_correccion' }[action],
    detalle: docLabel(d.tipo) + ' v' + d.version + (motivo ? ': ' + motivo : ''), creado_en: now });
  await batch.commit();
  Object.assign(s, patch);
  const result = { accion: action, notificados: 0 };
  if (action === 'correccion' && p.notificar !== false) result.notificados = await notifyPending(a, s, await docsOf(uid));
  if (p.request_id) doneRequests.set(p.request_id, result);
  return adminDetail(await getSupplier(uid), result);
}
async function updateSupplierReview(a, s, p) {
  let result = s.resultado_revision || 'pendiente';
  if (p.resultado_revision !== undefined && s.estado !== 'iniciado') result = p.resultado_revision;
  if (!RESULTADOS[result]) throw apiError('Resultado no válido.', 400);
  const patch = {}, changes = [];
  if (result === 'aprobado' && s.resultado_revision !== 'aprobado') {
    const cur = currentFrom(await docsOf(s.id));
    const missing = requiredDocKeys(s.data || {}).filter((k) => !cur[k] || cur[k].revision !== 'aprobado');
    if (missing.length) throw apiError('Todos los documentos requeridos deben estar aprobados. Pendientes: ' + missing.map(docLabel).join(', ') + '.', 409);
    patch.estado = 'aprobado'; patch.fecha_resolucion = nowIso();
  } else if (result === 'rechazado' && s.resultado_revision !== 'rechazado') { patch.estado = 'rechazado'; patch.fecha_resolucion = nowIso(); }
  else if ((result === 'pendiente' || result === 'con_observaciones') && ['enviado', 'aprobado', 'rechazado'].indexOf(s.estado) >= 0) { patch.estado = 'en_revision'; patch.fecha_resolucion = null; }
  if (result !== s.resultado_revision) changes.push('Resultado: ' + RESULTADOS[result]);
  patch.resultado_revision = result;
  if (p.observaciones !== undefined) { const o = String(p.observaciones || '').slice(0, 4000); if (o !== (s.observaciones || '')) changes.push('Observaciones actualizadas'); patch.observaciones = o; }
  if (p.responsable_id !== undefined) {
    const rid = p.responsable_id ? String(p.responsable_id) : null, resp = rid ? await getOne(ref(COL.admins, rid)) : null;
    if (rid && !resp) throw apiError('Responsable no válido.', 400);
    if (rid !== (s.responsable_id || null)) changes.push('Responsable: ' + (resp ? resp.nombre : 'Sin asignar'));
    patch.responsable_id = rid; patch.responsable_nombre = resp ? resp.nombre : '';
  }
  patch.fecha_actualizacion = nowIso();
  const batch = fb.writeBatch(db);
  batch.update(ref(COL.prov, s.id), patch);
  batch.set(ref(COL.prov, s.id, 'eventos', newId()), { supplier_id: s.id, actor_tipo: 'admin', actor: a.email, accion: 'revision_actualizada', detalle: changes.join('. ') || 'Sin cambios.', creado_en: nowIso() });
  await batch.commit();
  return adminDetail(Object.assign(s, patch));
}
async function documentContent(fullId) {
  const [uid, docId] = splitDocId(fullId);
  const d = await getOne(ref(COL.prov, uid, 'documentos', docId));
  if (!d) throw apiError('Documento no encontrado.', 404);
  const parts = (await getAll(coll(COL.prov, uid, 'documentos', docId, 'partes'))).sort((x, y) => x.id.localeCompare(y.id));
  if (parts.length !== d.partes) throw apiError('El archivo está incompleto en la base de datos.', 500);
  return { nombre: d.nombre_original, mime: d.mime, tamano: d.tamano, base64: parts.map((x) => x.d).join(''), miniatura: '' };
}
async function emailsList(p) {
  const all = await getAll(coll(COL.correos)), q = String(p.q || '').toLowerCase(), counts = {};
  all.forEach((e) => { counts[e.estado] = (counts[e.estado] || 0) + 1; });
  const items = all.filter((e) => (!p.estado || e.estado === p.estado) && (!q || [e.folio, e.destinatarios, e.asunto].join(' ').toLowerCase().indexOf(q) >= 0))
    .sort(byDateDesc).slice(0, 500).map(emailPublic);
  return { items, conteos: counts, tipos: EMAIL_TIPOS, backend: 'emailjs', backend_label: 'EmailJS (plan gratuito)', configurado: emailConfigured(), cuota_restante: null };
}
async function retryEmail(e) {
  if (e.estado === 'enviado') return emailPublic(e);
  const c = JSON.parse(e.contenido || '{}');
  c.asunto = e.asunto;
  if (c.secreto) {
    c.datos = (c.datos || []).filter((r) => r[0] !== 'Clave de acceso');
    c.nota = 'Por seguridad este reenvío no incluye la clave. Si no la tienes, en el portal elige «No tengo mi clave».';
  }
  let to = e.destinatarios;
  if (e.audiencia === 'interno' && !String(to || '').trim()) to = (await recipientsFor(e.tipo === 'aviso_inicio' ? 'aviso_inicio' : 'aviso_envio')).join(', ');
  const patch = { destinatarios: to || '', intentos: Number(e.intentos || 0) + 1 };
  if (!patch.destinatarios) patch.ultimo_error = 'No hay destinatarios internos activos para este aviso.';
  else {
    try { await deliver(patch.destinatarios.replace(/\s/g, ''), c); patch.estado = 'enviado'; patch.enviado_en = nowIso(); patch.ultimo_error = ''; }
    catch (x) { patch.estado = 'error'; patch.ultimo_error = String(x.message || x).slice(0, 500); }
  }
  await fb.updateDoc(ref(COL.correos, e.id), patch);
  return emailPublic(Object.assign(e, patch));
}
async function saveRecipient(id, body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!emailOk(email)) throw apiError('Escribe un correo válido.', 400);
  const all = await getAll(coll(COL.dest));
  if (all.some((r) => r.email === email && r.id !== id)) throw apiError('Ese correo ya está registrado.', 409);
  const prev = id ? all.find((r) => r.id === id) : null;
  if (id && !prev) throw apiError('Destinatario no encontrado.', 404);
  id = id || newId();
  const r = { nombre: String(body.nombre || '').trim().slice(0, 120), email, aviso_inicio: !!body.aviso_inicio, aviso_envio: !!body.aviso_envio,
    activo: body.activo !== false, creado_en: (prev && prev.creado_en) || nowIso() };
  await fb.setDoc(ref(COL.dest, id), r);
  return Object.assign({ id }, r);
}
async function systemInfo() {
  const all = await getAll(coll(COL.prov)), totals = {};
  Object.keys(ESTADOS).forEach((k) => { totals[k] = all.filter((s) => s.estado === k).length; });
  let bytes = 0;
  try { (await getAll(fb.collectionGroup(db, 'documentos'))).forEach((d) => { bytes += Number(d.tamano || 0); }); } catch (e) { bytes = 0; }
  return { version: APP_VERSION, base_url: portalUrl(), zona_horaria: TZ, fecha_servidor: localDay(nowIso()), ahora_utc: nowIso(),
    correo: { backend: 'emailjs', configurado: emailConfigured(), remitente: 'Cuenta conectada en EmailJS', servidor: 'EmailJS (200 correos al mes gratis)' },
    ocr: { ocr_listo: false, tesseract: 'Sin lectura automática (revisión manual)', idiomas: [], pdftotext: false, pdftoppm: false },
    logos: [{ nombre: 'CESANTONI', instalado: true, archivo: 'img/logo-cesantoni.png (Logo ces nuevo, original)', dimensiones: '487 × 137 px' },
      { nombre: 'Somos Logística', instalado: true, archivo: 'img/logo-somos.png (Logo_Somos_Logistica, original)', dimensiones: '1650 × 1063 px' }],
    almacenamiento: { directorio: 'Firestore (proyecto ' + CFG.firebase.projectId + ')', base_datos_mb: 'Firestore', documentos_mb: (bytes / 1048576).toFixed(1) + ' de 1024 (plan gratuito, total)' },
    reglas: { antiguedad_meses: 3, aviso_vencimiento_dias: 30, confianza_ocr_minima: 0, max_archivo_mb: MAX_UPLOAD_MB },
    totales: totals, estados: ESTADOS, privacidad_url: CFG.privacyUrl || '', cookies_seguras: location.protocol === 'https:' };
}
async function backupJson() {
  const out = { generado_en: nowIso(), version: APP_VERSION, colecciones: {} };
  for (const c of [COL.prov, COL.folios, COL.admins, COL.dest, COL.correos]) out.colecciones[c] = await getAll(coll(c));
  out.colecciones.documentos = []; out.colecciones.eventos = [];
  for (const s of out.colecciones[COL.prov]) {
    out.colecciones.documentos.push(...(await getAll(coll(COL.prov, s.id, 'documentos'))));
    out.colecciones.eventos.push(...(await getAll(coll(COL.prov, s.id, 'eventos'))));
  }
  return out;
}

/* ------------------------------------------------------------------ rutas */
function parseQuery(url) { const q = {}; new URLSearchParams(String(url).split('?')[1] || '').forEach((v, k) => { q[k] = v; }); return q; }
async function route(method, url, body) {
  await ready;
  if (!configured) throw apiError('La plataforma aún no está configurada: faltan los datos de Firebase en js/config.js.', 503);
  const path = String(url).split('?')[0].replace(/\/+$/, ''), query = parseQuery(url);
  let m;
  if (method === 'GET' && path === '/api/portal/config') {
    return { steps: STEPS, doc_types: DOC_TYPES, todaLaRepublica: TODA_LA_REPUBLICA, estados: ESTADOS, resultados: RESULTADOS, validaciones: VALIDACIONES,
      revisiones: REVISIONES, paises: PAISES, centroamerica: CENTROAMERICA, servicios: SERVICIOS, accept: '.pdf,.jpg,.jpeg,.png,.webp',
      privacy_url: CFG.privacyUrl || '', max_upload_mb: MAX_UPLOAD_MB, max_age_months: 3, logos: { cesantoni: true, somos: true }, version: APP_VERSION,
      correo_activo: true };
  }
  if (method === 'POST' && path === '/api/portal/iniciar') return startRegistration(body);
  if (method === 'POST' && path === '/api/portal/continuar') return resumeRegistration(body);
  if (method === 'POST' && path === '/api/portal/enlace') return requestAccess(body);
  if (path === '/api/portal/registro') {
    const s = await currentSupplier();
    if (method === 'GET') return supplierView(s, await docsOf(s.id));
    if (method === 'PUT') return saveProgress(s, body);
  }
  if (method === 'POST' && (m = path.match(/^\/api\/portal\/documentos\/([a-z_]+)$/))) return uploadDocument(await currentSupplier(), m[1], body);
  if (method === 'POST' && path === '/api/portal/enviar') return submitRegistration(await currentSupplier());
  if (method === 'POST' && path === '/api/portal/nueva-clave') return regenerateCode(await currentSupplier());
  if (method === 'POST' && path === '/api/portal/salir') { await fb.signOut(auth); return { ok: true }; }

  if (method === 'GET' && path === '/api/admin/estado-inicial') return { tiene_admin: !!(await getOne(ref(COL.config, 'bootstrap'))) };
  if (method === 'POST' && path === '/api/admin/primer-admin') return firstAdmin(body);
  if (method === 'POST' && path === '/api/admin/recuperar') {
    const email = String(body.email || '').trim().toLowerCase();
    if (emailOk(email)) { try { await fb.sendPasswordResetEmail(auth, email, { url: adminUrl() }); } catch (e) { /* respuesta genérica */ } }
    return { ok: true, mensaje: 'Si el correo tiene acceso al panel, recibirá un enlace para definir una nueva contraseña.' };
  }
  if (method === 'POST' && path === '/api/admin/login') return adminLogin(body);
  if (method === 'POST' && path === '/api/admin/logout') { await fb.signOut(auth); return { ok: true }; }
  const a = await currentAdmin();
  if (method === 'GET' && path === '/api/admin/me') {
    const out = adminPublic(a);
    out.logos = { cesantoni: true, somos: true }; out.correo_configurado = emailConfigured();
    out.pendientes = { por_revisar: (await getAll(fb.query(coll(COL.prov), fb.where('estado', '==', 'enviado')))).length,
      correos_con_error: (await getAll(fb.query(coll(COL.correos), fb.where('estado', '==', 'error')))).length };
    return out;
  }
  if (method === 'GET' && path === '/api/admin/proveedores') return querySuppliers(query);
  if ((m = path.match(/^\/api\/admin\/proveedores\/([^/]+)$/))) {
    const s = await getSupplier(m[1]);
    if (method === 'GET') return adminDetail(s);
    if (method === 'PATCH') return updateSupplierReview(a, s, body);
  }
  if (method === 'POST' && (m = path.match(/^\/api\/admin\/proveedores\/([^/]+)\/notificar-correcciones$/))) {
    const s = await getSupplier(m[1]), n = await notifyPending(a, s, await docsOf(s.id));
    if (!n) throw apiError('No hay correcciones pendientes de notificar.', 409);
    return adminDetail(await getSupplier(s.id), { notificados: n });
  }
  if (method === 'POST' && (m = path.match(/^\/api\/admin\/documentos\/([^/]+)\/revision$/))) return reviewDocument(a, m[1], body);
  if (method === 'GET' && (m = path.match(/^\/api\/admin\/documentos\/([^/]+)\/contenido$/))) return documentContent(m[1]);
  if (method === 'GET' && path === '/api/admin/correos') return emailsList(query);
  if (method === 'POST' && (m = path.match(/^\/api\/admin\/correos\/([^/]+)\/reintentar$/))) {
    const e = await getOne(ref(COL.correos, m[1])); if (!e) throw apiError('Correo no encontrado.', 404); return retryEmail(e);
  }
  if (method === 'POST' && path === '/api/admin/correos/reintentar-todos') {
    const failed = (await getAll(fb.query(coll(COL.correos), fb.where('estado', '==', 'error')))).slice(0, 20);
    let sent = 0;
    for (const e of failed) { if ((await retryEmail(e)).estado === 'enviado') sent++; }
    return { reintentados: failed.length, enviados: sent };
  }
  if (method === 'GET' && path === '/api/admin/destinatarios') return { items: (await getAll(coll(COL.dest))).sort((x, y) => x.email.localeCompare(y.email)) };
  if (method === 'POST' && path === '/api/admin/destinatarios') { requireAdminRole(a); return saveRecipient(null, body); }
  if ((m = path.match(/^\/api\/admin\/destinatarios\/([^/]+)$/))) {
    requireAdminRole(a);
    if (method === 'PUT') return saveRecipient(m[1], body);
    if (method === 'DELETE') { await fb.deleteDoc(ref(COL.dest, m[1])); return { ok: true }; }
  }
  if (method === 'GET' && path === '/api/admin/usuarios') { requireAdminRole(a); return { items: (await getAll(coll(COL.admins))).map(adminPublic) }; }
  if (method === 'POST' && path === '/api/admin/usuarios') { requireAdminRole(a); return createStaff(body); }
  if (method === 'PUT' && (m = path.match(/^\/api\/admin\/usuarios\/([^/]+)$/))) { requireAdminRole(a); return updateStaff(a, m[1], body); }
  if (method === 'POST' && path === '/api/admin/cuenta/password') return changePassword(a, body);
  if (method === 'GET' && path === '/api/admin/sistema') return systemInfo();
  if (method === 'GET' && path === '/api/admin/sistema/respaldo') return backupJson();
  if (method === 'POST' && path === '/api/admin/sistema/correo-prueba') {
    requireAdminRole(a);
    const to = String(body.email || a.email || '').trim();
    if (!emailOk(to)) throw apiError('Escribe un correo válido para la prueba.', 400);
    const r = await sendEmail({ tipo: 'prueba', audiencia: 'interno', to, asunto: 'Prueba del portal de proveedores CESANTONI', titulo: 'Correo de prueba',
      parrafos: ['Este mensaje confirma que el envío de correos del portal de proveedores funciona.'], datos: [['Enviado por', a.nombre]] });
    if (r.estado === 'error') throw apiError('No se pudo enviar: ' + r.ultimo_error, 502);
    return { ok: true, configurado: true, estado: r.estado };
  }
  throw apiError('Función no disponible.', 404);
}

window.CPBackend = {
  ready,
  configured,
  async request(method, url, body) {
    try { return { ok: true, data: await route(String(method || 'GET').toUpperCase(), url, body || {}) }; }
    catch (e) {
      const err = mapFirebaseError(e);
      if (!e.apiStatus) console.warn('Detalle técnico:', e);
      return { ok: false, status: err.apiStatus, error: { detail: err.message, errores: err.apiErrors || {} } };
    }
  }
};
window.dispatchEvent(new Event('cp-backend'));
