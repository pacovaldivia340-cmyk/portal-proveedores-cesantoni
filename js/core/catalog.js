/* Catálogo de la plataforma: pasos del registro, documentos, estados y validaciones. */
export const MAX_MB = 5;
export const ACCEPT = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' };
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

export const CENTROAMERICA = ['Belice', 'Guatemala', 'El Salvador', 'Honduras', 'Nicaragua', 'Costa Rica', 'Panamá'];
export const PAISES = ['México', ...CENTROAMERICA];
export const TODA = 'Toda la República';
export const ESTADOS_MX = ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México',
  'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala',
  'Veracruz', 'Yucatán', 'Zacatecas'];
export const SERVICIOS = ['Transporte nacional (carga completa)', 'Carga consolidada', 'Última milla y reparto local', 'Transporte a Centroamérica',
  'Importación y exportación', 'Logística operativa (maniobras y almacenaje)'];
export const UNIDADES = ["Caja seca 53'", "Caja seca 48'", 'Full (doble remolque)', 'Torton', 'Rabón', 'Camioneta 3.5 t', 'Plataforma', 'Refrigerado'];

export const PASOS = [
  { id: 'contacto', titulo: 'Contacto', sub: 'Quién registra', intro: 'Con estos datos generamos tu folio y tu clave de acceso.', campos: [
    { k: 'contacto', l: 'Nombre completo', t: 'text', req: true, max: 120, ac: 'name' },
    { k: 'puesto', l: 'Puesto', t: 'text', max: 80, ac: 'organization-title' },
    { k: 'correo', l: 'Correo electrónico', t: 'email', req: true, ac: 'email', help: 'Aquí recibirás tu folio, tu clave y los avisos del registro.' },
    { k: 'telefono', l: 'Teléfono', t: 'tel', req: true, ac: 'tel' },
    { k: 'razon_social', l: 'Empresa o razón social', t: 'text', req: true, max: 200, ac: 'organization', wide: true },
    { k: 'pais', l: 'País de la empresa', t: 'select', req: true, op: PAISES }] },
  { id: 'empresa', titulo: 'Empresa', sub: 'Datos fiscales', intro: 'Datos fiscales, domicilio y contacto de operaciones.', campos: [
    { k: 'nombre_comercial', l: 'Nombre comercial', t: 'text', max: 200 },
    { k: 'rfc', l: 'RFC o identificación fiscal', t: 'text', req: true, max: 30, help: 'Empresas en México: RFC de 12 o 13 caracteres.' },
    { k: 'calle', l: 'Calle y número', t: 'text', req: true, max: 200, ac: 'address-line1', wide: true },
    { k: 'colonia', l: 'Colonia', t: 'text', max: 120, ac: 'address-line2' },
    { k: 'ciudad', l: 'Ciudad o municipio', t: 'text', req: true, max: 120, ac: 'address-level2' },
    { k: 'estado', l: 'Estado', t: 'text', req: true, max: 120, ac: 'address-level1' },
    { k: 'cp', l: 'Código postal', t: 'text', req: true, max: 12, ac: 'postal-code' },
    { k: 'anios', l: 'Años de operación', t: 'number', min: 0, max: 150 },
    { k: 'web', l: 'Sitio web', t: 'text', max: 200, ac: 'url' },
    { k: 'ops_nombre', l: 'Contacto de operaciones', t: 'text', max: 120 },
    { k: 'ops_telefono', l: 'Teléfono de operaciones', t: 'tel' },
    { k: 'ops_correo', l: 'Correo de operaciones', t: 'email' }] },
  { id: 'operacion', titulo: 'Operación', sub: 'Servicios y cobertura', intro: 'Qué servicios ofreces, dónde operas y cómo monitoreas tus unidades.', campos: [
    { k: 'servicios', l: 'Tipo de servicio', t: 'multi', req: true, op: SERVICIOS },
    { k: 'cobertura', l: 'Cobertura nacional', t: 'multi', req: true, op: [TODA, ...ESTADOS_MX], help: 'Marca «Toda la República» o los estados donde operas.' },
    { k: 'centroamerica', l: 'Cobertura en Centroamérica', t: 'multi', op: CENTROAMERICA, help: 'Déjalo vacío si operas solo en México. Si marcas algún país se pedirá el permiso internacional.' },
    { k: 'unidades', l: 'Tipos de unidad', t: 'multi', req: true, op: UNIDADES },
    { k: 'num_unidades', l: 'Número de unidades', t: 'number', req: true, min: 1, max: 100000 },
    { k: 'monitoreo', l: 'Monitoreo de unidades', t: 'radio', req: true, op: ['24/7', 'Intermitente'] },
    { k: 'gps', l: '¿Tus unidades tienen GPS?', t: 'radio', req: true, op: ['Sí', 'No'] }] }
];
export const CAMPOS = Object.fromEntries(PASOS.flatMap((p) => p.campos.map((c) => [c.k, c])));

