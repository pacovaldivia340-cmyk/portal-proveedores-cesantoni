/* Operaciones del proveedor sobre Firebase. La seguridad real la imponen las reglas de Firestore. */
import { fb, auth, db, COL, ref, col, getOne, getAll, now, newId, randomChars, sha256, portalUrl, panelUrl, AppError } from './firebase.js?v=13';
import { PASOS, CAMPOS, DOCS, ACCEPT, MAX_MB, ESTADOS, docLabel, requeridos, validar, normalizar } from './catalog.js?v=13';
import { enviar as enviarCorreo, destinatarios } from './mail.js?v=13';

const CHUNK = 700000;
const nuevaClaveTxt = () => { const c = randomChars(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); return c.slice(0, 4) + '-' + c.slice(4); };
/* Folio consecutivo PROV-0001, PROV-0002… (los anteriores PRV-AAAA-######## siguen funcionando). */
const FOLIO_RE = /^(PROV-\d{4,}|PRV-\d{4}-\d{8})$/;
const folioTxt = (n) => 'PROV-' + String(n).padStart(4, '0');
/* Acepta «prov 12», «PROV12» o «12» y lo escribe como PROV-0012. */
export function normalizarFolio(v) {
  const s = String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(?:PROV-?)?(\d{1,9})$/);
  return m ? folioTxt(Number(m[1])) : s;
}

async function historial(uid, tipo, texto, actor) {
  await fb.setDoc(ref(COL.prov, uid, 'historial', newId()), { tipo, texto, actor: actor || '', actor_tipo: 'proveedor', creado_en: now() });
}

export async function sesion() {
  const u = auth && auth.currentUser;
  if (!u) return null;
  try { return await getOne(ref(COL.prov, u.uid)); }
  catch (e) { await fb.signOut(auth).catch(() => null); return null; }
}

export async function documentos(uid) {
  return (await getAll(col(COL.prov, uid, 'documentos'))).sort((a, b) => String(b.subido_en).localeCompare(String(a.subido_en)));
}

/* Estado de cada documento para la pantalla del proveedor. */
export function tablero(prov, docs) {
  const req = requeridos(prov.datos || {});
  return DOCS.map((d) => {
    const versiones = docs.filter((x) => x.tipo === d.k);
    const actual = versiones.find((x) => x.vigente) || null;
    const fix = actual && actual.revision === 'correccion';
    let puede = false;
    if (prov.estado === 'captura') puede = true;
    else if (prov.estado === 'correccion') puede = actual ? fix : req.includes(d.k);
    return { def: d, requerido: req.includes(d.k), actual, versiones, puede, correccion: fix ? { motivo: actual.motivo, notas: actual.notas } : null };
  });
}

export function pendientes(prov, docs) {
  const out = [];
  const err = validar(prov.datos || {});
  PASOS.forEach((p) => { const n = Object.keys(err[p.id] || {}).length; if (n) out.push({ paso: p.id, texto: 'Completa «' + p.titulo + '»: ' + n + (n === 1 ? ' dato pendiente.' : ' datos pendientes.') }); });
  tablero(prov, docs).forEach((t) => {
    if (!t.requerido) return;
    if (!t.actual) out.push({ paso: 'documentos', texto: 'Falta subir: ' + t.def.l + '.' });
    else if (t.correccion) out.push({ paso: 'documentos', texto: 'Sube la versión corregida de: ' + t.def.l + '.' });
  });
  return out;
}

