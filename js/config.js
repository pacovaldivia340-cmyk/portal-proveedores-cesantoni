/* Configuración de la plataforma. Estos valores NO son secretos: Firebase y EmailJS están
   diseñados para usarse desde el navegador; la seguridad la dan las reglas de Firestore
   (firestore.rules) y la lista de dominios permitidos de EmailJS.

   1. Firebase: consola de Firebase > Configuración del proyecto > Tus apps > App web > «Configuración del SDK».
   2. EmailJS:  https://dashboard.emailjs.com  > Email Services (service ID), Email Templates (template ID),
                Account > General (Public Key).  */
window.CP_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAb2NEHLxzpW_MmuUavbYnALxjueL1aI84',
    authDomain: 'proveedores-cesantoni.firebaseapp.com',
    projectId: 'proveedores-cesantoni',
    storageBucket: 'proveedores-cesantoni.firebasestorage.app',
    messagingSenderId: '168248619956',
    appId: '1:168248619956:web:f3e1078e744512bdd538e1'
  },
  emailjs: {
    publicKey: '5UDl-dY9RQ6EUDu1U',
    serviceId: 'service_ervj1qs',
    templateId: 'template_lhvvtfp'
  },
  /* Opcional: liga al aviso de privacidad. */
  privacyUrl: ''
};