export const DOCS = [
  { k: 'constancia', l: 'Constancia de situación fiscal', regla: 'antiguedad', help: 'Emitida en los últimos 3 meses.' },
  { k: 'opinion', l: 'Opinión de cumplimiento', regla: 'antiguedad', help: 'Opinión positiva con antigüedad máxima de 3 meses.' },
  { k: 'bancaria', l: 'Carátula bancaria', regla: 'antiguedad', help: 'Estado de cuenta o carta bancaria; máximo 3 meses.' },
  { k: 'domicilio', l: 'Comprobante de domicilio', regla: 'antiguedad', help: 'Recibo o constancia; máximo 3 meses.' },
  { k: 'poliza', l: 'Póliza de seguro', regla: 'vigencia', help: 'Debe estar vigente.' },
  { k: 'autotransporte', l: 'Permiso de autotransporte', regla: 'vigencia', help: 'Permiso SICT o equivalente vigente.' },
  { k: 'internacional', l: 'Permiso de operación internacional', regla: 'vigencia', condicional: true, help: 'Solo si operas en Centroamérica.' }
];
export const docLabel = (k) => (DOCS.find((d) => d.k === k) || { l: k }).l;
export const requeridos = (datos) => DOCS.filter((d) => !d.condicional || (datos.centroamerica || []).length).map((d) => d.k);

export const ESTADOS = {
  captura: { l: 'En captura', tag: '' },
  enviado: { l: 'Enviado, pendiente de revisión', tag: 'info' },
  revision: { l: 'En revisión', tag: 'violet' },
  correccion: { l: 'Corrección solicitada', tag: 'warn' },
  aprobado: { l: 'Aprobado', tag: 'ok' },
  rechazado: { l: 'Rechazado', tag: 'bad' }
};
export const REVISION = {
  pendiente: { l: 'Por revisar', tag: '' },
  aprobado: { l: 'Aprobado', tag: 'ok' },
  correccion: { l: 'Corrección solicitada', tag: 'warn' },
  rechazado: { l: 'Rechazado', tag: 'bad' }
};
export const MOTIVOS = ['Documento ilegible o incompleto', 'El documento está vencido', 'La antigüedad es mayor a 3 meses',
  'No corresponde a la razón social registrada', 'Los datos no coinciden con el registro', 'Falta alguna página', 'No es el documento solicitado'];

/* Umbrales de las alertas del tablero (días). */
export const ALERTAS = { revisarDias: 2, correccionDias: 5, abandonoDias: 7, venceDias: 30 };

export const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

export function normalizar(campo, v) {
  if (campo.t === 'multi') return Array.isArray(v) ? campo.op.filter((o) => v.includes(o)) : [];
  if (v === null || v === undefined || typeof v === 'object') return '';
  let s = String(v).trim().slice(0, 1000);
  if (campo.k === 'correo' || campo.k === 'ops_correo') s = s.toLowerCase();
  return s;
}

export function validar(datos) {
  const out = {};
  PASOS.forEach((p) => {
    const e = {};
    p.campos.forEach((c) => {
      const v = datos[c.k];
      const vacio = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      const dig = String(v || '').replace(/\D/g, '').length;
      if (c.req && vacio) e[c.k] = 'Este dato es obligatorio.';
      else if (vacio) return;
      else if (c.t === 'email' && !emailOk(v)) e[c.k] = 'Escribe un correo válido (ejemplo: nombre@empresa.com).';
      else if (c.t === 'tel' && (dig < 7 || dig > 15)) e[c.k] = 'Escribe un teléfono de 7 a 15 dígitos.';
      else if (c.t === 'number' && (isNaN(Number(v)) || Number(v) < (c.min || 0) || Number(v) > c.max)) e[c.k] = 'Escribe un número válido.';
      else if (c.max && c.t !== 'number' && String(v).length > c.max) e[c.k] = 'Máximo ' + c.max + ' caracteres.';
    });
    if (p.id === 'empresa' && datos.pais === 'México' && datos.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(String(datos.rfc).replace(/[\s-]/g, ''))) {
      e.rfc = 'El RFC debe tener 12 o 13 caracteres válidos.';
    }
    if (Object.keys(e).length) out[p.id] = e;
  });
  return out;
}
