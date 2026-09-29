/* Portal del proveedor: registro por pasos con guardado automático, carga de documentos
   con validación inmediata de fechas, envío a revisión y atención de correcciones. */
(function () {
  'use strict';
  var h = CP.h, mount = CP.mount, api = CP.api;
  var main = document.getElementById('main');
  var STEPS = ['contacto', 'empresa', 'operacion', 'documentos', 'revision'];
  var AUTOCOMPLETE = {
    contacto_nombre: 'name', contacto_puesto: 'organization-title', contacto_email: 'email',
    contacto_telefono: 'tel', razon_social: 'organization', domicilio_calle: 'address-line1',
    domicilio_colonia: 'address-line2', domicilio_ciudad: 'address-level2', domicilio_estado: 'address-level1',
    domicilio_cp: 'postal-code', sitio_web: 'url'
  };
  var DRAFT_KEY = 'cp_borrador_contacto';

  var cfg = null;            // configuración pública: pasos, documentos y catálogos
  var view = null;           // registro vigente (respuesta del servidor)
  var data = {};             // datos capturados
  var stepDefs = {};         // definición de cada paso de datos
  var docDefs = {};          // definición de cada tipo de documento
  var current = '';          // pantalla visible
  var touched = {};          // campos que el usuario ya editó
  var reveal = {};           // pasos donde se muestran todos los errores
  var preErrors = {};        // errores del paso de contacto antes de tener folio
  var refs = {};             // referencias a campos visibles (para actualizar errores sin redibujar)
  var saver = { dirty: false, inflight: null, again: false, retry: null, text: null, changed: {}, seq: 0 };
  var draft = loadDraft();

  /* ------------------------------------------------------------------ arranque */
  function init() {
    var session = api('GET', '/api/portal/registro').catch(function (e) { if (e.status === 401) return null; throw e; });
    Promise.all([
      api('GET', '/api/portal/config'),
      session
    ]).then(function (res) {
      cfg = res[0];
      cfg.steps.forEach(function (s) { stepDefs[s.id] = s; });
      cfg.doc_types.forEach(function (d) { docDefs[d.key] = d; });
      CP.logos(document.getElementById('brand'), cfg.logos);
      var params = new URLSearchParams(location.search);
      var flash = params.get('enlace') === 'invalido' ? 'enlace' : '';
      window.addEventListener('hashchange', route);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && saver.dirty) save({ keepalive: true });
      });
      window.addEventListener('pagehide', function () { if (saver.dirty) save({ keepalive: true }); });
      if (res[1]) setView(res[1]);
      route(flash);
    }).catch(function (e) {
      mount(main, h('div', { class: 'notice notice-bad' }, h('h3', null, 'No fue posible cargar el registro'),
        h('p', null, e.message), h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { location.reload(); } }, 'Reintentar')));
    });
  }

  function setView(v) {
    /* Si hay cambios locales aún no guardados se conservan (el servidor los recibirá en el siguiente guardado). */
    var keepLocal = view && v.id === view.id && (saver.dirty || saver.inflight);
    view = v;
    if (keepLocal) view.data = JSON.parse(JSON.stringify(data));
    else { data = JSON.parse(JSON.stringify(v.data || {})); saver.changed = {}; }
    if (v.csrf) CP.state.csrf = v.csrf;
    renderTop();
  }

  function goTo(screen) {
    if (location.hash === '#' + screen) route(); else location.hash = screen;
  }

  function defaultScreen() {
    if (!view) return 'inicio';
    if (!view.editable || view.estado === 'correccion') return 'estado';
    return STEPS.indexOf(view.paso_actual) >= 0 ? view.paso_actual : 'empresa';
  }

  function route(flash) {
    var target = (location.hash || '').replace(/^#\/?/, '');
    if (typeof flash !== 'string') flash = '';
    if (!view) {
      if (target === 'contacto') return showWizard('contacto');
      if (target && target !== 'inicio') history.replaceState(null, '', location.pathname);
      return showLanding(flash);
    }
    if (target === 'estado' && view.estado !== 'iniciado') return showStatus();
    if (STEPS.indexOf(target) >= 0 && view.editable) return showWizard(target);
    var fallback = defaultScreen();
    if (location.hash !== '#' + fallback) history.replaceState(null, '', location.pathname + '#' + fallback);
    return fallback === 'estado' ? showStatus() : showWizard(fallback);
  }

  function renderTop() {
    var box = document.getElementById('top-actions');
    if (!view) { CP.clear(box); return; }
    mount(box,
      h('span', { class: 'folio-badge', 'aria-label': 'Folio ' + view.folio },
        h('span', { class: 'label', 'aria-hidden': 'true' }, 'Folio'), h('span', { class: 'value', 'aria-hidden': 'true' }, view.folio)),
      h('button', { type: 'button', class: 'btn btn-sm btn-quiet', onclick: logout }, 'Salir'));
  }

  function focusMain(el) {
    var target = el || main.querySelector('h1');
    if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ portada */
  function showLanding(flash) {
    current = 'inicio';
    refs = {};
    var notices = [];
    if (flash === 'enlace') {
      notices.push(h('div', { class: 'notice notice-warn', style: { marginBottom: '24px' } },
        h('h3', null, 'El enlace ya no es válido'),
        h('p', null, 'Venció o está incompleto. Entra con tu folio y tu clave de acceso.')));
    }
    var docs = h('ol', null, cfg.doc_types.map(function (d) {
      return h('li', null,
        h('span', null, d.label, d.required_if ? h('span', { class: 'muted' }, ' (si operas en Centroamérica)') : null),
        h('span', { class: 'rule' + (d.rule === 'max_age' ? ' age' : '') }, ruleShort(d)));
    }));
    mount(main, notices,
      h('div', { class: 'hero' },
        h('div', { class: 'hero-copy' },
          h('p', { class: 'eyebrow' }, 'CESANTONI · RED DE PROVEEDORES'),
          h('h1', { class: 'hero-title' }, 'Registro de proveedores'),
          h('p', { class: 'hero-lead' }, 'Da de alta a tu empresa como proveedor de transporte y logística de CESANTONI. ' +
            'Captura tus datos, sube tus documentos y envía tu expediente a revisión. Tu avance se guarda solo: puedes pausar y continuar después.'),
          h('div', { class: 'hero-points', 'aria-label': 'Ventajas del proceso' },
            h('span', null, h('b', null, '01'), ' Proceso guiado'),
            h('span', null, h('b', null, '02'), ' Guardado automático'),
            h('span', null, h('b', null, '03'), ' Seguimiento por folio')),
          h('div', { class: 'entry' },
            h('section', { class: 'panel primary', 'aria-labelledby': 'new-title' },
              h('h2', { id: 'new-title' }, 'Nuevo registro'),
              h('p', { class: 'grow muted' }, 'Empieza con tus datos de contacto. Al terminar ese paso recibes tu folio y una clave para continuar desde cualquier dispositivo.'),
              h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { goTo('contacto'); } }, 'Iniciar registro')),
            resumePanel()),
          h('p', { class: 'coverage' }, 'Operación nacional en México. Cobertura internacional únicamente en Centroamérica: ' +
            cfg.centroamerica.join(', ') + '.')),
        h('aside', { class: 'panel checklist', 'aria-labelledby': 'docs-title' },
          h('h2', { id: 'docs-title' }, 'Documentos que te pediremos'),
          h('p', { class: 'small muted' }, 'No capturas fechas: el equipo de Logística revisa la fecha y la vigencia de cada documento.'),
          docs,
          h('p', { class: 'foot' }, 'PDF, JPG, PNG o WEBP de hasta ' + cfg.max_upload_mb + ' MB por archivo.'))));
    renderTop();
    focusMain();
  }

  function ruleShort(d) {
    return d.rule === 'max_age' ? 'Máx. ' + cfg.max_age_months + ' meses' : 'Vigente';
  }

  function resumePanel() {
    var folio = h('input', { class: 'input', id: 'r-folio', name: 'folio', autocomplete: 'off', autocapitalize: 'characters',
      spellcheck: 'false', placeholder: 'PRV-' + new Date().getFullYear() + '-00001' });
    var code = h('input', { class: 'input', id: 'r-code', name: 'codigo', autocomplete: 'off', autocapitalize: 'characters',
      spellcheck: 'false', placeholder: 'XXXX-XXXX' });
    var err = h('p', { class: 'error small', role: 'alert', hidden: true });
    var submit = h('button', { type: 'submit', class: 'btn btn-dark' }, 'Continuar');
    var form = h('form', { novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'r-folio' }, 'Folio'), folio),
      h('div', { class: 'field' }, h('label', { for: 'r-code' }, 'Clave de acceso'), code),
      err, submit);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.hidden = true;
      if (!folio.value.trim() || !code.value.trim()) { err.textContent = 'Escribe tu folio y tu clave de acceso.'; err.hidden = false; return; }
      CP.busy(submit, true, 'Entrando…');
      api('POST', '/api/portal/continuar', { folio: folio.value.trim(), codigo: code.value.trim() }).then(function (res) {
        setView(res);
        goTo(defaultScreen());
      }).catch(function (e) {
        CP.busy(submit, false);
        err.textContent = e.message; err.hidden = false;
      });
    });
    var panel = h('section', { class: 'panel', 'aria-labelledby': 'resume-title' },
      h('h2', { id: 'resume-title' }, 'Continuar un registro'), form);
    if (cfg.correo_activo) panel.appendChild(linkRequest());
    return panel;
  }

  function linkRequest() {
    var box = h('div', { hidden: true });
    var toggle = h('button', { type: 'button', class: 'link-btn small', 'aria-expanded': 'false' }, 'No tengo mi clave: recuperarla por correo');
    toggle.addEventListener('click', function () {
      box.hidden = !box.hidden;
      toggle.setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) box.querySelector('input').focus();
    });
    var folio = h('input', { class: 'input', id: 'l-folio', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'Folio' });
    var email = h('input', { class: 'input', id: 'l-email', type: 'email', autocomplete: 'email', placeholder: 'nombre@empresa.com' });
    var msg = h('p', { class: 'small', role: 'status' });
    var send = h('button', { type: 'submit', class: 'btn btn-sm' }, 'Enviar correo');
    var form = h('form', { novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'l-folio' }, 'Folio'), folio),
      h('div', { class: 'field' }, h('label', { for: 'l-email' }, 'Correo del contacto registrado'), email), send, msg);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!folio.value.trim() || !email.value.trim()) { msg.textContent = 'Escribe tu folio y tu correo.'; return; }
      CP.busy(send, true, 'Enviando…');
      api('POST', '/api/portal/enlace', { folio: folio.value.trim(), email: email.value.trim() }).then(function (res) {
        CP.busy(send, false); msg.textContent = res.mensaje;
      }).catch(function (e) { CP.busy(send, false); msg.textContent = e.message; });
    });
    box.appendChild(form);
    return h('div', null, toggle, box);
  }

  /* ------------------------------------------------------------------ asistente */
  function stepTitle(id) {
    if (stepDefs[id]) return stepDefs[id].title;
    return id === 'documentos' ? 'Documentos' : 'Revisión y envío';
  }

  function showWizard(step) {
    if (current !== step && saver.dirty) save();
    current = step;
    refs = {};
    var card = h('section', { class: 'panel step-card', 'aria-labelledby': 'step-title' });
    if (stepDefs[step]) buildDataStep(card, step);
    else if (step === 'documentos') buildDocsStep(card);
    else buildReviewStep(card);
    mount(main, routeBar(step), h('div', { class: 'wizard' }, card, sideCard()));
    renderTop();
    focusMain(document.getElementById('step-title'));
  }

  function routeBar(step) {
    var idx = STEPS.indexOf(step);
    var flags = view ? problemSteps() : {};
    var list = h('ol', { class: 'route', 'aria-label': 'Pasos del registro' });
    STEPS.forEach(function (id, i) {
      var cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      if (flags[id] && reveal.all) cls += ' flag';
      list.appendChild(h('li', { class: cls.trim() || null },
        h('button', { type: 'button', disabled: !view && i > 0, 'aria-current': i === idx ? 'step' : null,
          onclick: function () { goTo(id); } },
          h('span', { class: 'stop', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, stepTitle(id)))));
    });
    var mobile = h('div', { class: 'route-mobile', 'aria-hidden': 'true' },
      h('div', { class: 'row' }, h('span', null, 'Paso ' + (idx + 1) + ' de ' + STEPS.length + ' · ' + stepTitle(step)),
        view ? h('span', { class: 'folio' }, view.folio) : null),
      h('div', { class: 'bar' }, h('span', { style: { width: Math.round((idx + 1) / STEPS.length * 100) + '%' } })));
    return h('nav', { 'aria-label': 'Avance del registro' }, list, mobile);
  }

  function sideCard() {
    if (!view) {
      return h('aside', { class: 'panel side-card', 'aria-label': 'Qué sigue' },
        h('h2', null, 'Qué sigue'),
        h('p', { class: 'small' }, 'Al guardar tus datos de contacto generamos tu folio y una clave de acceso.'),
        h('p', { class: 'small muted' }, 'Después capturas los datos de la empresa y de tu operación, y subes tus documentos. ' +
          'Puedes salir en cualquier momento: tu avance queda guardado.'));
    }
    var docs = docCounts();
    saver.text = h('dd', { 'aria-live': 'polite', class: 'save-state' }, saver.lastText || 'Todo guardado');
    return h('aside', { class: 'panel side-card', 'aria-label': 'Resumen del registro' },
      h('h2', null, 'Tu registro'),
      h('dl', null,
        h('dt', null, 'Folio'), h('dd', { class: 'big-folio' }, view.folio),
        h('dt', null, 'Estado'), h('dd', null, view.estado_label),
        h('dt', null, 'Empresa'), h('dd', null, data.razon_social || '—'),
        h('dt', null, 'Documentos'), h('dd', null, docs.entregados + ' de ' + docs.requeridos + ' entregados'),
        h('dt', null, 'Guardado'), saver.text),
      h('hr'),
      h('p', { class: 'small muted' }, 'Para continuar después entra con tu folio y tu clave de acceso.'),
      h('p', { class: 'small' }, h('button', { type: 'button', class: 'link-btn', onclick: newCode }, 'Generar una nueva clave de acceso')));
  }

  function docCounts() {
    var r = 0, e = 0;
    (view.documentos || []).forEach(function (d) { if (d.requerido) { r++; if (d.entregado) e++; } });
    return { requeridos: r, entregados: e };
  }

  /* ---- pasos de datos */
  function stepErrors(step) {
    if (!view) return preErrors;
    return (view.errores && view.errores[step]) || {};
  }

  function buildDataStep(card, step) {
    var def = stepDefs[step];
    var errors = stepErrors(step);
    var grid = h('div', { class: 'form-grid' });
    def.fields.forEach(function (f) {
      var value = view ? data[f.key] : draft.data[f.key];
      grid.appendChild(fieldEl(f, value, errors[f.key], step));
    });
    card.appendChild(h('header', null, h('h1', { id: 'step-title' }, def.title), h('p', null, def.intro)));
    card.appendChild(grid);
    var actions = h('div', { class: 'step-actions' });
    if (!view) {
      var consent = h('input', { type: 'checkbox', id: 'consent', checked: !!draft.consent });
      consent.addEventListener('change', function () { draft.consent = consent.checked; saveDraft(); consentErr.hidden = true; });
      var consentText = cfg.privacy_url
        ? ['Acepto el ', h('a', { href: cfg.privacy_url, target: '_blank', rel: 'noopener' }, 'aviso de privacidad'),
          ' y autorizo a CESANTONI a usar estos datos para evaluar mi registro como proveedor.']
        : ['Autorizo a CESANTONI a usar estos datos únicamente para evaluar mi registro como proveedor.'];
      var consentErr = h('p', { class: 'error small', id: 'consent-error', hidden: true, role: 'alert' }, 'Marca la casilla para continuar.');
      card.appendChild(h('div', { class: 'span-2', style: { marginTop: '22px' } },
        h('label', { class: 'check', for: 'consent' }, consent, h('span', null, consentText)), consentErr));
      var start = h('button', { type: 'button', class: 'btn btn-primary' }, 'Generar folio y continuar');
      start.addEventListener('click', function () { startRegistration(start, consent, consentErr); });
      actions.appendChild(h('span', { class: 'spacer' }));
      actions.appendChild(start);
    } else {
      var idx = STEPS.indexOf(step);
      if (idx > 0) actions.appendChild(h('button', { type: 'button', class: 'btn', onclick: function () { goTo(STEPS[idx - 1]); } }, 'Anterior'));
      actions.appendChild(h('span', { class: 'spacer' }));
      var nextBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Guardar y continuar');
      nextBtn.addEventListener('click', function () { continueFrom(step, nextBtn); });
      actions.appendChild(nextBtn);
    }
    card.appendChild(actions);
  }

  function describedBy(f, err) {
    var ids = [];
    if (f.help) ids.push('h-' + f.key);
    if (err) ids.push('e-' + f.key);
    return ids.join(' ') || null;
  }

  function fieldEl(f, value, err, step) {
    var shown = err && (reveal[step] || touched[f.key]) ? err : '';
    var errEl = h('p', { class: 'error', id: 'e-' + f.key, hidden: !shown }, shown);
    var help = f.help ? h('p', { class: 'help', id: 'h-' + f.key }, f.help) : null;
    var req = f.required ? [h('span', { class: 'req', 'aria-hidden': 'true' }, '*'), h('span', { class: 'sr-only' }, ' (obligatorio)')] : null;
    var wrap, control;
    if (f.type === 'multi' || f.type === 'radio') {
      var multi = f.type === 'multi';
      var cls = multi ? 'choices' + (f.key === 'cobertura_nacional' ? ' grid-states' : '') : 'options-tiles';
      control = h('div', { class: cls });
      f.options.forEach(function (opt, i) {
        var checked = multi ? (value || []).indexOf(opt) >= 0 : value === opt;
        var input = h('input', { type: multi ? 'checkbox' : 'radio', name: f.key, value: opt, id: 'f-' + f.key + '-' + i, checked: checked });
        input.addEventListener('change', function () { onChoice(f, input, control); });
        var itemCls = multi ? 'choice' + (opt === cfg.todaLaRepublica ? ' all' : '') : 'tile';
        control.appendChild(h('label', { class: itemCls }, input, h('span', null, opt)));
      });
      wrap = h('fieldset', { class: 'field span-2' + (shown ? ' invalid' : ''), id: 'w-' + f.key,
        'aria-describedby': describedBy(f, shown), role: multi ? 'group' : 'radiogroup' },
        h('legend', null, f.label, req), help, control, errEl);
    } else {
      var common = { class: 'input', id: 'f-' + f.key, name: f.key, 'aria-invalid': shown ? 'true' : null,
        'aria-describedby': describedBy(f, shown), 'aria-required': f.required ? 'true' : null,
        autocomplete: AUTOCOMPLETE[f.key] || null };
      if (f.type === 'select') {
        control = h('select', common, h('option', { value: '' }, 'Selecciona…'),
          f.options.map(function (o) { return h('option', { value: o }, o); }));
        control.value = value || '';
        control.addEventListener('change', function () { touched[f.key] = true; setValue(f.key, control.value); });
      } else {
        common.type = f.type === 'number' ? 'number' : (f.type === 'text' ? 'text' : f.type);
        if (f.type === 'number') { common.min = f.min; common.max = f.max; common.inputmode = 'numeric'; common.step = '1'; }
        else if (f.max) common.maxlength = f.max;
        if (f.key === 'tax_id') { common.autocapitalize = 'characters'; common.spellcheck = 'false'; }
        control = h('input', common);
        control.value = value === undefined || value === null ? '' : String(value);
        control.addEventListener('input', function () { setValue(f.key, control.value); });
        control.addEventListener('blur', function () { if (!touched[f.key]) { touched[f.key] = true; applyErrors(); } });
      }
      var wide = f.key === 'razon_social' || f.key === 'domicilio_calle';
      wrap = h('div', { class: 'field' + (wide ? ' span-2' : '') + (shown ? ' invalid' : ''), id: 'w-' + f.key },
        h('label', { for: 'f-' + f.key }, f.label, req), control, help, errEl);
    }
    refs[f.key] = { wrap: wrap, err: errEl, control: control, field: f, step: step };
    return wrap;
  }

  function onChoice(f, input, group) {
    touched[f.key] = true;
    if (f.type === 'radio') { setValue(f.key, input.value); return; }
    var store = view ? data : draft.data;
    var arr = (store[f.key] || []).slice();
    var i = arr.indexOf(input.value);
    if (input.checked && i < 0) arr.push(input.value);
    if (!input.checked && i >= 0) arr.splice(i, 1);
    if (f.key === 'cobertura_nacional') {
      if (input.checked && input.value === cfg.todaLaRepublica) arr = [cfg.todaLaRepublica];
      else if (input.checked) arr = arr.filter(function (v) { return v !== cfg.todaLaRepublica; });
      Array.prototype.forEach.call(group.querySelectorAll('input'), function (el) { el.checked = arr.indexOf(el.value) >= 0; });
    }
    setValue(f.key, f.options.filter(function (o) { return arr.indexOf(o) >= 0; }));
  }

  function setValue(key, value) {
    if (!view) {
      draft.data[key] = value;
      saveDraft();
      if (preErrors[key]) { delete preErrors[key]; applyErrors(); }
      return;
    }
    data[key] = value;
    saver.changed[key] = ++saver.seq;   // su error del servidor ya no aplica hasta el siguiente guardado
    saver.dirty = true;
    setSaveText('Cambios sin guardar');
    saveSoon();
  }

  function applyErrors() {
    Object.keys(refs).forEach(function (key) {
      var r = refs[key];
      var err = view && saver.changed[key] ? '' : stepErrors(r.step)[key];
      var shown = err && (reveal[r.step] || touched[key]) ? err : '';
      r.err.textContent = shown;
      r.err.hidden = !shown;
      r.wrap.classList.toggle('invalid', !!shown);
      var target = r.field.type === 'multi' || r.field.type === 'radio' ? r.wrap : r.control;
      if (r.control.tagName !== 'DIV') r.control.setAttribute('aria-invalid', shown ? 'true' : 'false');
      var desc = describedBy(r.field, shown);
      if (desc) target.setAttribute('aria-describedby', desc); else target.removeAttribute('aria-describedby');
    });
  }

  function focusFirstError() {
    var first = main.querySelector('.field.invalid');
    if (!first) return;
    var ctl = first.querySelector('input, select, textarea');
    first.scrollIntoView({ block: 'center' });
    if (ctl) ctl.focus({ preventScroll: true });
  }

  /* ---- guardado automático */
  var saveSoon = CP.debounce(function () { save(); }, 800);

  function setSaveText(text, bad) {
    saver.lastText = text;
    if (saver.text) { saver.text.textContent = text; saver.text.classList.toggle('bad', !!bad); }
  }

  function save(opts) {
    if (!view || !view.editable) return Promise.resolve();
    saveSoon.cancel();
    if (saver.inflight) { saver.again = true; return saver.inflight; }
    saver.dirty = false;
    clearTimeout(saver.retry);
    setSaveText('Guardando…');
    var paso = STEPS.indexOf(current) >= 0 ? current : view.paso_actual;
    var sent = Object.assign({}, saver.changed);
    var p = api('PUT', '/api/portal/registro', { data: data, paso_actual: paso }, { keepalive: !!(opts && opts.keepalive) })
      .then(function (res) {
        Object.keys(sent).forEach(function (k) { if (saver.changed[k] === sent[k]) delete saver.changed[k]; });
        view.errores = res.errores;
        if (res.requeridos) {  // p. ej. el permiso internacional depende de la cobertura en Centroamérica
          view.requeridos = res.requeridos;
          (view.documentos || []).forEach(function (d) { d.requerido = res.requeridos.indexOf(d.tipo) >= 0; });
        }
        view.data = JSON.parse(JSON.stringify(data));
        view.paso_actual = paso;
        view.fecha_actualizacion = res.guardado_en;
        setSaveText('Guardado a las ' + CP.fmtTime(res.guardado_en));
        applyErrors();
      })
      .catch(function (e) {
        saver.dirty = true;
        if (sessionProblem(e)) return;
        setSaveText('Sin guardar: ' + e.message, true);
        if (e.status === 0 || e.status >= 500) saver.retry = setTimeout(save, 8000);
      })
      .then(function () {
        saver.inflight = null;
        if (saver.again) { saver.again = false; if (saver.dirty) return save(); }
      });
    saver.inflight = p;
    return p;
  }

  function sessionProblem(e) {
    if (e.status === 401) {
      view = null; saver.dirty = false; renderTop();
      CP.toast('Tu sesión terminó. Entra de nuevo con tu folio y tu clave.', 'bad');
      location.hash = '';
      showLanding('');
      return true;
    }
    if (e.status === 409) {
      CP.toast(e.message, 'bad');
      reload();
      return true;
    }
    return false;
  }

  function reload() {
    return api('GET', '/api/portal/registro').then(function (res) { setView(res); route(); })
      .catch(function (e) { if (!sessionProblem(e)) CP.toast(e.message, 'bad'); });
  }

  function continueFrom(step, btn) {
    CP.busy(btn, true, 'Guardando…');
    (saver.inflight || Promise.resolve()).then(function () {
      saver.dirty = true;
      return save();
    }).then(function () {
      CP.busy(btn, false);
      if (!view) return;
      var errs = stepErrors(step);
      if (Object.keys(errs).length) {
        reveal[step] = true;
        applyErrors();
        CP.toast('Revisa los datos marcados antes de continuar.', 'bad');
        focusFirstError();
        return;
      }
      goTo(STEPS[STEPS.indexOf(step) + 1]);
    });
  }

  /* ---- alta (genera folio) */
  function loadDraft() {
    var empty = { data: {}, consent: false, requestId: '' };
    try {
      var raw = window.sessionStorage.getItem(DRAFT_KEY);
      return raw ? Object.assign(empty, JSON.parse(raw)) : empty;
    } catch (e) { return empty; }
  }
  function saveDraft() {
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* almacenamiento no disponible */ }
  }
  function clearDraft() {
    draft = { data: {}, consent: false, requestId: '' };
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* nada */ }
  }

  /* Revisión previa en el navegador de los datos de contacto (el servidor vuelve a validar todo). */
  function contactErrors() {
    var errs = {};
    stepDefs.contacto.fields.forEach(function (f) {
      var v = draft.data[f.key];
      var text = v === undefined || v === null ? '' : String(v).trim();
      if (!text) { if (f.required) errs[f.key] = 'Este dato es obligatorio.'; return; }
      if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) errs[f.key] = 'Escribe un correo válido (ejemplo: nombre@empresa.com).';
      if (f.type === 'tel') { var n = text.replace(/\D/g, '').length; if (n < 7 || n > 15) errs[f.key] = 'Escribe un teléfono válido de 7 a 15 dígitos.'; }
    });
    return errs;
  }

  function startRegistration(btn, consent, consentErr) {
    var local = contactErrors();
    var missingConsent = !consent.checked;
    if (Object.keys(local).length || missingConsent) {
      preErrors = local;
      reveal.contacto = true;
      applyErrors();
      consentErr.hidden = !missingConsent;
      if (Object.keys(local).length) focusFirstError(); else consent.focus();
      return;
    }
    if (!draft.requestId) { draft.requestId = CP.uuid(); saveDraft(); }
    var payload = { client_request_id: draft.requestId, consentimiento: true, data: {} };
    stepDefs.contacto.fields.forEach(function (f) { payload.data[f.key] = draft.data[f.key] === undefined ? '' : draft.data[f.key]; });
    CP.busy(btn, true, 'Generando folio…');
    api('POST', '/api/portal/iniciar', payload).then(function (res) {
      var code = res.clave_acceso;
      var email = payload.data.contacto_email;
      clearDraft();
      preErrors = {};
      setView(res);
      showCredentials(code, true, email).then(function () { goTo('empresa'); });
    }).catch(function (e) {
      CP.busy(btn, false);
      if (e.errors && e.errors.contacto) {
        preErrors = e.errors.contacto;
        reveal.contacto = true;
        applyErrors();
        focusFirstError();
      }
      CP.toast(e.message, 'bad');
    });
  }

  function showCredentials(code, first, email) {
    return new Promise(function (resolve) {
      var ok = h('button', { type: 'button', class: 'btn btn-primary', autofocus: true }, 'Ya guardé mis datos');
      var copy = h('button', { type: 'button', class: 'btn' }, 'Copiar');
      copy.addEventListener('click', function () {
        CP.copyText('Registro de proveedores CESANTONI\nFolio: ' + view.folio + '\nClave de acceso: ' + code)
          .then(function () { CP.toast('Folio y clave copiados.', 'ok'); })
          .catch(function () { CP.toast('No se pudo copiar; anótalos manualmente.', 'bad'); });
      });
      var note = cfg.correo_activo && first
        ? 'También enviamos tu folio y tu clave a ' + email + '.'
        : 'Anota tu clave: por seguridad no se vuelve a mostrar. Si la pierdes puedes generar otra desde tu registro.';
      var m = CP.modal({
        title: first ? 'Tu folio está listo' : 'Nueva clave de acceso',
        body: [
          h('p', null, first ? 'Guarda estos datos. Con ellos puedes continuar tu registro desde cualquier dispositivo.'
            : 'La clave anterior dejó de funcionar. Guarda la nueva.'),
          h('dl', { class: 'credential' }, h('dt', null, 'Folio'), h('dd', null, view.folio),
            h('dt', null, 'Clave de acceso'), h('dd', null, code)),
          h('p', { class: 'small muted' }, note)],
        actions: [copy, ok], locked: true, onClose: resolve
      });
      ok.addEventListener('click', m.close);
    });
  }

  function newCode() {
    var confirmBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Generar nueva clave');
    var cancel = h('button', { type: 'button', class: 'btn' }, 'Cancelar');
    var m = CP.modal({ title: 'Generar una nueva clave', body: h('p', null, 'La clave actual dejará de funcionar.'),
      actions: [cancel, confirmBtn] });
    cancel.addEventListener('click', m.close);
    confirmBtn.addEventListener('click', function () {
      CP.busy(confirmBtn, true, 'Generando…');
      api('POST', '/api/portal/nueva-clave').then(function (res) {
        m.close();
        showCredentials(res.clave_acceso, false);
      }).catch(function (e) { m.close(); if (!sessionProblem(e)) CP.toast(e.message, 'bad'); });
    });
  }

  function logout() {
    var finish = function () {
      view = null; data = {}; CP.state.csrf = ''; saver.dirty = false;
      renderTop();
      history.replaceState(null, '', location.pathname);
      showLanding('');
    };
    (saver.dirty ? save() : Promise.resolve()).then(function () {
      return api('POST', '/api/portal/salir');
    }).then(finish, finish);
  }

  /* ---- documentos */
  function buildDocsStep(card) {
    card.appendChild(h('header', null, h('h1', { id: 'step-title' }, 'Documentos'),
      h('p', null, 'Sube cada documento en PDF o imagen. El equipo de Logística revisa manualmente sus fechas: los documentos con antigüedad máxima deben ser de los últimos ' +
        cfg.max_age_months + ' meses y las pólizas y permisos deben estar vigentes.')));
    card.appendChild(docList(view.documentos.filter(function (d) { return d.requerido || d.entregado || d.ultimo_intento; })));
    var optional = view.documentos.filter(function (d) { return !d.requerido && !d.entregado && !d.ultimo_intento; });
    if (optional.length) {
      card.appendChild(h('p', { class: 'small muted', style: { marginTop: '14px' } },
        'Opcional según tu operación: ', optional.map(function (d) { return docDefs[d.tipo].label; }).join(', '),
        '. Se vuelve obligatorio si marcas cobertura en Centroamérica.'));
    }
    card.appendChild(h('div', { class: 'step-actions' },
      h('button', { type: 'button', class: 'btn', onclick: function () { goTo('operacion'); } }, 'Anterior'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { goTo('revision'); } }, 'Continuar a revisión')));
  }

  function docList(items, mode) {
    var list = h('ul', { class: 'doc-list' });
    items.forEach(function (d) { list.appendChild(docRow(d, mode)); });
    return list;
  }

  function validationPill(doc) {
    return CP.pill(CP.VALIDACION_KIND[doc.validacion] || 'plain', doc.validacion_label);
  }

  function docRow(d, mode) {
    var def = docDefs[d.tipo];
    var cur = d.actual, last = d.ultimo_intento;
    var readOnly = mode === 'lectura';
    var pills = [];
    if (cur) {
      if (!readOnly || cur.revision === 'pendiente') pills.push(validationPill(cur));
      if (view.estado !== 'iniciado' && cur.revision !== 'pendiente') pills.push(CP.pill(CP.REVISION_KIND[cur.revision] || 'plain', cur.revision_label));
    } else if (last && last.validacion === 'rechazado') {
      pills.push(CP.pill('bad', 'Rechazado por fecha'));
    } else {
      pills.push(CP.pill('plain', d.requerido ? 'Pendiente' : 'Opcional'));
    }
    var fileInfo = cur ? h('div', { class: 'file' },
      cur.archivo_url ? h('a', { href: cur.archivo_url, target: '_blank', rel: 'noopener' }, cur.nombre_original) : h('strong', null, cur.nombre_original),
      h('span', { class: 'muted' }, CP.fmtSize(cur.tamano)),
      h('span', { class: 'muted' }, 'Subido el ' + CP.fmtDateTime(cur.subido_en)),
      cur.version > 1 ? h('span', { class: 'muted' }, 'Versión ' + cur.version) : null) : null;
    var li = h('li', { class: 'doc-row' + (d.requerido ? '' : ' optional') + (readOnly ? ' readonly' : ''), id: (readOnly ? 'doc-l-' : 'doc-') + d.tipo },
      h('div', null,
        h('h3', null, h('span', null, def.label), readOnly ? null : h('span', { class: 'rule' }, def.rule === 'max_age'
          ? 'Antigüedad máxima: ' + cfg.max_age_months + ' meses' : 'Debe estar vigente'), pills),
        readOnly ? null : h('p', { class: 'help' }, def.help), fileInfo));
    var actions = h('div', { class: 'actions' });
    if (d.puede_subir && !readOnly) {
      var input = h('input', { type: 'file', accept: cfg.accept, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
      var btn = h('button', { type: 'button', class: 'btn btn-sm' + (cur ? '' : ' btn-dark') },
        cur ? 'Reemplazar archivo' : 'Subir archivo');
      btn.setAttribute('aria-label', (cur ? 'Reemplazar archivo de ' : 'Subir archivo de ') + def.label);
      btn.addEventListener('click', function () { input.value = ''; input.click(); });
      input.addEventListener('change', function () { if (input.files[0]) upload(d, input.files[0], li, btn, mode); });
      li.addEventListener('dragover', function (ev) { ev.preventDefault(); li.classList.add('selected'); });
      li.addEventListener('dragleave', function () { li.classList.remove('selected'); });
      li.addEventListener('drop', function (ev) {
        ev.preventDefault(); li.classList.remove('selected');
        if (ev.dataTransfer.files[0]) upload(d, ev.dataTransfer.files[0], li, btn, mode);
      });
      actions.appendChild(btn);
      actions.appendChild(input);
    }
    li.appendChild(actions);
    var result = h('div', { class: 'result', 'aria-live': 'polite' });
    var notice = docNotice(d, readOnly);
    if (notice) result.appendChild(notice);
    li.appendChild(result);
    return li;
  }

  function docNotice(d, readOnly) {
    var cur = d.actual, last = d.ultimo_intento;
    if (d.motivo && !readOnly) {
      return h('div', { class: 'notice notice-orange' }, h('h3', null, 'Corrección solicitada'),
        h('p', null, d.motivo), d.observaciones ? h('p', { class: 'small' }, 'Observaciones: ' + d.observaciones) : null);
    }
    if (last && last.validacion === 'rechazado' && (!cur || last.id > cur.id) && !readOnly) {
      return h('div', { class: 'notice notice-bad' }, h('h3', null, 'No aceptamos «' + last.nombre_original + '»'),
        h('p', null, last.validacion_detalle),
        cur ? h('p', { class: 'small' }, 'Conservamos la versión anterior mientras subes una actualizada.') : null);
    }
    if (!cur || readOnly) return null;
    var kind = cur.validacion === 'valido' ? 'ok' : (cur.validacion === 'rechazado' ? 'bad' : 'warn');
    return h('div', { class: 'notice notice-' + kind }, h('p', null, cur.validacion_detalle));
  }

  function upload(d, file, li, btn, mode) {
    var def = docDefs[d.tipo];
    var result = li.querySelector('.result');
    var ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (cfg.accept.split(',').indexOf(ext) < 0) {
      mount(result, h('div', { class: 'notice notice-bad' }, h('p', null, 'Formato no permitido. Sube un PDF o una imagen JPG, PNG o WEBP.')));
      return;
    }
    if (file.size > cfg.max_upload_mb * 1048576) {
      mount(result, h('div', { class: 'notice notice-bad' }, h('p', null, 'El archivo pesa ' + CP.fmtSize(file.size) +
        '; el máximo es ' + cfg.max_upload_mb + ' MB.')));
      return;
    }
    var bar = h('span');
    var progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Carga de ' + def.label }, bar);
    var label = h('p', { class: 'small muted' }, 'Subiendo ' + file.name + '…');
    mount(result, label, progress);
    CP.busy(btn, true, 'Subiendo…');
    CP.upload('/api/portal/documentos/' + d.tipo, file, function (p, done) {
      if (done) { progress.classList.add('indeterminate'); bar.style.width = ''; label.textContent = 'Guardando el documento de forma segura…'; }
      else bar.style.width = Math.round(p * 100) + '%';
    }).then(function (res) {
      setView(res.registro);
      var doc = res.documento;
      if (doc.duplicado) CP.toast('Ese mismo archivo ya estaba cargado.', 'ok');
      else if (doc.validacion === 'valido') CP.toast(def.label + ': fecha validada.', 'ok');
      else if (doc.validacion === 'rechazado') CP.toast(def.label + ': no se aceptó por su fecha.', 'bad');
      else CP.toast(def.label + ': registrado; la fecha se revisará manualmente.');
      var fresh = view.documentos.filter(function (x) { return x.tipo === d.tipo; })[0];
      var row = docRow(fresh, mode);
      li.replaceWith(row);
      var focusTarget = row.querySelector('.result .notice') || row.querySelector('button');
      if (focusTarget) { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus(); }
      refreshAfterUpload();
    }).catch(function (e) {
      CP.busy(btn, false);
      if (sessionProblem(e)) return;
      mount(result, h('div', { class: 'notice notice-bad', role: 'alert' }, h('p', null, e.message)));
    });
  }

  function refreshAfterUpload() {
    if (current === 'estado') {
      var submitBox = document.getElementById('correction-submit');
      if (submitBox) mount(submitBox, correctionSubmit());
      return;
    }
    var side = main.querySelector('.side-card');
    if (side) side.replaceWith(sideCard());
  }

  /* ---- revisión y envío */
  function display(f, value) {
    if (Array.isArray(value)) return value.length ? value.join(', ') : '';
    return value === undefined || value === null ? '' : String(value);
  }

  function summaryBlock(step, editable) {
    var def = stepDefs[step];
    var dl = h('dl', { class: 'kv' });
    def.fields.forEach(function (f) {
      var value = display(f, data[f.key]);
      if (!value && !f.required) return;
      dl.appendChild(h('dt', null, f.label));
      dl.appendChild(h('dd', null, value || h('span', { class: 'error' }, 'Sin capturar')));
    });
    return h('section', { class: 'summary-block' },
      h('header', null, h('h2', null, def.title),
        editable ? h('button', { type: 'button', class: 'link-btn small', onclick: function () { goTo(step); } }, 'Editar') : null),
      dl);
  }

  function problems() {
    var list = [];
    ['contacto', 'empresa', 'operacion'].forEach(function (id) {
      var n = Object.keys((view.errores || {})[id] || {}).length;
      if (n) list.push({ step: id, text: 'Completa la sección «' + stepDefs[id].title + '» (' + n + (n === 1 ? ' dato por corregir).' : ' datos por corregir).') });
    });
    view.documentos.forEach(function (d) {
      if (!d.requerido) return;
      if (!d.actual) list.push({ step: 'documentos', text: 'Falta subir: ' + docDefs[d.tipo].label + '.' });
      else if (d.actual.revision === 'correccion') list.push({ step: 'documentos', text: 'Sube la versión corregida de: ' + docDefs[d.tipo].label + '.' });
    });
    return list;
  }

  function problemSteps() {
    var flags = {};
    problems().forEach(function (p) { flags[p.step] = true; });
    return flags;
  }

  function problemNotice(list) {
    return h('div', { class: 'notice notice-warn', role: 'status' },
      h('h3', null, 'Antes de enviar'),
      h('ul', null, list.map(function (p) {
        return h('li', null, h('button', { type: 'button', class: 'link-btn', onclick: function () { reveal[p.step] = true; goTo(p.step); } }, p.text));
      })));
  }

  function buildReviewStep(card) {
    var resend = view.envios > 0;
    card.appendChild(h('header', null, h('h1', { id: 'step-title' }, 'Revisión y envío'),
      h('p', null, 'Confirma tu información. Al enviar, tu registro queda pendiente de revisión y ya no podrás modificarlo, salvo que te solicitemos una corrección.')));
    ['contacto', 'empresa', 'operacion'].forEach(function (id) { card.appendChild(summaryBlock(id, true)); });
    var docsBlock = h('section', { class: 'summary-block' },
      h('header', null, h('h2', null, 'Documentos'),
        h('button', { type: 'button', class: 'link-btn small', onclick: function () { goTo('documentos'); } }, 'Editar')));
    var dl = h('dl', { class: 'kv' });
    view.documentos.forEach(function (d) {
      if (!d.requerido && !d.actual) return;
      dl.appendChild(h('dt', null, docDefs[d.tipo].label));
      dl.appendChild(h('dd', null, d.actual ? [validationPill(d.actual), ' ', d.actual.nombre_original] : h('span', { class: 'error' }, 'Pendiente')));
    });
    docsBlock.appendChild(dl);
    card.appendChild(docsBlock);
    var list = problems();
    var feedback = h('div', { id: 'submit-feedback', style: { marginTop: '8px' } },
      list.length ? problemNotice(list) : h('div', { class: 'notice notice-ok' }, h('h3', null, 'Todo listo para enviar'),
        h('p', null, 'Recibirás una confirmación por correo con tu folio.')));
    card.appendChild(feedback);
    var send = h('button', { type: 'button', class: 'btn btn-primary' }, resend ? 'Enviar correcciones' : 'Enviar registro');
    send.addEventListener('click', function () {
      if (problems().length) { reveal.all = true; mount(feedback, problemNotice(problems())); feedback.scrollIntoView({ block: 'center' }); return; }
      submitRegistration(send, feedback);
    });
    card.appendChild(h('div', { class: 'step-actions' },
      h('button', { type: 'button', class: 'btn', onclick: function () { goTo('documentos'); } }, 'Anterior'),
      h('span', { class: 'spacer' }), send));
  }

  function submitRegistration(btn, feedback) {
    CP.busy(btn, true, 'Enviando…');
    (saver.dirty ? save() : Promise.resolve()).then(function () {
      return api('POST', '/api/portal/enviar');
    }).then(function (res) {
      var again = res.resultado_envio && res.resultado_envio.envios > 1;
      setView(res);
      reveal = {};
      CP.toast(again ? 'Enviamos tus correcciones a revisión.' : 'Tu registro fue enviado a revisión.', 'ok');
      goTo('estado');
    }).catch(function (e) {
      CP.busy(btn, false);
      if (sessionProblem(e)) return;
      if (e.errors && e.errors.envio && feedback) {
        mount(feedback, h('div', { class: 'notice notice-bad', role: 'alert' }, h('h3', null, e.message),
          h('ul', null, e.errors.envio.map(function (t) { return h('li', null, t); }))));
      } else {
        CP.toast(e.message, 'bad');
      }
    });
  }

  /* ------------------------------------------------------------------ estado del registro */
  var STATUS_COPY = {
    enviado: ['Recibimos tu registro', 'Está pendiente de revisión por el equipo de Logística de CESANTONI. Si necesitamos una corrección te escribiremos al correo de contacto.'],
    en_revision: ['Tu registro está en revisión', 'Estamos revisando tus documentos. Si necesitamos una corrección te escribiremos al correo de contacto.'],
    correccion: ['Necesitamos algunas correcciones', 'Revisa el motivo de cada documento, sube la versión corregida y envía tus correcciones.'],
    aprobado: ['Tu registro fue aprobado', 'Tu empresa quedó dada de alta como proveedor. El equipo de Logística de CESANTONI se pondrá en contacto contigo.'],
    rechazado: ['Tu registro no fue aprobado', 'Si tienes dudas sobre la resolución, comunícate con tu contacto de Logística de CESANTONI.']
  };

  function showStatus() {
    current = 'estado';
    refs = {};
    var copy = STATUS_COPY[view.estado] || [view.estado_label, ''];
    var timeline = [h('li', null, 'Inicio: ', h('strong', null, CP.fmtDateTime(view.fecha_inicio)))];
    if (view.fecha_envio) timeline.push(h('li', null, 'Enviado: ', h('strong', null, CP.fmtDateTime(view.fecha_envio))));
    if (view.envios > 1) timeline.push(h('li', null, 'Último envío: ', h('strong', null, CP.fmtDateTime(view.fecha_ultimo_envio))));
    var kind = CP.ESTADO_KIND[view.estado] || 'plain';
    var parts = [
      h('section', { class: 'panel status-hero', 'aria-labelledby': 'status-title' },
        h('div', null, h('div', { class: 'folio-label' }, 'Folio'), h('div', { class: 'folio' }, view.folio)),
        h('div', null, CP.pill(kind === 'plain' ? 'dark' : kind, view.estado_label),
          h('h1', { id: 'status-title', style: { marginTop: '10px' } }, copy[0]),
          h('p', { class: 'muted', style: { margin: '6px 0 0' } }, copy[1]),
          h('ul', { class: 'timeline' }, timeline)))
    ];
    if (view.estado === 'correccion') {
      var pending = view.documentos.filter(function (d) { return d.puede_subir || d.motivo; });
      parts.push(h('section', { class: 'panel panel-pad', style: { marginTop: '20px' }, 'aria-labelledby': 'fix-title' },
        h('h2', { id: 'fix-title', style: { marginBottom: '6px' } }, 'Documentos por corregir'),
        h('p', { class: 'small muted' }, 'Los demás documentos se conservan; solo reemplaza los marcados.'),
        docList(pending, 'correccion'),
        h('div', { id: 'correction-submit' }, correctionSubmit()),
        h('p', { class: 'small', style: { marginTop: '14px' } }, '¿También necesitas actualizar datos de la empresa? ',
          h('button', { type: 'button', class: 'link-btn', onclick: function () { goTo('empresa'); } }, 'Abrir mi registro'))));
    }
    var sent = view.documentos.filter(function (d) { return d.actual; });
    parts.push(h('div', { class: 'two-col', style: { marginTop: '20px' } },
      h('section', { class: 'panel panel-pad', 'aria-labelledby': 'sent-docs' },
        h('h2', { id: 'sent-docs', style: { marginBottom: '10px' } }, 'Documentos entregados'),
        sent.length ? docList(sent, 'lectura') : h('p', { class: 'muted' }, 'Sin documentos.')),
      h('section', { class: 'panel panel-pad', 'aria-labelledby': 'sent-data' },
        h('h2', { id: 'sent-data', style: { marginBottom: '10px' } }, 'Información registrada'),
        ['contacto', 'empresa', 'operacion'].map(function (id) { return summaryBlock(id, false); }))));
    mount(main, parts);
    renderTop();
    focusMain(document.getElementById('status-title'));
  }

  function correctionSubmit() {
    var list = problems();
    var send = h('button', { type: 'button', class: 'btn btn-primary', disabled: list.length > 0 }, 'Enviar correcciones');
    var feedback = h('div', { style: { marginTop: '12px' } });
    send.addEventListener('click', function () { submitRegistration(send, feedback); });
    return h('div', { class: 'step-actions' },
      h('p', { class: 'small', style: { margin: 0 } }, list.length ? 'Sube todos los documentos marcados para habilitar el envío.' : 'Listo: envía tus correcciones a revisión.'),
      h('span', { class: 'spacer' }), send, feedback);
  }

  CP.ready.then(init);
})();
