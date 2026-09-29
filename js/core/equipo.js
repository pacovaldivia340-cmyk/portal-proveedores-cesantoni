/* Operaciones del equipo interno (panel). Las reglas de Firestore limitan todo al personal activo. */
import { fb, auth, db, CFG, COL, ref, col, getOne, getAll, where, now, newId, emulate, portalUrl, panelUrl, AppError } from './firebase.js?v=11';
import { DOCS, ESTADOS, REVISION, ALERTAS, docLabel, requeridos, emailOk } from './catalog.js?v=11';
import { enviar as enviarCorreo, reintentar as reintentarCorreo } from './mail.js?v=11';
import { diasDesde, diasHasta } from './ui.js?v=11';

const claveOk = (p) => String(p).length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
const CLAVE_MSG = 'La contraseña debe tener al menos 10 caracteres, con letras y números.';
let yoCache = null;

async function nota(uid, tipo, texto) {
  await fb.setDoc(ref(COL.prov, uid, 'historial', newId()), { tipo, texto, actor: yoCache ? yoCache.nombre : '', actor_tipo: 'equipo', creado_en: now() });
}

export async function tieneAdmin() { return !!(await getOne(ref(COL.config, 'inicio'))); }

export async function primerAdmin({ nombre, correo, clave }) {
  correo = String(correo || '').trim().toLowerCase(); nombre = String(nombre || '').trim();
  if (!nombre || !emailOk(correo)) throw new AppError('Escribe tu nombre y un correo válido.', 400);
  if (!claveOk(clave)) throw new AppError(CLAVE_MSG, 400);
  if (await tieneAdmin()) throw new AppError('El panel ya tiene administrador. Inicia sesión.', 409);
  let cred;
  try { cred = await fb.createUserWithEmailAndPassword(auth, correo, clave); }
  catch (e) { if (e.code !== 'auth/email-already-in-use') throw e; cred = await fb.signInWithEmailAndPassword(auth, correo, clave); }
  const t = now(), b = fb.writeBatch(db);
  b.set(ref(COL.admins, cred.user.uid), { nombre, correo, rol: 'admin', activo: true, cambiar_clave: false, creado_en: t, ultimo_acceso: t });
  b.set(ref(COL.config, 'inicio'), { creado_en: t, por: cred.user.uid });
  await b.commit();
  return yo();
}

export async function yo() {
  const u = auth && auth.currentUser;
  if (!u) return null;
  const a = await getOne(ref(COL.admins, u.uid)).catch(() => null);
  if (!a || a.activo === false) { await fb.signOut(auth).catch(() => null); return null; }
  yoCache = a;
  return a;
}

export async function entrar(correo, clave) {
  correo = String(correo || '').trim().toLowerCase();
  if (!emailOk(correo) || !clave) throw new AppError('Escribe tu correo y tu contraseña.', 400);
  try { await fb.signInWithEmailAndPassword(auth, correo, clave); }
  catch (e) { if (e.code === 'auth/too-many-requests' || e.code === 'auth/operation-not-allowed') throw e; throw new AppError('Correo o contraseña incorrectos.', 401); }
  const a = await yo();
  if (!a) throw new AppError('Esta cuenta no tiene acceso al panel.', 403);
  await fb.updateDoc(ref(COL.admins, a.id), { ultimo_acceso: now() });
  return a;
}

export async function recuperar(correo) {
  correo = String(correo || '').trim().toLowerCase();
  if (emailOk(correo)) { try { await fb.sendPasswordResetEmail(auth, correo, { url: panelUrl() }); } catch (e) { /* respuesta genérica */ } }
  return 'Si el correo tiene acceso al panel, recibirá un enlace para crear una nueva contraseña.';
}

export async function cambiarClave(actual, nueva) {
  if (!claveOk(nueva)) throw new AppError(CLAVE_MSG, 400);
  if (nueva === actual) throw new AppError('La nueva contraseña debe ser distinta de la actual.', 400);
  try { await fb.reauthenticateWithCredential(auth.currentUser, fb.EmailAuthProvider.credential(auth.currentUser.email, actual)); }
  catch (e) { throw new AppError('La contraseña actual no es correcta.', 403); }
  await fb.updatePassword(auth.currentUser, nueva);
  await fb.updateDoc(ref(COL.admins, auth.currentUser.uid), { cambiar_clave: false });
  if (yoCache) yoCache.cambiar_clave = false;
}

