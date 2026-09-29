# Plataforma de proveedores CESANTONI | Somos Logística (versión web)

Página independiente, sin servidor propio y sin Google Apps Script:

| Parte | Servicio (plan gratuito, sin tarjeta) |
|---|---|
| Página (portal `index.html` y panel `admin.html`) | GitHub Pages |
| Accesos (proveedores con folio + clave, personal con correo + contraseña) | Firebase Authentication |
| Registros, documentos (guardados por partes), bitácora y usuarios | Cloud Firestore (plan Spark) |
| Correos de avisos | EmailJS (200 correos al mes) |
| Recuperación de clave / contraseña | Correo de Firebase Authentication |

Portal: `https://pacovaldivia340-cmyk.github.io/portal-proveedores-cesantoni/`
Panel: `https://pacovaldivia340-cmyk.github.io/portal-proveedores-cesantoni/admin.html`

Las colecciones usan el prefijo `pv_`, así que no tocan los datos de la versión de Apps Script.

## Puesta en marcha (una sola vez)

1. **Authentication**: consola de Firebase > Authentication > Comenzar > Correo electrónico/contraseña > Habilitar.
   En *Configuración > Dominios autorizados* agrega `pacovaldivia340-cmyk.github.io`.
   En *Plantillas*, cambia el idioma a Español.
2. **Firestore**: Firestore Database > Reglas > pega `firestore.rules` > Publicar.
3. **App web**: Configuración del proyecto > Tus apps > `</>` (Web) > registra la app y copia
   `apiKey`, `authDomain`, `projectId` y `appId` en `js/config.js`.
4. **EmailJS** (https://www.emailjs.com, plan Free):
   - Email Services > Add > Gmail > conecta el correo que enviará los avisos → anota el *Service ID*.
   - Email Templates > Create: *To Email* `{{to_email}}`, *Subject* `{{subject}}`, *From name*
     `CESANTONI Somos Logística`, y en el contenido (botón «Edit Content» > «Code») escribe `{{{html}}}` → anota el *Template ID*.
   - Account > General: *Public Key*. Account > Security: agrega el dominio `pacovaldivia340-cmyk.github.io` en *Allowed origins*.
   - Copia los tres valores en `js/config.js`.
5. **Primer administrador**: abre el panel; la primera vez pide crear la cuenta del administrador principal.

## Límites gratuitos

- Firestore: 1 GiB en total, 50 000 lecturas y 20 000 escrituras al día. Los documentos (máx. 5 MB c/u)
  se guardan dentro de Firestore; 1 GiB alcanza para unos 200–300 expedientes completos.
  El uso se ve en *Panel > Sistema*.
- EmailJS: 200 correos al mes. Los que fallen quedan en *Panel > Correos* para reintentar.
- Sin lectura automática (OCR): las fechas y vigencias se revisan manualmente.

## Respaldo

*Panel > Sistema > Descargar respaldo (JSON)* descarga registros, documentos (datos), usuarios,
destinatarios y correos. Hazlo periódicamente.

## Pruebas

`tests/web/e2e.mjs` (en el repositorio privado) recorre portal y panel con el emulador oficial de Firebase
y las mismas reglas de seguridad: 30 de 30 verificaciones correctas.
