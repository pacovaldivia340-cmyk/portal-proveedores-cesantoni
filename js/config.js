/* Configuración de la plataforma. Estos valores NO son secretos: Firebase y EmailJS están
   diseñados para usarse desde el navegador; la seguridad la dan las reglas de Firestore
   (firestore.rules) y la lista de dominios permitidos de EmailJS.

   1. Firebase: consola de Firebase > Configuración del proyecto > Tus apps > App web > «Configuración del SDK».
   2. EmailJS:  https://dashboard.emailjs.com  > Email Services (service ID), Email Templates (template ID),
                Account > General (Public Key).  */
window.CP_CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  },
  emailjs: {
    publicKey: '',
    serviceId: '',
    templateId: ''
  },
  /* Opcional: liga al aviso de privacidad. */
  privacyUrl: ''
};