export const salir = () => fb.signOut(auth);

/* ------------------------------------------------------------ proveedores */
export async function proveedores() { return getAll(col(COL.prov)); }

export function resumenDocs(p) {
  const req = requeridos(p.datos || {}), ent = p.entregados || {}, rev = p.revisiones || {};
  const det = req.map((k) => {
    if (!ent[k]) return { k, estado: 'falta' };
    const r = rev[k] && rev[k].version === ent[k] ? rev[k].revision : 'pendiente';
    return { k, estado: r };
  });
  return { req: req.length, entregados: det.filter((d) => d.estado !== 'falta').length, aprobados: det.filter((d) => d.estado === 'aprobado').length,
    correccion: det.filter((d) => d.estado === 'correccion').length, det };
}

export async function detalle(uid) {
  const p = await getOne(ref(COL.prov, uid));
  if (!p) throw new AppError('Proveedor no encontrado.', 404);
  const [docs, hist, correos, equipo] = await Promise.all([
    getAll(col(COL.prov, uid, 'documentos')), getAll(col(COL.prov, uid, 'historial')), getAll(where(COL.correos, 'proveedor_id', uid)), getAll(col(COL.admins))]);
  const desc = (a, b) => String(b.creado_en || b.subido_en).localeCompare(String(a.creado_en || a.subido_en));
  return { p, docs: docs.sort(desc), hist: hist.sort(desc), correos: correos.sort(desc), equipo: equipo.filter((x) => x.activo !== false) };
}

export async function contenido(uid, doc) {
  const partes = (await getAll(col(COL.prov, uid, 'documentos', doc.id, 'partes'))).sort((a, b) => a.id.localeCompare(b.id));
  if (partes.length !== doc.partes) throw new AppError('El archivo está incompleto en la base de datos.', 500);
  return partes.map((x) => x.d).join('');
}

async function avisarCorrecciones(p, docs) {
  const vig = docs.filter((d) => d.vigente && d.revision === 'correccion' && d.notificada === false);
  if (!vig.length) return 0;
  const t = now(), b = fb.writeBatch(db);
  vig.forEach((d) => { b.update(ref(COL.prov, p.id, 'documentos', d.id), { notificada: true }); d.notificada = true; });
  b.update(ref(COL.prov, p.id), { estado: 'correccion', actualizado_en: t });
  b.set(ref(COL.prov, p.id, 'historial', newId()), { tipo: 'aviso_correccion', actor: yoCache ? yoCache.nombre : '', actor_tipo: 'equipo', creado_en: t,
    texto: 'Se avisó al proveedor de ' + vig.length + (vig.length === 1 ? ' corrección.' : ' correcciones.') });
  await b.commit();
  p.estado = 'correccion';
  await enviarCorreo({ plantilla: 'proveedor', tipo: 'correccion', proveedorId: p.id, folio: p.folio, para: p.correo,
    asunto: 'Necesitamos una corrección en tu registro ' + p.folio, titulo: 'Necesitamos algunas correcciones',
    parrafos: ['Revisamos tu expediente. Sustituye estos documentos desde el portal; los demás se conservan.'],
    datos: vig.map((d) => [docLabel(d.tipo), d.motivo + (d.notas ? ' — ' + d.notas : '')]),
    boton: { texto: 'Atender correcciones', url: portalUrl() } });
  return vig.length;
}

