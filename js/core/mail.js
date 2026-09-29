/* Correos automáticos por EmailJS (plan gratuito) con dos diseños de tarjeta distintos:
 *  - «proveedor»: confirmación clara para el correo que anotó el proveedor.
 *  - «interno»: tarjeta de alerta para el equipo de CESANTONI.
 * Cada intento queda en la bitácora pv_correos (sin guardar claves de acceso).
 */
import { fb, auth, CFG, COL, ref, col, getAll, now, newId, sha256, baseUrl } from './firebase.js?v=11';
import { emailOk } from './catalog.js?v=11';

const gmailConfigured = () => !!(CFG.correo && /^https:\/\//.test(CFG.correo.url || ''));
const emailjsConfigured = () => !!(CFG.emailjs && CFG.emailjs.publicKey && CFG.emailjs.serviceId && CFG.emailjs.templateId);
export const mailConfigured = () => gmailConfigured() || emailjsConfigured();
export const TIPOS = {
  bienvenida: 'Proveedor · Folio y clave de acceso', recibido: 'Proveedor · Registro recibido', correccion: 'Proveedor · Corrección solicitada',
  correcciones_recibidas: 'Proveedor · Correcciones recibidas', resultado: 'Proveedor · Resultado de la revisión',
  inicio: 'Alerta interna · Registro iniciado', completo: 'Alerta interna · Registro completo enviado', correcciones: 'Alerta interna · Correcciones reenviadas',
  prueba: 'Correo de prueba'
};

const e = (s) => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const img = (f) => new URL('img/' + f, baseUrl()).href;
const LOGOS = '<img src="' + img('logo-cesantoni.png') + '" alt="CESANTONI" width="140" style="display:inline-block;vertical-align:middle;border:0;height:auto">' +
  '<span style="display:inline-block;width:1px;height:38px;background:#D2D7DF;margin:0 14px;vertical-align:middle"></span>' +
  '<img src="' + img('logo-somos.png') + '" alt="Somos Logística CESANTONI" width="120" style="display:inline-block;vertical-align:middle;border:0;height:auto">';
const FONT = "font-family:Montserrat,'Segoe UI',Arial,sans-serif";
const btn = (b, color) => b ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="border-radius:10px;background:' + color + '">' +
  '<a href="' + e(b.url) + '" style="display:inline-block;padding:13px 24px;color:#fff;text-decoration:none;font-weight:700;font-size:14px;' + FONT + '">' + e(b.texto) + ' &rarr;</a></td></tr></table>' : '';
const rows = (datos, bg) => (datos || []).length ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + bg + ';border-radius:12px;margin:16px 0">' +
  datos.map((r) => '<tr><td style="padding:9px 16px;font-size:12.5px;color:#5F6776;width:40%;' + FONT + '">' + e(r[0]) + '</td><td style="padding:9px 16px;font-size:14px;font-weight:700;color:#16181D;' + FONT + '">' + e(r[1]) + '</td></tr>').join('') + '</table>' : '';

/* Tarjeta para el proveedor: limpia, con folio destacado. */
function cardProveedor(c) {
  return '<div style="background:#F4F5F7;padding:28px 12px;' + FONT + '"><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #E3E6EB">' +
    '<tr><td style="padding:22px 28px;border-bottom:1px solid #E3E6EB">' + LOGOS + '</td></tr>' +
    '<tr><td style="padding:28px">' +
    (c.folio ? '<div style="display:inline-block;background:#FDF3EA;color:#B95D1C;border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700;letter-spacing:1px">FOLIO ' + e(c.folio) + '</div>' : '') +
    '<h1 style="margin:14px 0 10px;font-family:Antonio,\'Arial Narrow\',Arial,sans-serif;font-size:32px;line-height:1.1;color:#16181D">' + e(c.titulo) + '</h1>' +
    (c.parrafos || []).map((p) => '<p style="margin:0 0 12px;font-size:14.5px;line-height:1.6;color:#3A404B">' + e(p) + '</p>').join('') +
    rows(c.datos, '#F9FAFB') +
    ((c.lista || []).length ? '<ul style="margin:0 0 12px;padding-left:18px;font-size:14px;color:#3A404B;line-height:1.7">' + c.lista.map((x) => '<li>' + e(x) + '</li>').join('') + '</ul>' : '') +
    btn(c.boton, '#D77129') +
    (c.nota ? '<p style="margin:14px 0 0;font-size:12.5px;color:#5F6776">' + e(c.nota) + '</p>' : '') +
    '</td></tr><tr><td style="padding:16px 28px;background:#F9FAFB;border-top:1px solid #E3E6EB;font-size:12px;color:#5F6776">CESANTONI | Somos Logística · Registro de proveedores de transporte</td></tr></table></div>';
}

/* Tarjeta de alerta interna: franja oscura con etiqueta de alerta y resumen para revisar. */
function cardInterno(c) {
  const color = { completo: '#1D7F52', correcciones: '#5B4CC4', inicio: '#2A68A8', prueba: '#2A68A8' }[c.tipo] || '#D77129';
  return '<div style="background:#E9ECF1;padding:28px 12px;' + FONT + '"><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:18px;overflow:hidden">' +
    '<tr><td style="padding:18px 28px;background:#fff">' + LOGOS + '</td></tr>' +
    '<tr><td style="padding:22px 28px;background:#1B2330;color:#fff">' +
    '<div style="display:inline-block;background:' + color + ';color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:1.4px">' + e(c.etiqueta || 'ALERTA') + '</div>' +
    '<h1 style="margin:12px 0 4px;font-family:Antonio,\'Arial Narrow\',Arial,sans-serif;font-size:30px;line-height:1.1;color:#fff">' + e(c.titulo) + '</h1>' +
    (c.folio ? '<div style="font-size:14px;color:#C9D2DE">Folio <b style="color:#fff">' + e(c.folio) + '</b></div>' : '') + '</td></tr>' +
    '<tr><td style="padding:24px 28px">' +
    (c.parrafos || []).map((p) => '<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3A404B">' + e(p) + '</p>').join('') +
    rows(c.datos, '#F4F5F7') +
    ((c.lista || []).length ? '<p style="margin:14px 0 6px;font-size:12px;font-weight:700;letter-spacing:1px;color:#5F6776">DOCUMENTOS</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
      c.lista.map((x) => '<tr><td style="padding:6px 0;font-size:13.5px;color:#16181D;border-bottom:1px solid #EEF0F3">&#10003;&nbsp; ' + e(x) + '</td></tr>').join('') + '</table>' : '') +
    btn(c.boton, '#1B2330') +
    '</td></tr><tr><td style="padding:14px 28px;background:#F4F5F7;font-size:12px;color:#5F6776">Aviso automático del portal de proveedores · no respondas a este correo.</td></tr></table></div>';
}

function texto(c) {
  const l = [c.titulo, c.folio ? 'Folio: ' + c.folio : '', ''].concat(c.parrafos || []);
  (c.datos || []).forEach((r) => l.push(r[0] + ': ' + r[1]));
  (c.lista || []).forEach((x) => l.push('- ' + x));
  if (c.boton) l.push('', c.boton.texto + ': ' + c.boton.url);
  if (c.nota) l.push('', c.nota);
  return l.filter((x, i) => x !== '' || i > 1).join('\n');
}

/* Gmail por Apps Script (principal, ~100 destinatarios al día). */
async function porGmail(to, c, html, proveedorId) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sin sesión para enviar por Gmail.');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(CFG.correo.url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: await user.getIdToken(), to, subject: c.asunto, html, text: texto(c), proveedor_id: proveedorId || '' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'respuesta ' + r.status);
  } finally { clearTimeout(t); }
}
/* EmailJS (respaldo, 200 al mes). */
async function porEmailJS(to, c, html) {
  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: CFG.emailjs.serviceId, template_id: CFG.emailjs.templateId, user_id: CFG.emailjs.publicKey,
      template_params: { to_email: to, subject: c.asunto, html, message: texto(c) } })
  });
  if (!r.ok) throw new Error('EmailJS respondió ' + r.status + ': ' + (await r.text()).slice(0, 180));
}
/* Intenta Gmail y, si no se puede, EmailJS. Devuelve el medio usado. */
async function deliver(to, c, proveedorId) {
  if (!mailConfigured()) throw new Error('El envío de correos no está configurado (js/config.js).');
  const html = c.plantilla === 'interno' ? cardInterno(c) : cardProveedor(c);
  const fallas = [];
  if (gmailConfigured()) {
    try { await porGmail(to, c, html, proveedorId); return 'gmail'; } catch (err) { fallas.push('Gmail: ' + (err.name === 'AbortError' ? 'sin respuesta' : err.message)); }
  }
  if (emailjsConfigured()) {
    try { await porEmailJS(to, c, html); return 'emailjs'; } catch (err) { fallas.push(err.message); }
  }
  throw new Error(fallas.join(' · '));
}

