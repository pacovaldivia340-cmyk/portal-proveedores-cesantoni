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
  'Importación y exportación', 'Forwarder (agente de carga internacional)', 'Almacenes y bodegas', 'Maniobras de carga y descarga'];
export const SRV = { forwarder: SERVICIOS[5], almacen: SERVICIOS[6], maniobras: SERVICIOS[7] };
const TRANSPORTE = SERVICIOS.slice(0, 5);
const tiene = (d, s) => (d.servicios || []).includes(s);
/* Los datos de unidades se piden si aún no elige servicios o si ofrece transporte. */
const conTransporte = (d) => !(d.servicios || []).length || (d.servicios || []).some((s) => TRANSPORTE.includes(s));
const esForwarder = (d) => tiene(d, SRV.forwarder), conAlmacen = (d) => tiene(d, SRV.almacen), conManiobras = (d) => tiene(d, SRV.maniobras);
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
    { k: 'servicios', l: 'Tipo de servicio', t: 'multi', req: true, op: SERVICIOS, help: 'Marca todos los que ofreces. Según lo que elijas te pediremos los datos de flota, forwarder, almacenes o maniobras.' },
    { k: 'cobertura', l: 'Cobertura nacional', t: 'multi', req: true, op: [TODA, ...ESTADOS_MX], help: 'Marca «Toda la República» o los estados donde operas.' },
    { k: 'centroamerica', l: 'Cobertura en Centroamérica', t: 'multi', op: CENTROAMERICA, help: 'Déjalo vacío si operas solo en México. Si marcas algún país se pedirá el permiso internacional.' },
    { k: 'sec_transporte', t: 'sec', l: 'Flota y monitoreo', s: 'Unidades de transporte', icon: 'truck', si: conTransporte },
    { k: 'unidades', l: 'Tipos de unidad', t: 'multi', req: true, op: UNIDADES, si: conTransporte },
    { k: 'num_unidades', l: 'Número de unidades', t: 'number', req: true, min: 1, max: 100000, si: conTransporte },
    { k: 'monitoreo', l: 'Monitoreo de unidades', t: 'radio', req: true, op: ['24/7', 'Intermitente'], si: conTransporte },
    { k: 'gps', l: '¿Tus unidades tienen GPS?', t: 'radio', req: true, op: ['Sí', 'No'], si: conTransporte },

    { k: 'sec_forwarder', t: 'sec', l: 'Forwarder', s: 'Agente de carga internacional', icon: 'globe', si: esForwarder },
    { k: 'fw_modalidades', l: 'Modalidades', t: 'multi', req: true, op: ['Marítimo', 'Aéreo', 'Terrestre', 'Ferroviario', 'Multimodal'], si: esForwarder },
    { k: 'fw_servicios', l: 'Servicios de forwarder', t: 'multi', req: true, si: esForwarder,
      op: ['Contenedor completo (FCL)', 'Carga consolidada (LCL)', 'Carga aérea', 'Despacho aduanal (con agente aliado)', 'Cruce fronterizo (transfer)',
        'Seguro de carga', 'Almacén fiscal / recinto fiscalizado', 'Carga de proyecto o sobredimensionada'] },
    { k: 'fw_aduanas', l: 'Puertos y aduanas donde operas', t: 'multi', req: true, si: esForwarder,
      op: ['Manzanillo', 'Lázaro Cárdenas', 'Veracruz', 'Altamira', 'Ensenada', 'Nuevo Laredo', 'Ciudad Juárez', 'Tijuana', 'Colombia (N. L.)',
        'Piedras Negras', 'AICM (Ciudad de México)', 'AIFA', 'Guadalajara', 'Monterrey', 'Querétaro', 'Ciudad Hidalgo (frontera sur)'] },
    { k: 'fw_paises', l: 'Principales países de origen y destino', t: 'text', max: 300, wide: true, si: esForwarder, help: 'Ejemplo: China, Estados Unidos, España, Guatemala.' },
    { k: 'fw_agente', l: 'Agente aduanal y patente', t: 'text', max: 200, si: esForwarder, help: 'Con quién despachas o tu patente propia.' },
    { k: 'fw_afiliaciones', l: 'Registros y afiliaciones', t: 'text', max: 200, si: esForwarder, help: 'IATA, FIATA, CAAAREM, OEA, C-TPAT, etc.' },

    { k: 'sec_almacen', t: 'sec', l: 'Almacenes y bodegas', s: 'Instalaciones de almacenaje', icon: 'warehouse', si: conAlmacen },
    { k: 'alm_ubicaciones', l: 'Ubicación de almacenes y bodegas', t: 'text', req: true, max: 400, wide: true, si: conAlmacen, help: 'Ciudad y estado de cada almacén o bodega.' },
    { k: 'alm_num', l: 'Número de almacenes o bodegas', t: 'number', req: true, min: 1, max: 1000, si: conAlmacen },
    { k: 'alm_m2', l: 'Superficie total (m²)', t: 'number', req: true, min: 1, max: 10000000, si: conAlmacen },
    { k: 'alm_tipo', l: 'Tipo de almacenaje', t: 'multi', req: true, si: conAlmacen,
      op: ['Carga seca', 'Refrigerado', 'Congelado', 'Recinto fiscalizado', 'Mercancía peligrosa', 'Patio de contenedores', 'Piso (a granel)', 'Racks'] },
    { k: 'alm_posiciones', l: 'Posiciones de tarima (rack)', t: 'number', min: 0, max: 10000000, si: conAlmacen },
    { k: 'alm_andenes', l: 'Andenes o rampas de carga', t: 'number', min: 0, max: 10000, si: conAlmacen },
    { k: 'alm_seguridad', l: 'Seguridad y control', t: 'multi', si: conAlmacen,
      op: ['Vigilancia 24/7', 'Circuito cerrado (CCTV)', 'Control de acceso', 'Sistema contra incendio', 'Seguro de mercancía', 'Sistema de inventarios (WMS)'] },
    { k: 'alm_certificaciones', l: 'Certificaciones', t: 'text', max: 200, si: conAlmacen, help: 'OEA, C-TPAT, ISO 9001, etc.' },
    { k: 'alm_horario', l: 'Horario de recepción', t: 'text', max: 120, si: conAlmacen, help: 'Ejemplo: lunes a sábado de 7:00 a 19:00.' },

    { k: 'sec_maniobras', t: 'sec', l: 'Maniobras', s: 'Carga, descarga y manejo de mercancía', icon: 'boxes', si: conManiobras },
    { k: 'man_tipos', l: 'Tipos de maniobra', t: 'multi', req: true, si: conManiobras,
      op: ['Carga y descarga', 'Estiba y desestiba', 'Cross-docking', 'Consolidación y desconsolidación', 'Etiquetado y empaque', 'Emplayado', 'Maniobras en patio', 'Carga sobredimensionada'] },
    { k: 'man_equipo', l: 'Equipo disponible', t: 'multi', req: true, si: conManiobras,
      op: ['Montacargas', 'Patín hidráulico', 'Grúa', 'Rampa niveladora', 'Tractocamión de patio', 'Emplayadora', 'Bandas transportadoras'] },
    { k: 'man_personal', l: 'Personal de maniobras', t: 'number', req: true, min: 1, max: 100000, si: conManiobras },
    { k: 'man_horario', l: 'Disponibilidad', t: 'radio', req: true, op: ['24/7', 'Horario diurno', 'Por cita'], si: conManiobras },
    { k: 'man_ubicaciones', l: 'Dónde realizas maniobras', t: 'text', max: 300, wide: true, si: conManiobras, help: 'Tus instalaciones, las del cliente, puertos, etc.' }] }
];
export const CAMPOS = Object.fromEntries(PASOS.flatMap((p) => p.campos.filter((c) => c.t !== 'sec').map((c) => [c.k, c])));
/* ¿El campo aplica a este registro? Flota, forwarder, almacenes y maniobras dependen de los servicios elegidos. */
export const visible = (c, d) => !c.si || c.si(d || {});
export const aplica = (c, d) => c.t !== 'sec' && visible(c, d);

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
      if (!aplica(c, datos)) return;
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