export async function revisar(p, doc, { accion, motivo, notas, vence, notificar }) {
  if (!['aprobado', 'rechazado', 'correccion'].includes(accion)) throw new AppError('Acción no válida.', 400);
  motivo = String(motivo || '').trim().slice(0, 500); notas = String(notas || '').trim().slice(0, 2000);
  if (accion !== 'aprobado' && !motivo) throw new AppError('Escribe el motivo.', 400, { motivo: 'Obligatorio.' });
  if (p.estado === 'captura') throw new AppError('La revisión se habilita cuando el proveedor envía su registro.', 409);
  if (!doc.vigente) throw new AppError('Solo se revisa la versión vigente.', 409);
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) throw new AppError('Fecha de vencimiento no válida.', 400);
  const t = now(), b = fb.writeBatch(db);
  const upd = { revision: accion, motivo, notas, revisado_por: yoCache.id, revisado_por_nombre: yoCache.nombre, revisado_en: t, notificada: accion !== 'correccion', vence: vence || null };
  b.update(ref(COL.prov, p.id, 'documentos', doc.id), upd);
  const revisiones = { ...(p.revisiones || {}), [doc.tipo]: { revision: accion, version: doc.version, vence: vence || null } };
  const patch = { revisiones, actualizado_en: t };
  if (p.estado === 'enviado') patch.estado = 'revision';
  b.update(ref(COL.prov, p.id), patch);
  b.set(ref(COL.prov, p.id, 'historial', newId()), { tipo: 'revision_' + accion, actor: yoCache.nombre, actor_tipo: 'equipo', creado_en: t,
    texto: docLabel(doc.tipo) + ' v' + doc.version + ': ' + REVISION[accion].l + (motivo ? ' — ' + motivo : '') + (vence ? ' (vence ' + vence + ')' : '') });
  await b.commit();
  Object.assign(doc, upd); Object.assign(p, patch);
  let avisados = 0;
  if (accion === 'correccion' && notificar !== false) avisados = await avisarCorrecciones(p, (await detalle(p.id)).docs);
  return { avisados };
}

export async function notificar(p) {
  const n = await avisarCorrecciones(p, (await detalle(p.id)).docs);
  if (!n) throw new AppError('No hay correcciones pendientes de avisar.', 409);
  return n;
}

export async function resolver(p, docs, { resultado, notas, responsableId, equipo }) {
  const patch = { actualizado_en: now() }, cambios = [];
  if (resultado && resultado !== p.resultado) {
    if (p.estado === 'captura') throw new AppError('El proveedor aún no envía su registro.', 409);
    if (resultado === 'aprobado') {
      const vig = docs.filter((d) => d.vigente);
      const faltan = requeridos(p.datos || {}).filter((k) => !vig.find((d) => d.tipo === k && d.revision === 'aprobado'));
      if (faltan.length) throw new AppError('Para aprobar, todos los documentos requeridos deben estar aprobados. Pendientes: ' + faltan.map(docLabel).join(', ') + '.', 409);
      patch.estado = 'aprobado'; patch.resuelto_en = now();
    } else if (resultado === 'rechazado') { patch.estado = 'rechazado'; patch.resuelto_en = now(); }
    else if (['aprobado', 'rechazado', 'enviado'].includes(p.estado)) { patch.estado = 'revision'; patch.resuelto_en = null; }
    patch.resultado = resultado; cambios.push('Resultado: ' + resultado);
  }
  if (notas !== undefined && notas !== p.notas) { patch.notas = String(notas).slice(0, 4000); cambios.push('Notas internas actualizadas'); }
  if (responsableId !== undefined && responsableId !== (p.responsable_id || '')) {
    const r = (equipo || []).find((x) => x.id === responsableId);
    patch.responsable_id = r ? r.id : null; patch.responsable = r ? r.nombre : '';
    cambios.push('Responsable: ' + (r ? r.nombre : 'sin asignar'));
  }
  if (!cambios.length) return p;
  const b = fb.writeBatch(db);
  b.update(ref(COL.prov, p.id), patch);
  b.set(ref(COL.prov, p.id, 'historial', newId()), { tipo: 'resolucion', texto: cambios.join('. ') + '.', actor: yoCache.nombre, actor_tipo: 'equipo', creado_en: now() });
  await b.commit();
  Object.assign(p, patch);
  if (patch.estado === 'aprobado' || patch.estado === 'rechazado') {
    const ok = patch.estado === 'aprobado';
    await enviarCorreo({ plantilla: 'proveedor', tipo: 'resultado', proveedorId: p.id, folio: p.folio, para: p.correo,
      asunto: (ok ? 'Tu registro fue aprobado ' : 'Resultado de tu registro ') + p.folio, titulo: ok ? '¡Bienvenido como proveedor!' : 'Tu registro no fue aprobado',
      parrafos: [ok ? 'Tu empresa quedó dada de alta como proveedor de transporte de CESANTONI. El equipo de Logística se pondrá en contacto contigo.'
        : 'Por ahora tu registro no fue aprobado. Si tienes dudas, comunícate con tu contacto de Logística de CESANTONI.'],
      datos: [['Empresa', p.razon_social], ['Resultado', ok ? 'Aprobado' : 'No aprobado']], boton: { texto: 'Ver mi registro', url: portalUrl() } });
  }
  return p;
}

