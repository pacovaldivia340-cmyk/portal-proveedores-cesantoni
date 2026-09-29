# Plataforma de proveedores CESANTONI | Somos Logística (versión web)

Página independiente, sin servidor propio y sin Google Apps Script:

| Parte | Servicio (plan gratuito, sin tarjeta) |
|---|---|
| Página (portal `index.html` y panel `admin.html`) | GitHub Pages |
| Accesos (proveedores con folio + clave, personal con correo + contraseña) | Firebase Authentication |
| Registros, documentos (guardados por partes), bitácora y usuarios | Cloud Firestore (plan Spark) |
| Correos de avisos | Gmail por Apps Script (~100 destinatarios al día) y EmailJS de respaldo (200 al mes) |
| Recuperación de clave / contraseña | Correo de Firebase Authentication |

Portal: `https://proveedores-cesantoni.github.io/`
Panel: `https://proveedores-cesantoni.github.io/admin.html`

Las colecciones usan el prefijo `pv_`, así que no tocan los datos de la versión de Apps Script.

## Puesta en marcha (una sola vez)

1. **Authentication**: consola de Firebase > Authentication > Comenzar > Correo electrónico/contraseña > Habilitar.
   En *Configuración > Dominios autorizados* agrega `proveedores-cesantoni.github.io`.
   En *Plantillas*, cambia el idioma a Español.
2. **Firestore**: Firestore Database > Reglas > pega `firestore.rules` > Publicar.
3. **App web**: Configuración del proyecto > Tus apps > `</>` (Web) > registra la app y copia
   `apiKey`, `authDomain`, `projectId` y `appId` en `js/config.js`.
4. **EmailJS** (https://www.emailjs.com, plan Free):
   - Email Services > Add > Gmail > conecta el correo que enviará los avisos → anota el *Service ID*.
   - Email Templates > Create: *To Email* `{{to_email}}`, *Subject* `{{subject}}`, *From name*
     `CESANTONI Somos Logística`, y en el contenido (botón «Edit Content» > «Code») escribe `{{{html}}}` → anota el *Template ID*.
   - Account > General: *Public Key*. Account > Security: agrega el dominio `proveedores-cesantoni.github.io` en *Allowed origins*.
   - Copia los tres valores en `js/config.js`.
5. **Correos por Gmail** (opcional, recomendado): en https://script.google.com crea un proyecto nuevo
   «Correo proveedores CESANTONI», pega `apps-script-correo/Correo.gs` y `appsscript.json` (repositorio privado),
   Implementar > Nueva implementación > Aplicación web (Ejecutar como: yo; Acceso: cualquier usuario) y pega la URL `/exec`
   en `js/config.js` > `correo.url`. Si falla o se acaba el límite diario, la página usa EmailJS.
6. **Primer administrador**: abre el panel; la primera vez pide crear la cuenta del administrador principal.
7. **Destinatarios**: en *Panel > Destinatarios* agrega los correos del equipo que recibirán las alertas internas.

## Correos automáticos (dos diseños de tarjeta)

| Momento | Al proveedor (tarjeta clara con folio) | Al equipo (tarjeta de alerta oscura) |
|---|---|---|
| Genera su folio | Folio, clave y botón para continuar | «Nuevo registro» (si el destinatario lo activó) |
| Envía su registro completo | «¡Registro recibido!» | «Registro completo» con datos y lista de documentos |
| Se le pide corrección | Motivo de cada documento | — |
| Reenvía correcciones | «Recibimos tus correcciones» | «Correcciones recibidas» |
| Resolución final | Aprobado / no aprobado | — |

## Panel

Tablero con indicadores y tarjetas de alerta (registros por revisar, correcciones sin respuesta,
documentos por vencer, registros sin avance y correos no entregados), lista con filtros y CSV,
expediente con visor de documentos (zoom, giro, PDF, versiones y descarga), revisión por documento,
resolución, historial, correos con vista previa, destinatarios, usuarios, sistema y respaldo.

## Límites gratuitos

- Firestore: 1 GiB en total, 50 000 lecturas y 20 000 escrituras al día. Los documentos (máx. 5 MB c/u)
  se guardan dentro de Firestore; 1 GiB alcanza para unos 200–300 expedientes completos.
  El uso se ve en *Panel > Sistema*.
- Gmail (Apps Script): unos 100 destinatarios al día con una cuenta de Gmail. EmailJS: 200 correos al mes de respaldo.
  Los que fallen quedan en *Panel > Correos* para reintentar o borrar.
- Sin lectura automática (OCR): las fechas y vigencias se revisan manualmente.

## Respaldo

*Panel > Sistema > Descargar respaldo (JSON)* descarga registros, documentos (datos), usuarios,
destinatarios y correos. Hazlo periódicamente.

## Pruebas

`tests/web/e2e.mjs` (en el repositorio privado) recorre portal y panel con el emulador oficial de Firebase
y las mismas reglas de seguridad: 31 de 31 verificaciones correctas.
