/* Conexión con Firebase (Authentication + Firestore, plan gratuito Spark).
   El portal y el panel usan instancias separadas para que sus sesiones no se mezclen. */
import * as fb from '../firebase-sdk.js?v=5';
export { fb };

export const CFG = window.CP_CONFIG || {};
export const configured = !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.projectId && CFG.firebase.appId);
export const COL = { config: 'pv_config', admins: 'pv_admins', folios: 'pv_folios', prov: 'pv_proveedores', correos: 'pv_correos', dest: 'pv_destinatarios' };

export let auth = null;
export let db = null;

export function emulate(a, d) {
  if (!CFG.emulator) return;
  fb.connectAuthEmulator(a, 'http://' + CFG.emulator.auth, { disableWarnings: true });
  if (d) { const [host, port] = CFG.emulator.firestore.split(':'); fb.connectFirestoreEmulator(d, host, Number(port)); }
}

/* Arranca Firebase y espera a conocer la sesión guardada. */
export function start(scope) {
  if (!configured) return Promise.resolve(false);
  const app = fb.initializeApp(CFG.firebase, scope);
  auth = fb.getAuth(app);
  db = fb.getFirestore(app);
  emulate(auth, db);
  return new Promise((resolve) => { const off = fb.onAuthStateChanged(auth, () => { off(); resolve(true); }); });
}

export class AppError extends Error {
  constructor(message, status, errors) { super(message); this.status = status || 400; this.errors = errors || {}; }
}
const MSG = {
  'permission-denied': ['No tienes permiso para esta acción o tu sesión cambió. Vuelve a entrar.', 403],
  'unavailable': ['Sin conexión con la base de datos. Revisa tu internet e inténtalo de nuevo.', 0],
  'resource-exhausted': ['Se alcanzó el límite gratuito diario de la base de datos. Inténtalo mañana.', 429],
  'auth/network-request-failed': ['Sin conexión. Revisa tu internet e inténtalo de nuevo.', 0],
  'auth/too-many-requests': ['Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 429],
  'auth/invalid-credential': ['Datos de acceso incorrectos.', 401],
  'auth/wrong-password': ['Datos de acceso incorrectos.', 401],
  'auth/user-not-found': ['Datos de acceso incorrectos.', 401],
  'auth/user-disabled': ['Esta cuenta está desactivada.', 401],
  'auth/email-already-in-use': ['Ya existe una cuenta con ese correo.', 409],
  'auth/requires-recent-login': ['Por seguridad, sal y vuelve a entrar para hacer este cambio.', 401],
  'auth/operation-not-allowed': ['El acceso con correo y contraseña no está activado en Firebase (Authentication > Método de acceso).', 503],
  'auth/unauthorized-domain': ['Este dominio no está autorizado en Firebase (Authentication > Configuración > Dominios autorizados).', 503]
};
export function friendly(e) {
  if (e instanceof AppError) return e;
  const hit = MSG[e && e.code];
  if (!hit) console.warn('Detalle técnico:', e);
  return new AppError(hit ? hit[0] : 'Ocurrió un error inesperado. Inténtalo de nuevo.', hit ? hit[1] : 500);
}

export const ref = (...p) => fb.doc(db, ...p);
export const col = (...p) => fb.collection(db, ...p);
export async function getOne(r) { const s = await fb.getDoc(r); return s.exists() ? { id: s.id, ...s.data() } : null; }
export async function getAll(q) { return (await fb.getDocs(q)).docs.map((s) => ({ id: s.id, ...s.data() })); }
export const where = (c, f, v) => fb.query(col(c), fb.where(f, '==', v));
export const now = () => new Date().toISOString();
export function randomChars(n, chars) { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, (x) => chars[x % chars.length]).join(''); }
export const newId = () => randomChars(20, 'abcdefghijklmnopqrstuvwxyz0123456789');
export async function sha256(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const baseUrl = () => new URL('./', location.href).href;
export const portalUrl = () => baseUrl();
export const panelUrl = () => new URL('admin.html', baseUrl()).href;
