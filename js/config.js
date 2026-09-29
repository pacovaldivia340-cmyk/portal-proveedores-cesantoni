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
  /* Correos por Gmail (Apps Script «Correo proveedores CESANTONI», carpeta apps-script-correo). Pega aquí la URL /exec
     de la implementación. Si queda vacío o falla, se usa EmailJS. */
  correo: {
    url: 'https://script.google.com/macros/s/AKfycbzIjutgV76q8gL34F703HGtKqR3R-__72mTPlFMPqSMmBPd7xGSj-y2osD7-XpRLf_Qqg/exec'
  },
  emailjs: {
    publicKey: '5UDl-dY9RQ6EUDu1U',
    serviceId: 'service_ervj1qs',
    templateId: 'template_lhvvtfp'
  },
  /* Aviso de privacidad (aviso-privacidad.html). Completa razón social, domicilio y correo para solicitudes ARCO. */
  privacyUrl: 'aviso-privacidad.html',
  aviso: {
    responsable: 'CESANTONI',
    domicilio: '',
    correo: ''
  }
};