/* ------------------------------------------------------------ alertas del tablero */
export function alertas(provs, correos) {
  const por = (x) => ({ id: x.id, folio: x.folio, empresa: x.razon_social || 'Sin nombre' });
  const revisar = provs.filter((p) => p.estado === 'enviado').map((p) => ({ ...por(p), dias: diasDesde(p.reenviado_en || p.enviado_en) }))
    .sort((a, b) => b.dias - a.dias);
  const correccion = provs.filter((p) => p.estado === 'correccion' && diasDesde(p.actualizado_en) >= ALERTAS.correccionDias)
    .map((p) => ({ ...por(p), dias: diasDesde(p.actualizado_en) })).sort((a, b) => b.dias - a.dias);
  const abandono = provs.filter((p) => p.estado === 'captura' && diasDesde(p.actualizado_en) >= ALERTAS.abandonoDias)
    .map((p) => ({ ...por(p), dias: diasDesde(p.actualizado_en), correo: p.correo })).sort((a, b) => b.dias - a.dias);
  const vence = [];
  provs.forEach((p) => Object.entries(p.revisiones || {}).forEach(([k, r]) => {
    if (!r || !r.vence || r.revision !== 'aprobado') return;
    const d = diasHasta(r.vence);
    if (d !== null && d <= ALERTAS.venceDias) vence.push({ ...por(p), doc: docLabel(k), fecha: r.vence, dias: d });
  }));
  vence.sort((a, b) => a.dias - b.dias);
  const fallidos = (correos || []).filter((c) => c.estado === 'error');
  return { revisar, correccion, abandono, vence, fallidos };
}

/* ------------------------------------------------------------ correos, destinatarios, usuarios */
export async function correos() { return (await getAll(col(COL.correos))).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))); }
export const reintentar = (c) => reintentarCorreo(c);
export async function probarCorreo(para) {
  if (!emailOk(para)) throw new AppError('Escribe un correo válido.', 400);
  const r = await enviarCorreo({ plantilla: 'interno', tipo: 'prueba', para, etiqueta: 'PRUEBA', asunto: 'Prueba del portal de proveedores CESANTONI',
    titulo: 'El envío de correos funciona', parrafos: ['Este mensaje confirma que las alertas automáticas del portal de proveedores se entregan correctamente.'],
    datos: [['Enviado por', yoCache ? yoCache.nombre : '—']] });
  if (r.estado === 'error') throw new AppError('No se pudo enviar: ' + r.error, 502);
  return r;
}

export async function destinatarios() { return (await getAll(col(COL.dest))).sort((a, b) => a.correo.localeCompare(b.correo)); }
export async function guardarDestinatario(id, { nombre, correo, avisos, activo }) {
  correo = String(correo || '').trim().toLowerCase();
  if (!emailOk(correo)) throw new AppError('Escribe un correo válido.', 400);
  const todos = await destinatarios();
  if (todos.some((r) => r.correo === correo && r.id !== id)) throw new AppError('Ese correo ya está en la lista.', 409);
  const rid = id || newId();
  const prev = todos.find((r) => r.id === id);
  await fb.setDoc(ref(COL.dest, rid), { nombre: String(nombre || '').trim().slice(0, 120), correo, avisos: { inicio: !!(avisos && avisos.inicio), envio: !!(avisos && avisos.envio) },
    activo: activo !== false, creado_en: (prev && prev.creado_en) || now() });
}
export const borrarDestinatario = (id) => fb.deleteDoc(ref(COL.dest, id));