function guardable(c) {
  const copia = { plantilla: c.plantilla, tipo: c.tipo, titulo: c.titulo, folio: c.folio || '', etiqueta: c.etiqueta || '', parrafos: c.parrafos || [],
    datos: c.datos || [], lista: c.lista || [], boton: c.boton || null, nota: c.nota || '', secreto: !!c.secreto };
  if (c.secreto) copia.datos = copia.datos.map((r) => (r[0] === 'Clave de acceso' ? [r[0], '(oculta por seguridad)'] : r));
  return copia;
}

export async function destinatarios(aviso) {
  try { return (await getAll(col(COL.dest))).filter((r) => r.activo !== false && r.avisos && r.avisos[aviso] && emailOk(r.correo)).map((r) => r.correo); }
  catch (err) { return []; }
}

const recientes = new Map();
/* Envía un correo y deja constancia. Un aviso idéntico no se repite en 10 minutos. */
export async function enviar(c) {
  const para = [...new Set((Array.isArray(c.para) ? c.para : [c.para]).map((x) => String(x || '').trim().toLowerCase()).filter(emailOk))];
  const reg = { tipo: c.tipo, plantilla: c.plantilla, proveedor_id: c.proveedorId || null, folio: c.folio || '', para: para.join(', '), asunto: c.asunto,
    contenido: JSON.stringify(guardable(c)), estado: 'pendiente', intentos: 0, error: '', creado_en: now(), enviado_en: null };
  const llave = await sha256([reg.tipo, reg.proveedor_id, reg.para, reg.asunto, reg.contenido].join('|'));
  if (recientes.has(llave) && Date.now() - recientes.get(llave) < 600000) return { estado: 'duplicado' };
  recientes.set(llave, Date.now());
  if (!para.length) {
    reg.estado = 'error';
    reg.error = c.plantilla === 'interno' ? 'No hay destinatarios internos activos para esta alerta (Panel > Destinatarios).' : 'Correo del destinatario no válido.';
  } else {
    reg.intentos = 1;
    try { reg.medio = await deliver(para.join(','), c, reg.proveedor_id); reg.estado = 'enviado'; reg.enviado_en = now(); }
    catch (err) { reg.estado = 'error'; reg.error = String(err.message || err).slice(0, 400); recientes.delete(llave); }
  }
  const id = newId();
  try { await fb.setDoc(ref(COL.correos, id), reg); } catch (err) { /* la bitácora no debe detener el flujo */ }
  return { id, ...reg };
}