export async function iniciar(entrada) {
  const datos = {};
  PASOS[0].campos.forEach((c) => { datos[c.k] = normalizar(c, entrada[c.k]); });
  const errores = validar(datos).contacto || {};
  if (Object.keys(errores).length) throw new AppError('Revisa los datos marcados.', 422, errores);
  const clave = nuevaClaveTxt();
  let cred;
  try { cred = await fb.createUserWithEmailAndPassword(auth, datos.correo, clave); }
  catch (e) {
    if (e.code === 'auth/email-already-in-use') throw new AppError('Este correo ya tiene un registro. Entra con tu folio y clave o usa «Olvidé mi clave».', 409, { correo: 'Este correo ya tiene un registro.' });
    throw e;
  }
  const uid = cred.user.uid, t = now();
  let folio = '';
  const prov = { folio, estado: 'captura', datos, razon_social: datos.razon_social, pais: datos.pais, contacto: datos.contacto, correo: datos.correo,
    telefono: datos.telefono, acceso_correo: datos.correo, paso: 'empresa', envios: 0, creado_en: t, actualizado_en: t, enviado_en: null, reenviado_en: null,
    resuelto_en: null, resultado: 'pendiente', responsable_id: null, responsable: '', notas: '', entregados: {}, revisiones: {} };
  try {
    // Consecutivo en una transacción: dos registros al mismo tiempo nunca reciben el mismo número.
    await fb.runTransaction(db, async (tx) => {
      const cref = ref(COL.config, 'folio'), cs = await tx.get(cref);
      const n = (cs.exists() ? Number(cs.data().n) || 0 : 0) + 1;
      folio = folioTxt(n); prov.folio = folio;
      if (cs.exists()) tx.update(cref, { n }); else tx.set(cref, { n });
      tx.set(ref(COL.folios, folio), { correo: datos.correo, uid, n });
      tx.set(ref(COL.prov, uid), prov);
      tx.set(ref(COL.prov, uid, 'historial', newId()), { tipo: 'inicio', texto: 'Folio ' + folio + ' generado.', actor: datos.correo, actor_tipo: 'proveedor', creado_en: t });
    });
  } catch (e) { await cred.user.delete().catch(() => null); throw e; }
  prov.id = uid;
  await enviarCorreo({ plantilla: 'proveedor', tipo: 'bienvenida', proveedorId: uid, folio, para: datos.correo, secreto: true,
    asunto: 'Tu folio de registro ' + folio + ' · CESANTONI', titulo: 'Tu registro está en marcha',
    parrafos: ['Hola ' + datos.contacto + ', ya tienes folio de proveedor. Con estos datos puedes continuar desde cualquier dispositivo; tu avance se guarda solo.'],
    datos: [['Folio', folio], ['Clave de acceso', clave], ['Empresa', datos.razon_social]],
    boton: { texto: 'Continuar mi registro', url: portalUrl() }, nota: 'Si pierdes tu clave, en el portal elige «Olvidé mi clave».' });
  await enviarCorreo({ plantilla: 'interno', tipo: 'inicio', proveedorId: uid, folio, para: await destinatarios('inicio'), etiqueta: 'NUEVO REGISTRO',
    asunto: 'Alerta: nuevo registro iniciado ' + folio, titulo: datos.razon_social,
    parrafos: ['Un proveedor generó su folio. Recibirás otra alerta cuando envíe el expediente completo.'],
    datos: [['Contacto', datos.contacto], ['Correo', datos.correo], ['Teléfono', datos.telefono], ['País', datos.pais]],
    boton: { texto: 'Ver en el panel', url: panelUrl() } });
  return { prov, clave };
}

export async function entrar(folio, clave) {
  folio = normalizarFolio(folio);
  const tecleada = String(clave || '').trim();
  const f = FOLIO_RE.test(folio) ? await getOne(ref(COL.folios, folio)) : null;
  if (!f || !tecleada) throw new AppError('Folio o clave incorrectos.', 401);
  try { await fb.signInWithEmailAndPassword(auth, f.correo, /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(tecleada) ? tecleada.toUpperCase() : tecleada); }
  catch (e) { if (e.code === 'auth/too-many-requests') throw e; throw new AppError('Folio o clave incorrectos.', 401); }
  const prov = await sesion();
  if (!prov) throw new AppError('No encontramos el registro de este folio.', 404);
  await historial(prov.id, 'acceso', 'Ingreso con folio y clave.', prov.correo).catch(() => null);
  return prov;
}

export async function recuperar(folio, correo) {
  folio = normalizarFolio(folio); correo = String(correo || '').trim().toLowerCase();
  const f = FOLIO_RE.test(folio) ? await getOne(ref(COL.folios, folio)) : null;
  if (f && f.correo === correo) {
    try { await fb.sendPasswordResetEmail(auth, correo, { url: portalUrl() }); }
    catch (e) { await fb.sendPasswordResetEmail(auth, correo).catch(() => null); }
  }
  return 'Si el folio y el correo coinciden, te enviamos un correo para crear una nueva clave.';
}