/* Borrado definitivo (solo administradores): documentos con sus partes, historial, correos, folio y registro. */
async function borrarEnLotes(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const b = fb.writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
}
export async function borrarProveedor(p) {
  const refs = [];
  for (const d of await getAll(col(COL.prov, p.id, 'documentos'))) {
    const partes = await getAll(col(COL.prov, p.id, 'documentos', d.id, 'partes'));
    partes.forEach((x) => refs.push(ref(COL.prov, p.id, 'documentos', d.id, 'partes', x.id)));
    refs.push(ref(COL.prov, p.id, 'documentos', d.id));
  }
  (await getAll(col(COL.prov, p.id, 'historial'))).forEach((x) => refs.push(ref(COL.prov, p.id, 'historial', x.id)));
  (await getAll(where(COL.correos, 'proveedor_id', p.id))).forEach((x) => refs.push(ref(COL.correos, x.id)));
  await borrarEnLotes(refs);
  // Al final el folio y el registro: si algo falla antes, el expediente sigue visible y se puede reintentar.
  await borrarEnLotes([ref(COL.folios, p.folio), ref(COL.prov, p.id)]);
}
export async function borrarCorreo(c) {
  if (c.estado === 'enviado') throw new AppError('Solo se pueden borrar correos que no se enviaron.', 409);
  await fb.deleteDoc(ref(COL.correos, c.id));
}

export async function usuarios() { return (await getAll(col(COL.admins))).sort((a, b) => a.nombre.localeCompare(b.nombre)); }
export async function crearUsuario({ nombre, correo, rol, clave }) {
  correo = String(correo || '').trim().toLowerCase(); nombre = String(nombre || '').trim();
  if (!nombre || !emailOk(correo)) throw new AppError('Escribe nombre y correo válidos.', 400);
  if (!claveOk(clave)) throw new AppError(CLAVE_MSG, 400);
  /* Instancia secundaria: así la sesión del administrador no se cierra. */
  const app2 = fb.initializeApp(CFG.firebase, 'alta-' + Date.now());
  const a2 = fb.getAuth(app2); emulate(a2, null);
  let uid;
  try { uid = (await fb.createUserWithEmailAndPassword(a2, correo, clave)).user.uid; }
  catch (e) { if (e.code === 'auth/email-already-in-use') throw new AppError('Ya existe una cuenta con ese correo.', 409); throw e; }
  finally { await fb.signOut(a2).catch(() => null); }
  await fb.setDoc(ref(COL.admins, uid), { nombre, correo, rol: rol === 'admin' ? 'admin' : 'revisor', activo: true, cambiar_clave: true, creado_en: now(), ultimo_acceso: null });
}
export async function editarUsuario(u, { nombre, rol, activo, restablecer }) {
  if (u.id === auth.currentUser.uid && (!activo || rol !== 'admin')) throw new AppError('No puedes desactivarte ni quitarte el rol de administrador.', 409);
  await fb.updateDoc(ref(COL.admins, u.id), { nombre: String(nombre || u.nombre).trim(), rol: rol === 'admin' ? 'admin' : 'revisor', activo: !!activo });
  if (restablecer) await fb.sendPasswordResetEmail(auth, u.correo);
}

export async function respaldo() {
  const out = { generado_en: now(), colecciones: {} };
  for (const c of [COL.prov, COL.folios, COL.admins, COL.dest, COL.correos]) out.colecciones[c] = await getAll(col(c));
  out.colecciones.documentos = []; out.colecciones.historial = [];
  for (const p of out.colecciones[COL.prov]) {
    out.colecciones.documentos.push(...await getAll(col(COL.prov, p.id, 'documentos')));
    out.colecciones.historial.push(...await getAll(col(COL.prov, p.id, 'historial')));
  }
  return out;
}
export async function usoAlmacenamiento() {
  let bytes = 0;
  (await getAll(fb.collectionGroup(db, 'documentos'))).forEach((d) => { bytes += Number(d.tamano || 0); });
  return bytes;
}
export { ESTADOS, REVISION, DOCS };