/* Reintento desde el panel. Los correos con clave se reenvían sin la clave. */
export async function reintentar(reg) {
  if (reg.estado === 'enviado') return reg;
  const c = JSON.parse(reg.contenido || '{}');
  c.asunto = reg.asunto;
  if (c.secreto) { c.datos = (c.datos || []).filter((r) => r[0] !== 'Clave de acceso'); c.nota = 'Por seguridad este reenvío no incluye la clave. Si no la tienes, en el portal elige «Olvidé mi clave».'; }
  let para = reg.para;
  if (c.plantilla === 'interno' && !String(para || '').trim()) para = (await destinatarios(c.tipo === 'inicio' ? 'inicio' : 'envio')).join(', ');
  const patch = { para: para || '', intentos: Number(reg.intentos || 0) + 1 };
  if (!patch.para) patch.error = 'No hay destinatarios activos para esta alerta.';
  else {
    try { patch.medio = await deliver(patch.para.replace(/\s/g, ''), c, reg.proveedor_id); patch.estado = 'enviado'; patch.enviado_en = now(); patch.error = ''; }
    catch (err) { patch.estado = 'error'; patch.error = String(err.message || err).slice(0, 400); }
  }
  await fb.updateDoc(ref(COL.correos, reg.id), patch);
  return { ...reg, ...patch };
}

export function vistaPrevia(reg) {
  const c = JSON.parse(reg.contenido || '{}');
  return c.plantilla === 'interno' ? cardInterno(c) : cardProveedor(c);
}