export async function guardar(prov, cambios, paso) {
  if (!['captura', 'correccion'].includes(prov.estado)) throw new AppError('Tu registro ya fue enviado y no se puede modificar.', 409);
  const datos = { ...(prov.datos || {}) };
  Object.keys(cambios || {}).forEach((k) => { if (CAMPOS[k]) datos[k] = normalizar(CAMPOS[k], cambios[k]); });
  if (datos.pais === 'México' && datos.rfc) datos.rfc = String(datos.rfc).replace(/[\s-]/g, '').toUpperCase();
  const patch = { datos, razon_social: datos.razon_social || '', pais: datos.pais || '', contacto: datos.contacto || '', correo: datos.correo || '',
    telefono: datos.telefono || '', actualizado_en: now() };
  if (paso) patch.paso = paso;
  await fb.updateDoc(ref(COL.prov, prov.id), patch);
  Object.assign(prov, patch);
  return { errores: validar(datos), requeridos: requeridos(datos), en: patch.actualizado_en };
}

function bytes(b64) { const s = atob(b64), o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }

export async function subir(prov, tipo, archivo, b64, progreso) {
  const def = DOCS.find((d) => d.k === tipo);
  if (!def) throw new AppError('Documento no válido.', 404);
  if (!ACCEPT[archivo.type]) throw new AppError('Formato no permitido. Sube PDF, JPG, PNG o WEBP.', 415);
  if (!archivo.size || archivo.size > MAX_MB * 1048576) throw new AppError('El archivo pesa ' + (archivo.size / 1048576).toFixed(1) + ' MB; el máximo es ' + MAX_MB + ' MB.', 413);
  const docs = await documentos(prov.id);
  const t = tablero(prov, docs).find((x) => x.def.k === tipo);
  if (!t.puede) throw new AppError(prov.estado === 'correccion' ? 'Solo puedes reemplazar los documentos con corrección solicitada.' : 'El expediente ya no admite cambios.', 409);
  const huella = await sha256(bytes(b64));
  if (t.actual && t.actual.huella === huella && !t.correccion) return { repetido: true, docs };
  const id = newId(), partes = Math.ceil(b64.length / CHUNK), fecha = now();
  for (let i = 0; i < partes; i++) {
    await fb.setDoc(ref(COL.prov, prov.id, 'documentos', id, 'partes', String(i).padStart(3, '0')), { d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    if (progreso) progreso((i + 1) / (partes + 1));
  }
  const version = 1 + t.versiones.length;
  const nombre = String(archivo.name).replace(/[^\wÁÉÍÓÚÜÑáéíóúüñ .()-]/g, '_').slice(0, 160);
  const doc = { proveedor_id: prov.id, tipo, version, vigente: true, nombre, mime: archivo.type, tamano: archivo.size, huella, partes, subido_en: fecha,
    revision: 'pendiente', motivo: '', notas: '', revisado_por: null, revisado_por_nombre: '', revisado_en: null, notificada: true, vence: null };
  const b = fb.writeBatch(db);
  t.versiones.filter((v) => v.vigente).forEach((v) => b.update(ref(COL.prov, prov.id, 'documentos', v.id), { vigente: false }));
  b.set(ref(COL.prov, prov.id, 'documentos', id), doc);
  const entregados = { ...(prov.entregados || {}), [tipo]: version };
  b.update(ref(COL.prov, prov.id), { entregados, actualizado_en: fecha });
  b.set(ref(COL.prov, prov.id, 'historial', newId()), { tipo: 'documento', texto: def.l + ' v' + version + ' (' + nombre + ')', actor: prov.correo, actor_tipo: 'proveedor', creado_en: fecha });
  await b.commit();
  if (progreso) progreso(1);
  prov.entregados = entregados; prov.actualizado_en = fecha;
  return { repetido: false, docs: await documentos(prov.id) };
}

/* Envío a revisión: dispara la confirmación al proveedor y la alerta interna (tarjetas distintas). */
export async function enviar(prov) {
  const docs = await documentos(prov.id);
  const faltan = pendientes(prov, docs);
  if (faltan.length) throw new AppError('Aún falta información para enviar.', 422, { lista: faltan.map((f) => f.texto) });
  if (!['captura', 'correccion'].includes(prov.estado)) return prov;
  const eraCorreccion = prov.estado === 'correccion', t = now(), envios = (prov.envios || 0) + 1;
  const patch = { estado: 'enviado', envios, enviado_en: prov.enviado_en || t, reenviado_en: t, actualizado_en: t, paso: 'estado' };
  const b = fb.writeBatch(db);
  b.update(ref(COL.prov, prov.id), patch);
  b.set(ref(COL.prov, prov.id, 'historial', newId()), { tipo: eraCorreccion ? 'reenvio' : 'envio', actor: prov.correo, actor_tipo: 'proveedor', creado_en: t,
    texto: (eraCorreccion ? 'Correcciones enviadas a revisión (envío ' + envios + ').' : 'Registro completo enviado a revisión.') + ' Aceptó el aviso de privacidad.' });
  await b.commit();
  Object.assign(prov, patch);
  const d = prov.datos || {};
  const lista = tablero(prov, docs).filter((x) => x.actual).map((x) => x.def.l + ' — ' + x.actual.nombre + ' (v' + x.actual.version + ')');
  await enviarCorreo({ plantilla: 'proveedor', tipo: eraCorreccion ? 'correcciones_recibidas' : 'recibido', proveedorId: prov.id, folio: prov.folio, para: prov.correo,
    asunto: (eraCorreccion ? 'Recibimos tus correcciones ' : 'Recibimos tu registro ') + prov.folio,
    titulo: eraCorreccion ? 'Recibimos tus correcciones' : '¡Registro recibido!',
    parrafos: [eraCorreccion ? 'Tus documentos corregidos quedaron en revisión.' : 'Tu expediente llegó completo y quedó pendiente de revisión por el equipo de Logística de CESANTONI.',
      'Te avisaremos a este correo si necesitamos una corrección o cuando haya una resolución.'],
    datos: [['Empresa', prov.razon_social], ['Estado', ESTADOS.enviado.l], ['Documentos entregados', String(lista.length)]],
    boton: { texto: 'Ver el estado de mi registro', url: portalUrl() } });
  await enviarCorreo({ plantilla: 'interno', tipo: eraCorreccion ? 'correcciones' : 'completo', proveedorId: prov.id, folio: prov.folio,
    para: await destinatarios('envio'), etiqueta: eraCorreccion ? 'CORRECCIONES RECIBIDAS' : 'REGISTRO COMPLETO',
    asunto: (eraCorreccion ? 'Alerta: correcciones reenviadas ' : 'Alerta: registro completo para revisar ') + prov.folio,
    titulo: prov.razon_social,
    parrafos: [eraCorreccion ? 'El proveedor atendió las correcciones y reenvió su expediente.' : 'El proveedor llenó correctamente su registro y envió todos los documentos requeridos.'],
    datos: [['Contacto', prov.contacto], ['Correo', prov.correo], ['Teléfono', prov.telefono], ['País', prov.pais], ['RFC / ID fiscal', d.rfc || '—'],
      ['Servicios', (d.servicios || []).join(', ')], ['Unidades', String(d.num_unidades || '—')], ['Envío número', String(envios)]],
    lista, boton: { texto: 'Revisar en el panel', url: panelUrl() } });
  return prov;
}

export async function nuevaClave(prov) {
  const clave = nuevaClaveTxt();
  try { await fb.updatePassword(auth.currentUser, clave); }
  catch (e) { if (e.code === 'auth/requires-recent-login') throw new AppError('Por seguridad, sal y vuelve a entrar con tu folio y clave para generar otra.', 409); throw e; }
  await historial(prov.id, 'clave', 'Se generó una nueva clave de acceso.', prov.correo).catch(() => null);
  return clave;
}

export const salir = () => fb.signOut(auth);
export { docLabel };
