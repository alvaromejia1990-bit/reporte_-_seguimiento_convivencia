/**
 * =============================================================================
 *  CONTROL DE LLEGADAS TARDE · Servidor en Google Apps Script
 *
 *  · Los datos se guardan en una hoja de cálculo de Google Drive (propiedad de
 *    la cuenta que instala el script). Nadie más necesita acceso a ella.
 *  · Los correos a los acudientes se envían desde esa misma cuenta con Gmail
 *    y quedan guardados en su carpeta "Enviados".
 *  · El sitio web (GitHub Pages) se comunica con este script por HTTPS.
 *
 *  INSTALACIÓN (resumen; ver docs/GUIA_GOOGLE_DRIVE.md):
 *    1. Edite el bloque AJUSTES (correo y nombre del primer administrador).
 *    2. Ejecute la función  instalar  y autorice los permisos.
 *    3. Implementar › Nueva implementación › Aplicación web
 *       (Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario).
 *    4. Copie la URL /exec en js/config.js (GOOGLE_SCRIPT_URL).
 * =============================================================================
 */

/* ------------------------------------------------------------------------- */
/* 1. AJUSTES — edite estos valores ANTES de ejecutar instalar()              */
/* ------------------------------------------------------------------------- */
const AJUSTES = {
  ADMIN_CORREO: 'coordinacion@su-institucion.edu.co', // primer administrador (recibe su clave temporal)
  ADMIN_NOMBRE: 'Coordinación de Convivencia',
  NOMBRE_INSTITUCION: 'Institución Educativa',
  NOMBRE_HOJA: 'BD Control de Llegadas Tarde',       // nombre del archivo en Drive
  ZONA: 'America/Bogota',
  HORAS_SESION: 12,                                   // duración de la sesión iniciada
  HORAS_SIN_REBOTE: 6,                                // tras este tiempo sin rebote, el correo se marca "Entregado"
};

/* ------------------------------------------------------------------------- */
/* 2. Esquema de la base de datos (una hoja por tabla)                        */
/*    Tipos: (sin sufijo)=texto · :n número · :b sí/no · :d fecha · :t hora · :j JSON */
/* ------------------------------------------------------------------------- */
const ESQUEMA = {
  configuracion: { hoja: 'Configuración', cols: 'clave valor' },
  usuarios: { hoja: 'Usuarios', cols: 'id nombre correo rol activo:b hash sal debe_cambiar:b version:n creado_en ultimo_ingreso' },
  periodos: { hoja: 'Períodos', cols: 'id nombre anio:n fecha_inicio:d fecha_fin:d creado_en' },
  grados: { hoja: 'Grados', cols: 'id nombre orden:n' },
  cursos: { hoja: 'Cursos', cols: 'id grado_id nombre director' },
  estudiantes: { hoja: 'Estudiantes', cols: 'id tipo_documento documento apellidos nombres edad:n grado_id curso_id acudiente_nombre acudiente_parentesco acudiente_correo acudiente_telefono direccion estado total_llegadas:n creado_en actualizado_en' },
  llegadas: { hoja: 'Llegadas tarde', cols: 'id estudiante_id fecha:d hora:t periodo_id grado_id curso_id grado_nombre curso_nombre observacion registrado_por registrado_por_nombre creado_en' },
  notificaciones: { hoja: 'Notificaciones', cols: 'id estudiante_id periodo_id destinatario asunto cantidad_reportes:n fechas:j estado proveedor error enviado_por enviado_por_nombre enviado_en actualizado_en' },
  auditoria: { hoja: 'Auditoría', cols: 'id fecha usuario_id usuario tabla accion registro_id detalle:j' },
};

const CONFIG_DEFECTO = {
  nombre_institucion: AJUSTES.NOMBRE_INSTITUCION, sigla: '', nit: '', ciudad: '', direccion: '', telefono: '',
  correo_institucional: '', responsable_nombre: AJUSTES.ADMIN_NOMBRE, responsable_cargo: 'Coordinación de Convivencia',
  umbral_seguimiento: '4', zona_horaria: AJUSTES.ZONA, hora_limite_ingreso: '06:30', logo_url: '',
};
const TIPOS_DOC = ['RC', 'TI', 'CC', 'CE', 'PPT', 'PEP', 'NUIP', 'PAS', 'OTRO'];
const ESTADOS_ENVIADO = ['enviado', 'entregado', 'abierto'];
const NIVEL_ESTADO = { pendiente: 0, enviado: 1, entregado: 2, abierto: 3, rebotado: 4, fallido: 4 };

/* ------------------------------------------------------------------------- */
/* 3. Utilidades                                                              */
/* ------------------------------------------------------------------------- */
class ErrorApp extends Error {
  constructor(mensaje, codigo, extra) { super(mensaje); this.codigo = codigo || 'NEGOCIO'; Object.assign(this, extra || {}); }
}
const fallo = (m, codigo, extra) => { throw new ErrorApp(m, codigo, extra); };
const uid = () => Utilities.getUuid();
const ahoraIso = () => new Date().toISOString();
const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const limpiar = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
const limpiarDocumento = (d) => String(d == null ? '' : d).replace(/[\s.]/g, '').toUpperCase();
const validarCorreo = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c || '').trim());
const validarDocumento = (d) => /^[A-Za-z0-9-]{3,20}$/.test(d);
const zona = () => AJUSTES.ZONA;
function ahoraLocal() {
  const d = new Date();
  return { fecha: Utilities.formatDate(d, zona(), 'yyyy-MM-dd'), hora: Utilities.formatDate(d, zona(), 'HH:mm:ss') };
}
const sumarHoras = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(f) {
  const [a, m, d] = String(f).split('-').map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia.charAt(0).toUpperCase() + dia.slice(1)}, ${d} de ${MESES[m - 1]} de ${a}`;
}
const props = () => PropertiesService.getScriptProperties();
const ocultarCorreo = (c) => String(c || '').replace(/^(.{2}).*(@.*)$/, '$1•••$2');

/* ------------------------------------------------------------------------- */
/* 4. Capa de datos sobre Google Sheets                                       */
/* ------------------------------------------------------------------------- */
const BD = (function () {
  let libro = null;
  const cache = {};
  const defs = {};

  function def(t) {
    if (!defs[t]) {
      const e = ESQUEMA[t];
      defs[t] = { hoja: e.hoja, cols: e.cols.split(/\s+/).map((c) => { const [n, tipo] = c.split(':'); return { n, t: tipo || 's' }; }) };
    }
    return defs[t];
  }
  function abrir() {
    if (!libro) {
      const id = props().getProperty('ID_HOJA');
      if (!id) fallo('El servidor no está instalado: ejecute la función instalar() en el editor de Apps Script.', 'INSTALACION');
      libro = SpreadsheetApp.openById(id);
    }
    return libro;
  }
  function hoja(t) {
    const h = abrir().getSheetByName(def(t).hoja);
    if (!h) fallo(`Falta la hoja "${def(t).hoja}". Ejecute de nuevo instalar().`, 'INSTALACION');
    return h;
  }
  // Valor de la celda → valor de la aplicación
  function desde(v, tipo) {
    if (v instanceof Date) {
      if (tipo === 'd') return Utilities.formatDate(v, zona(), 'yyyy-MM-dd');
      if (tipo === 't') return Utilities.formatDate(v, zona(), 'HH:mm:ss');
      if (tipo === 'n') return v.getTime();
      return v.toISOString();
    }
    if (tipo === 'n') return v === '' || v == null ? null : Number(v);
    if (tipo === 'b') return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1';
    if (tipo === 'j') { if (v === '' || v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } }
    let s = v == null ? '' : String(v);
    if (s.charAt(0) === "'") s = s.slice(1);
    if (tipo === 't' && /^\d{1,2}:\d{2}$/.test(s)) s = s.padStart(5, '0') + ':00';
    return s;
  }
  // Valor de la aplicación → celda (texto plano; se neutralizan fórmulas)
  function hacia(v, tipo) {
    if (tipo === 'n') return v === '' || v == null || isNaN(Number(v)) ? '' : Number(v);
    if (tipo === 'b') return !!v;
    if (tipo === 'j') return v == null ? '' : JSON.stringify(v);
    const s = v == null ? '' : String(v);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  }
  const aFila = (t, o) => def(t).cols.map((c) => hacia(o[c.n], c.t));

  function leer(t) {
    if (cache[t]) return cache[t];
    const h = hoja(t), d = def(t), n = h.getLastRow() - 1;
    const valores = n > 0 ? h.getRange(2, 1, n, d.cols.length).getValues() : [];
    const filas = [];
    valores.forEach((f, i) => {
      if (f.every((x) => x === '' || x == null)) return;
      const o = {};
      d.cols.forEach((c, j) => { o[c.n] = desde(f[j], c.t); });
      Object.defineProperty(o, '_fila', { value: i + 2, writable: true, enumerable: false });
      filas.push(o);
    });
    cache[t] = filas;
    return filas;
  }
  function asegurarFilas(h, hasta) {
    const max = h.getMaxRows();
    if (hasta > max) h.insertRowsAfter(max, hasta - max + 200);
  }
  function insertar(t, objs) {
    if (!objs.length) return;
    const h = hoja(t), d = def(t), inicio = h.getLastRow() + 1;
    asegurarFilas(h, inicio + objs.length - 1);
    h.getRange(inicio, 1, objs.length, d.cols.length).setNumberFormat('@').setValues(objs.map((o) => aFila(t, o)));
    if (cache[t]) objs.forEach((o, i) => { Object.defineProperty(o, '_fila', { value: inicio + i, writable: true, enumerable: false }); cache[t].push(o); });
  }
  function actualizar(t, o) {
    if (!o._fila) fallo('Registro sin ubicación en la hoja', 'INTERNO');
    hoja(t).getRange(o._fila, 1, 1, def(t).cols.length).setValues([aFila(t, o)]);
  }
  function eliminar(t, objs) {
    const h = hoja(t);
    objs.map((o) => o._fila).filter(Boolean).sort((a, b) => b - a).forEach((r) => h.deleteRow(r));
    delete cache[t];
  }
  // Reescribe toda la tabla (operaciones masivas)
  function reescribir(t, objs) {
    const h = hoja(t), d = def(t), n = h.getLastRow() - 1;
    if (n > 0) h.getRange(2, 1, n, d.cols.length).clearContent();
    if (objs.length) {
      asegurarFilas(h, objs.length + 1);
      h.getRange(2, 1, objs.length, d.cols.length).setNumberFormat('@').setValues(objs.map((o) => aFila(t, o)));
    }
    delete cache[t];
  }
  return { def, abrir, hoja, leer, insertar, actualizar, eliminar, reescribir, olvidar: (t) => { delete cache[t]; } };
})();

/** Ejecuta fn con bloqueo exclusivo (evita escrituras simultáneas) y marca la versión de datos. */
function conBloqueo(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) fallo('El servidor está ocupado. Intente de nuevo en unos segundos.', 'OCUPADO');
  try {
    const r = fn();
    SpreadsheetApp.flush();
    props().setProperty('VERSION_DATOS', String(Date.now()));
    return r;
  } finally { lock.releaseLock(); }
}

function leerConfig() {
  const c = Object.assign({}, CONFIG_DEFECTO);
  BD.leer('configuracion').forEach((f) => { if (f.clave) c[f.clave] = f.valor; });
  c.umbral_seguimiento = Number(c.umbral_seguimiento) || 4;
  c.zona_horaria = AJUSTES.ZONA;
  return c;
}

function auditar(usuario, tabla, accion, registroId, detalle) {
  BD.insertar('auditoria', [{ id: uid(), fecha: ahoraIso(), usuario_id: usuario ? usuario.id : '', usuario: usuario ? usuario.nombre : 'Sistema',
    tabla, accion, registro_id: registroId || '', detalle: detalle == null ? null : detalle }]);
}

/* ------------------------------------------------------------------------- */
/* 5. Autenticación                                                           */
/* ------------------------------------------------------------------------- */
function secreto() {
  let s = props().getProperty('SECRETO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props().setProperty('SECRETO', s); }
  return s;
}
function hashClave(clave, sal) {
  let h = sal + '|' + clave;
  for (let i = 0; i < 200; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8));
  return h;
}
const firmar = (texto) => Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, secreto())).replace(/=+$/, '');
function emitirToken(u) {
  const carga = Utilities.base64EncodeWebSafe(JSON.stringify({ u: u.id, v: Number(u.version) || 0, e: Date.now() + AJUSTES.HORAS_SESION * 3600e3 })).replace(/=+$/, '');
  return carga + '.' + firmar(carga);
}
function autenticar(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2 || firmar(partes[0]) !== partes[1]) fallo('Sesión inválida. Ingrese de nuevo.', 'SESION');
  let datos;
  try { datos = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString()); } catch (e) { fallo('Sesión inválida. Ingrese de nuevo.', 'SESION'); }
  if (!datos.e || datos.e < Date.now()) fallo('Su sesión venció. Ingrese de nuevo.', 'SESION');
  const u = BD.leer('usuarios').find((x) => x.id === datos.u);
  if (!u || !u.activo || (Number(u.version) || 0) !== datos.v) fallo('Su sesión ya no es válida. Ingrese de nuevo.', 'SESION');
  return u;
}
const perfil = (u) => ({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, activo: u.activo, creado_en: u.creado_en, debe_cambiar: !!u.debe_cambiar });
function claveTemporal() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', nums = '23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += letras.charAt(Math.floor(Math.random() * letras.length));
  for (let i = 0; i < 3; i++) s += nums.charAt(Math.floor(Math.random() * nums.length));
  return s;
}
function validarClave(c) {
  c = String(c || '');
  if (c.length < 8 || !/\d/.test(c) || !/[a-zA-Z]/.test(c)) fallo('La contraseña debe tener al menos 8 caracteres, con letras y números');
}
function fijarClave(u, clave, debeCambiar) {
  u.sal = Utilities.getUuid();
  u.hash = hashClave(clave, u.sal);
  u.debe_cambiar = !!debeCambiar;
  u.version = (Number(u.version) || 0) + 1; // invalida las sesiones anteriores
}

/* ------------------------------------------------------------------------- */
/* 6. Puntos de entrada web                                                   */
/* ------------------------------------------------------------------------- */
function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let pet;
  try { pet = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return salida({ ok: false, error: 'Solicitud inválida' }); }
  const def = ACCIONES[pet.accion];
  if (!def) return salida({ ok: false, error: 'Acción desconocida: ' + pet.accion });
  try {
    const usuario = def.publica ? null : autenticar(pet.token);
    if (def.admin && usuario.rol !== 'admin') fallo('Solo un administrador puede realizar esta acción', 'PERMISO');
    const datos = pet.datos || {};
    const data = def.escribe ? conBloqueo(() => def.h(datos, usuario)) : def.h(datos, usuario);
    return salida({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    if (!(err instanceof ErrorApp)) console.error(err && err.stack ? err.stack : err);
    return salida({ ok: false, error: err.message || String(err), codigo: err.codigo || 'INTERNO', requiereConfirmacion: !!err.requiereConfirmacion });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.confirmar) return confirmarLectura(p.confirmar, p.f);
  return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Servidor de Control de Llegadas Tarde activo.</p>')
    .setTitle('Control de Llegadas Tarde');
}

/* ------------------------------------------------------------------------- */
/* 7. Acciones                                                                */
/* ------------------------------------------------------------------------- */
const ACCIONES = {
  /* ---- Sesión ---- */
  login: { publica: true, h: (d) => {
    const correo = String(d.correo || '').trim().toLowerCase();
    const cache = CacheService.getScriptCache(), clave = 'fallos_' + correo;
    const fallos = Number(cache.get(clave) || 0);
    if (fallos >= 5) fallo('Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.');
    const u = BD.leer('usuarios').find((x) => x.correo === correo);
    if (!u || !u.hash || hashClave(String(d.password || ''), u.sal) !== u.hash) {
      cache.put(clave, String(fallos + 1), 900);
      fallo('Correo o contraseña incorrectos');
    }
    if (!u.activo) fallo('Su cuenta está inactiva. Comuníquese con el administrador.');
    cache.remove(clave);
    conBloqueo(() => { u.ultimo_ingreso = ahoraIso(); BD.actualizar('usuarios', u); });
    return { token: emitirToken(u), usuario: perfil(u) };
  } },
  sesion: { h: (d, u) => perfil(u) },
  version: { h: () => props().getProperty('VERSION_DATOS') || '0' },
  cambiarClave: { escribe: true, h: (d, u) => {
    validarClave(d.password);
    fijarClave(u, d.password, false);
    BD.actualizar('usuarios', u);
    auditar(u, 'usuarios', 'CAMBIO_CLAVE', u.id, null);
    return { token: emitirToken(u), usuario: perfil(u) };
  } },
  recuperarClave: { publica: true, h: (d) => {
    const correo = String(d.correo || '').trim().toLowerCase();
    const cache = CacheService.getScriptCache();
    if (cache.get('rec_' + correo)) return null; // un correo cada 10 minutos
    cache.put('rec_' + correo, '1', 600);
    conBloqueo(() => {
      const u = BD.leer('usuarios').find((x) => x.correo === correo && x.activo);
      if (!u) return; // no se revela si el correo existe
      const temporal = claveTemporal();
      fijarClave(u, temporal, true);
      BD.actualizar('usuarios', u);
      auditar(u, 'usuarios', 'RECUPERAR_CLAVE', u.id, null);
      enviarCorreoCuenta(u, temporal, d.sitio, true);
    });
    return null;
  } },

  /* ---- Catálogos y configuración ---- */
  catalogos: { h: () => ({
    config: leerConfig(),
    periodos: BD.leer('periodos').slice().sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)),
    grados: BD.leer('grados').slice().sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre)),
    cursos: BD.leer('cursos').slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })),
  }) },
  guardarConfig: { admin: true, escribe: true, h: (d, u) => {
    const umbral = Number(d.umbral_seguimiento);
    if (!(umbral >= 1 && umbral <= 100)) fallo('El límite de seguimiento debe estar entre 1 y 100');
    const filas = BD.leer('configuracion');
    const nuevos = [];
    Object.keys(CONFIG_DEFECTO).forEach((k) => {
      if (k === 'zona_horaria' || !(k in d)) return;
      const valor = k === 'umbral_seguimiento' ? String(umbral) : String(d[k] == null ? '' : d[k]).trim();
      const f = filas.find((x) => x.clave === k);
      if (f) { f.valor = valor; BD.actualizar('configuracion', f); } else nuevos.push({ clave: k, valor });
    });
    BD.insertar('configuracion', nuevos);
    auditar(u, 'configuracion', 'UPDATE', '1', d);
  } },
  guardarPeriodo: { admin: true, escribe: true, h: (d, u) => {
    const p = { nombre: limpiar(d.nombre), anio: Number(d.anio), fecha_inicio: String(d.fecha_inicio || ''), fecha_fin: String(d.fecha_fin || '') };
    if (!p.nombre || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_fin)) fallo('Complete nombre y fechas');
    if (!(p.anio >= 2000 && p.anio <= 2100)) fallo('Año inválido');
    if (p.fecha_fin < p.fecha_inicio) fallo('La fecha final debe ser posterior a la inicial');
    const lista = BD.leer('periodos');
    if (lista.some((x) => x.id !== d.id && x.anio === p.anio && norm(x.nombre) === norm(p.nombre))) fallo('Ya existe un período con ese nombre en ese año');
    if (lista.some((x) => x.id !== d.id && !(p.fecha_fin < x.fecha_inicio || p.fecha_inicio > x.fecha_fin))) fallo('Las fechas se cruzan con otro período');
    if (d.id) {
      const x = lista.find((y) => y.id === d.id) || fallo('Período no encontrado');
      Object.assign(x, p); BD.actualizar('periodos', x);
    } else BD.insertar('periodos', [Object.assign({ id: uid(), creado_en: ahoraIso() }, p)]);
    auditar(u, 'periodos', d.id ? 'UPDATE' : 'INSERT', d.id || '', p);
  } },
  eliminarPeriodo: { admin: true, escribe: true, h: (d, u) => {
    if (BD.leer('llegadas').some((l) => l.periodo_id === d.id)) fallo('No se puede eliminar: el período tiene llegadas tarde registradas');
    BD.eliminar('periodos', BD.leer('periodos').filter((x) => x.id === d.id));
    auditar(u, 'periodos', 'DELETE', d.id, null);
  } },
  guardarGrado: { admin: true, escribe: true, h: (d) => {
    const g = { nombre: limpiar(d.nombre), orden: Number(d.orden) || 0 };
    if (!g.nombre) fallo('El nombre del grado es obligatorio');
    const lista = BD.leer('grados');
    if (lista.some((x) => x.id !== d.id && norm(x.nombre) === norm(g.nombre))) fallo('Ya existe un grado con ese nombre');
    if (d.id) { const x = lista.find((y) => y.id === d.id) || fallo('Grado no encontrado'); Object.assign(x, g); BD.actualizar('grados', x); }
    else BD.insertar('grados', [Object.assign({ id: uid() }, g)]);
  } },
  eliminarGrado: { admin: true, escribe: true, h: (d) => {
    if (BD.leer('cursos').some((c) => c.grado_id === d.id)) fallo('No se puede eliminar: el grado tiene cursos. Elimínelos primero.');
    BD.eliminar('grados', BD.leer('grados').filter((x) => x.id === d.id));
  } },
  guardarCurso: { admin: true, escribe: true, h: (d) => {
    const c = { grado_id: String(d.grado_id || ''), nombre: limpiar(d.nombre), director: limpiar(d.director) };
    if (!c.grado_id || !c.nombre) fallo('Seleccione el grado y escriba el nombre del curso');
    if (!BD.leer('grados').some((g) => g.id === c.grado_id)) fallo('El grado no existe');
    const lista = BD.leer('cursos');
    if (lista.some((x) => x.id !== d.id && x.grado_id === c.grado_id && norm(x.nombre) === norm(c.nombre))) fallo('Ese curso ya existe en el grado');
    if (d.id) {
      const x = lista.find((y) => y.id === d.id) || fallo('Curso no encontrado');
      Object.assign(x, c); BD.actualizar('cursos', x);
      // El grado de los estudiantes del curso sigue al curso
      BD.leer('estudiantes').filter((e) => e.curso_id === x.id && e.grado_id !== c.grado_id)
        .forEach((e) => { e.grado_id = c.grado_id; BD.actualizar('estudiantes', e); });
    } else BD.insertar('cursos', [Object.assign({ id: uid() }, c)]);
  } },
  eliminarCurso: { admin: true, escribe: true, h: (d) => {
    if (BD.leer('estudiantes').some((e) => e.curso_id === d.id)) fallo('No se puede eliminar: el curso tiene estudiantes asignados');
    BD.eliminar('cursos', BD.leer('cursos').filter((x) => x.id === d.id));
  } },

  /* ---- Estudiantes ---- */
  estudiantes: { h: (d, u) => {
    const cuenta = contarLlegadas();
    const lista = BD.leer('estudiantes').map((e) => Object.assign({}, e, { total_llegadas: cuenta[e.id] || 0 }))
      .sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es') || a.nombres.localeCompare(b.nombres, 'es'));
    if (u.rol === 'admin') return lista;
    // Docentes: sin datos personales del acudiente
    return lista.map((e) => ({ id: e.id, tipo_documento: e.tipo_documento, documento: e.documento, apellidos: e.apellidos, nombres: e.nombres, edad: e.edad,
      grado_id: e.grado_id, curso_id: e.curso_id, estado: e.estado, total_llegadas: e.total_llegadas, tiene_correo_acudiente: !!e.acudiente_correo }));
  } },
  guardarEstudiante: { admin: true, escribe: true, h: (d, u) => {
    const reg = prepararEstudiante(d, BD.leer('estudiantes'));
    if (d.id) {
      const x = BD.leer('estudiantes').find((y) => y.id === d.id) || fallo('Estudiante no encontrado');
      const antes = Object.assign({}, x);
      Object.assign(x, reg, { actualizado_en: ahoraIso() });
      BD.actualizar('estudiantes', x);
      auditar(u, 'estudiantes', 'UPDATE', x.id, { antes, despues: reg });
      return x;
    }
    const nuevo = Object.assign({ id: uid(), total_llegadas: 0, creado_en: ahoraIso(), actualizado_en: ahoraIso() }, reg);
    BD.insertar('estudiantes', [nuevo]);
    return nuevo;
  } },
  eliminarEstudiante: { admin: true, escribe: true, h: (d, u) => {
    const x = BD.leer('estudiantes').find((y) => y.id === d.id) || fallo('Estudiante no encontrado');
    auditar(u, 'estudiantes', 'DELETE', x.id, Object.assign({}, x));
    BD.eliminar('llegadas', BD.leer('llegadas').filter((l) => l.estudiante_id === x.id));
    BD.eliminar('notificaciones', BD.leer('notificaciones').filter((n) => n.estudiante_id === x.id));
    BD.eliminar('estudiantes', [x]);
  } },
  importarEstudiantes: { admin: true, escribe: true, h: (d, u) => {
    const filas = Array.isArray(d.filas) ? d.filas : fallo('Formato inválido: se esperaba una lista de filas');
    const estudiantes = BD.leer('estudiantes').map((e) => { const c = Object.assign({}, e); return c; });
    const grados = BD.leer('grados'), cursos = BD.leer('cursos');
    const nuevosGrados = [], nuevosCursos = [];
    let insertados = 0, actualizados = 0;
    const errores = [];
    filas.forEach((f, i) => {
      try {
        let r = resolverCurso(grados, cursos, f.grado, f.curso);
        if (!r.curso && d.crearFaltantes && limpiar(f.grado) && limpiar(f.curso)) {
          let g = r.grado;
          if (!g) { g = { id: uid(), nombre: limpiar(f.grado), orden: Number(String(f.grado).replace(/\D/g, '')) || 0 }; grados.push(g); nuevosGrados.push(g); }
          const c = { id: uid(), grado_id: g.id, nombre: limpiar(f.curso), director: '' }; cursos.push(c); nuevosCursos.push(c);
          r = { grado: g, curso: c };
        }
        if (!r.curso) fallo(`Grado "${f.grado || ''}" / curso "${f.curso || ''}" no existe`);
        const doc = limpiarDocumento(f.documento);
        const previo = estudiantes.find((x) => x.documento === doc);
        const datos = {
          id: previo ? previo.id : null, documento: doc,
          tipo_documento: String(f.tipo_documento || (previo && previo.tipo_documento) || 'TI').toUpperCase().trim(),
          apellidos: f.apellidos || '', nombres: f.nombres,
          edad: f.edad === '' || f.edad == null ? (previo ? previo.edad : null) : Math.round(Number(f.edad)),
          curso_id: r.curso.id,
          acudiente_nombre: f.acudiente_nombre || (previo && previo.acudiente_nombre) || '',
          acudiente_parentesco: f.acudiente_parentesco || (previo && previo.acudiente_parentesco) || '',
          acudiente_correo: f.acudiente_correo || (previo && previo.acudiente_correo) || '',
          acudiente_telefono: f.acudiente_telefono || (previo && previo.acudiente_telefono) || '',
          direccion: f.direccion || (previo && previo.direccion) || '', estado: 'activo',
        };
        const reg = prepararEstudiante(datos, estudiantes, cursos);
        if (previo) { Object.assign(previo, reg, { actualizado_en: ahoraIso() }); actualizados++; }
        else { estudiantes.push(Object.assign({ id: uid(), total_llegadas: 0, creado_en: ahoraIso(), actualizado_en: ahoraIso() }, reg)); insertados++; }
      } catch (e) {
        if (!(e instanceof ErrorApp)) throw e;
        errores.push({ fila: f._fila || i + 1, documento: f.documento, mensaje: e.message });
      }
    });
    BD.insertar('grados', nuevosGrados);
    BD.insertar('cursos', nuevosCursos);
    if (insertados || actualizados) BD.reescribir('estudiantes', estudiantes);
    auditar(u, 'estudiantes', 'IMPORTACION', '', { filas: filas.length, insertados, actualizados, errores: errores.length });
    return { insertados, actualizados, errores };
  } },

  /* ---- Llegadas tarde ---- */
  reportarLlegadas: { escribe: true, h: (d, u) => {
    const a = ahoraLocal();
    const admin = u.rol === 'admin';
    // Solo un administrador puede registrar correcciones con otra fecha/hora
    const fecha = admin && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? d.fecha : a.fecha;
    let hora = admin && d.hora && d.fecha ? String(d.hora) : a.hora;
    if (/^\d{2}:\d{2}$/.test(hora)) hora += ':00';
    const periodo = BD.leer('periodos').find((p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin);
    const estudiantes = BD.leer('estudiantes'), llegadas = BD.leer('llegadas');
    const grados = BD.leer('grados'), cursos = BD.leer('cursos');
    const yaHoy = new Set(llegadas.filter((l) => l.fecha === fecha).map((l) => l.estudiante_id));
    const nuevas = [];
    const resultado = (Array.isArray(d.ids) ? d.ids : []).map((id) => {
      const e = estudiantes.find((x) => x.id === id);
      if (!e) return { estudiante_id: id, estado: 'error', mensaje: 'Estudiante no encontrado' };
      if (e.estado !== 'activo') return { estudiante_id: id, estado: 'error', mensaje: 'El estudiante está retirado' };
      if (!periodo) return { estudiante_id: id, estado: 'error', mensaje: `No hay un período académico configurado para la fecha ${fecha}` };
      if (yaHoy.has(id)) return { estudiante_id: id, estado: 'duplicado', mensaje: 'Ya tenía reporte de llegada tarde en esa jornada' };
      yaHoy.add(id);
      const g = grados.find((x) => x.id === e.grado_id) || {}, c = cursos.find((x) => x.id === e.curso_id) || {};
      const l = { id: uid(), estudiante_id: id, fecha, hora, periodo_id: periodo.id, grado_id: e.grado_id, curso_id: e.curso_id,
        grado_nombre: g.nombre || '', curso_nombre: c.nombre || '', observacion: limpiar(d.observacion).slice(0, 200),
        registrado_por: u.id, registrado_por_nombre: u.nombre, creado_en: ahoraIso() };
      nuevas.push(l);
      return { estudiante_id: id, estado: 'registrado', mensaje: 'Reporte registrado', llegada_id: l.id };
    });
    BD.insertar('llegadas', nuevas);
    // Contador acumulado visible también en la hoja de cálculo
    if (nuevas.length) {
      const cuenta = contarLlegadas();
      nuevas.forEach((l) => { const e = estudiantes.find((x) => x.id === l.estudiante_id); e.total_llegadas = cuenta[e.id] || 0; BD.actualizar('estudiantes', e); });
    }
    return resultado;
  } },
  llegadas: { h: (d) => BD.leer('llegadas').filter((l) =>
    (!d.periodoId || l.periodo_id === d.periodoId) && (!d.estudianteId || l.estudiante_id === d.estudianteId) &&
    (!d.desde || l.fecha >= d.desde) && (!d.hasta || l.fecha <= d.hasta))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora)) },
  eliminarLlegada: { admin: true, escribe: true, h: (d, u) => {
    const l = BD.leer('llegadas').find((x) => x.id === d.id);
    if (!l) return;
    auditar(u, 'llegadas_tarde', 'DELETE', l.id, Object.assign({}, l));
    BD.eliminar('llegadas', [l]);
    const e = BD.leer('estudiantes').find((x) => x.id === l.estudiante_id);
    if (e) { e.total_llegadas = contarLlegadas()[e.id] || 0; BD.actualizar('estudiantes', e); }
  } },

  /* ---- Notificaciones ---- */
  notificaciones: { h: (d) => BD.leer('notificaciones').filter((n) =>
    (!d.periodoId || n.periodo_id === d.periodoId) && (!d.estudianteId || n.estudiante_id === d.estudianteId))
    .map((n) => Object.assign({}, n, { fechas: n.fechas || [] }))
    .sort((a, b) => String(b.enviado_en).localeCompare(String(a.enviado_en))) },
  notificar: { h: (d, u) => (d.modo === 'enviar' ? conBloqueo(() => notificar(d, u)) : notificar(d, u)) },

  /* ---- Usuarios y auditoría ---- */
  usuarios: { admin: true, h: () => BD.leer('usuarios').map(perfil).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) },
  crearUsuario: { admin: true, escribe: true, h: (d, u) => {
    const correo = String(d.correo || '').trim().toLowerCase();
    if (!validarCorreo(correo)) fallo('Correo inválido');
    if (!limpiar(d.nombre)) fallo('El nombre es obligatorio');
    validarClave(d.password);
    if (BD.leer('usuarios').some((x) => x.correo === correo)) fallo('Ya existe un usuario con ese correo');
    const nuevo = { id: uid(), nombre: limpiar(d.nombre), correo, rol: d.rol === 'admin' ? 'admin' : 'docente', activo: true, version: 0, creado_en: ahoraIso(), ultimo_ingreso: '' };
    fijarClave(nuevo, d.password, true);
    BD.insertar('usuarios', [nuevo]);
    auditar(u, 'usuarios', 'CREAR', nuevo.id, { correo, rol: nuevo.rol });
    let correoEnviado = true;
    try { enviarCorreoCuenta(nuevo, d.password, d.sitio, false); } catch (e) { correoEnviado = false; }
    return Object.assign(perfil(nuevo), { correo_enviado: correoEnviado });
  } },
  actualizarUsuario: { admin: true, escribe: true, h: (d, u) => {
    const x = BD.leer('usuarios').find((y) => y.id === d.id) || fallo('Usuario no encontrado');
    if (x.id === u.id && (d.rol === 'docente' || d.activo === false)) fallo('No puede quitarse a sí mismo el rol de administrador ni desactivarse');
    const cambios = {};
    if (d.rol === 'admin' || d.rol === 'docente') cambios.rol = d.rol;
    if (typeof d.activo === 'boolean') cambios.activo = d.activo;
    if (d.nombre && limpiar(d.nombre)) cambios.nombre = limpiar(d.nombre);
    Object.assign(x, cambios);
    if (cambios.activo === false || cambios.rol) x.version = (Number(x.version) || 0) + 1; // cierra sus sesiones
    BD.actualizar('usuarios', x);
    auditar(u, 'usuarios', 'ACTUALIZAR', x.id, cambios);
  } },
  restablecerClave: { admin: true, escribe: true, h: (d, u) => {
    validarClave(d.password);
    const x = BD.leer('usuarios').find((y) => y.id === d.id) || fallo('Usuario no encontrado');
    fijarClave(x, d.password, x.id !== u.id);
    BD.actualizar('usuarios', x);
    auditar(u, 'usuarios', 'RESTABLECER_CLAVE', x.id, null);
  } },
  eliminarUsuario: { admin: true, escribe: true, h: (d, u) => {
    if (d.id === u.id) fallo('No puede eliminar su propia cuenta');
    const x = BD.leer('usuarios').find((y) => y.id === d.id) || fallo('Usuario no encontrado');
    BD.eliminar('usuarios', [x]);
    auditar(u, 'usuarios', 'ELIMINAR', d.id, { correo: x.correo });
  } },
  auditoria: { admin: true, h: () => BD.leer('auditoria').slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 300) },
  cupoCorreo: { h: () => MailApp.getRemainingDailyQuota() },
};

/* ------------------------------------------------------------------------- */
/* 8. Reglas de negocio                                                       */
/* ------------------------------------------------------------------------- */
function contarLlegadas() {
  const c = {};
  BD.leer('llegadas').forEach((l) => { c[l.estudiante_id] = (c[l.estudiante_id] || 0) + 1; });
  return c;
}

function resolverGrado(grados, txt) {
  const t = norm(txt).replace(/[°º]/g, '');
  if (!t) return null;
  return grados.find((g) => norm(g.nombre) === t) || (/^\d+$/.test(t) ? grados.find((g) => Number(g.orden) === Number(t)) : null) || null;
}
function resolverCurso(grados, cursos, gradoTxt, cursoTxt) {
  const c = norm(cursoTxt), g = resolverGrado(grados, gradoTxt);
  if (!c) return { grado: g, curso: null };
  if (g) return { grado: g, curso: cursos.find((x) => x.grado_id === g.id && norm(x.nombre) === c) || null };
  if (norm(gradoTxt)) return { grado: null, curso: null };
  const posibles = cursos.filter((x) => norm(x.nombre) === c);
  return posibles.length === 1 ? { grado: grados.find((x) => x.id === posibles[0].grado_id), curso: posibles[0] } : { grado: null, curso: null };
}

/** Valida y normaliza un estudiante; evita duplicados por documento y por nombre dentro del curso. */
function prepararEstudiante(e, lista, cursos) {
  const curso = (cursos || BD.leer('cursos')).find((c) => c.id === e.curso_id);
  if (!curso) fallo('Seleccione un curso válido');
  const reg = {
    tipo_documento: String(e.tipo_documento || 'TI').toUpperCase(), documento: limpiarDocumento(e.documento),
    apellidos: limpiar(e.apellidos), nombres: limpiar(e.nombres),
    edad: e.edad === '' || e.edad == null ? null : Number(e.edad), grado_id: curso.grado_id, curso_id: curso.id,
    acudiente_nombre: limpiar(e.acudiente_nombre), acudiente_parentesco: limpiar(e.acudiente_parentesco),
    acudiente_correo: String(e.acudiente_correo || '').trim().toLowerCase(), acudiente_telefono: limpiar(e.acudiente_telefono),
    direccion: limpiar(e.direccion), estado: e.estado === 'retirado' ? 'retirado' : 'activo',
  };
  if (TIPOS_DOC.indexOf(reg.tipo_documento) < 0) fallo('Tipo de documento inválido');
  if (!validarDocumento(reg.documento)) fallo('Documento inválido (3 a 20 letras o números)');
  if (!reg.nombres) fallo('El nombre del estudiante es obligatorio');
  if (reg.edad != null && !(reg.edad >= 3 && reg.edad <= 30)) fallo('Edad fuera de rango (3 a 30)');
  if (reg.acudiente_correo && !validarCorreo(reg.acudiente_correo)) fallo('Correo del acudiente inválido');
  if (lista.some((x) => x.id !== e.id && x.documento === reg.documento)) fallo(`Ya existe un estudiante con el documento ${reg.documento}`);
  if (lista.some((x) => x.id !== e.id && x.curso_id === reg.curso_id && norm(x.apellidos) === norm(reg.apellidos) && norm(x.nombres) === norm(reg.nombres)))
    fallo('Ya existe otro estudiante con el mismo nombre en ese curso');
  return reg;
}

/* ------------------------------------------------------------------------- */
/* 9. Correo institucional (Gmail)                                            */
/* ------------------------------------------------------------------------- */
function notificar(d, u) {
  const e = BD.leer('estudiantes').find((x) => x.id === d.estudianteId) || fallo('Estudiante no encontrado');
  const p = BD.leer('periodos').find((x) => x.id === d.periodoId) || fallo('Período no encontrado');
  const ll = BD.leer('llegadas').filter((l) => l.estudiante_id === e.id && l.periodo_id === p.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!ll.length) fallo('El estudiante no tiene llegadas tarde en ese período');
  if (!e.acudiente_correo) fallo('El estudiante no tiene correo de acudiente registrado');
  const conf = leerConfig();
  const grado = (BD.leer('grados').find((g) => g.id === e.grado_id) || {}).nombre || '';
  const curso = (BD.leer('cursos').find((c) => c.id === e.curso_id) || {}).nombre || '';
  const visible = u.rol === 'admin' ? e.acudiente_correo : ocultarCorreo(e.acudiente_correo);
  const datos = {
    institucion: { nombre: conf.nombre_institucion, ciudad: conf.ciudad, telefono: conf.telefono, correo: conf.correo_institucional,
      responsable: conf.responsable_nombre, cargo: conf.responsable_cargo, logo: conf.logo_url },
    estudiante: { nombre: `${e.nombres} ${e.apellidos}`.trim(), documento: e.documento, tipo: e.tipo_documento, grado, curso },
    acudiente: { nombre: e.acudiente_nombre, parentesco: e.acudiente_parentesco, correo: e.acudiente_correo, telefono: e.acudiente_telefono, direccion: e.direccion },
    periodo: { nombre: p.nombre, anio: p.anio }, llegadas: ll, umbral: conf.umbral_seguimiento, enlace: '',
  };
  if (d.modo !== 'enviar') {
    const correo = construirCorreo(datos);
    return { asunto: correo.asunto, html: correo.html, destinatario: visible, cantidad: ll.length, cupo: MailApp.getRemainingDailyQuota() };
  }

  if (!d.forzar) {
    const hace20h = new Date(Date.now() - 20 * 3600e3).toISOString();
    if (BD.leer('notificaciones').some((n) => n.estudiante_id === e.id && n.periodo_id === p.id && ESTADOS_ENVIADO.indexOf(n.estado) >= 0 && n.enviado_en >= hace20h))
      fallo('Ya se envió una notificación a este acudiente en las últimas horas.', 'DUPLICADO', { requiereConfirmacion: true });
  }
  if (MailApp.getRemainingDailyQuota() < 1) fallo('Se agotó el cupo diario de correos de la cuenta de Google. Intente mañana.');

  const id = uid();
  datos.enlace = urlConfirmacion(id);
  const correo = construirCorreo(datos);
  const n = { id, estudiante_id: e.id, periodo_id: p.id, destinatario: e.acudiente_correo, asunto: correo.asunto,
    cantidad_reportes: ll.length, fechas: ll.map((l) => l.fecha), estado: 'pendiente', proveedor: 'Gmail', error: '',
    enviado_por: u.id, enviado_por_nombre: u.nombre, enviado_en: ahoraIso(), actualizado_en: ahoraIso() };
  try {
    GmailApp.sendEmail(e.acudiente_correo, correo.asunto, correo.texto, {
      htmlBody: correo.html, name: (conf.responsable_cargo ? conf.responsable_cargo + ' · ' : '') + conf.nombre_institucion,
      replyTo: conf.correo_institucional || undefined,
    });
    n.estado = 'enviado';
  } catch (err) {
    n.estado = 'fallido'; n.error = String(err.message || err).slice(0, 500);
  }
  BD.insertar('notificaciones', [n]);
  auditar(u, 'notificaciones', 'ENVIO', id, { estudiante_id: e.id, periodo_id: p.id, cantidad: ll.length, estado: n.estado });
  return n.estado === 'enviado' ? { ok: true, estado: 'enviado', id, destinatario: visible } : { ok: false, estado: 'fallido', error: n.error };
}

function urlConfirmacion(id) {
  let base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = ''; }
  return base ? `${base}?confirmar=${encodeURIComponent(id)}&f=${firmar('conf:' + id)}` : '';
}

/** El acudiente pulsa "Confirmar recepción" en el correo: se marca como leído. */
function confirmarLectura(id, firma) {
  let ok = false;
  if (firma && firma === firmar('conf:' + id)) {
    conBloqueo(() => {
      const n = BD.leer('notificaciones').find((x) => x.id === id);
      if (n) {
        ok = true;
        if (NIVEL_ESTADO.abierto > (NIVEL_ESTADO[n.estado] || 0) || n.estado === 'rebotado') {
          n.estado = 'abierto'; n.error = ''; n.actualizado_en = ahoraIso(); BD.actualizar('notificaciones', n);
        }
      }
    });
  }
  const conf = ok ? leerConfig() : null;
  const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head>
    <body style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f2f4f8;color:#1b2333">
    <div style="max-width:520px;margin:48px auto;background:#fff;border-radius:12px;border:1px solid #dfe4ec;overflow:hidden">
      <div style="background:#123a6b;color:#fff;padding:20px 24px;font-weight:700;font-size:18px">${ok ? esc(conf.nombre_institucion) : 'Control de llegadas tarde'}</div>
      <div style="height:4px;background:#c8a24a"></div>
      <div style="padding:24px">${ok
        ? '<h2 style="margin:0 0 8px;color:#1f7a4d">¡Gracias! Recepción confirmada</h2><p>La institución ha registrado que usted recibió y leyó la notificación de llegadas tarde. Si necesita comunicarse con nosotros, responda al correo o use los datos de contacto indicados en él.</p>'
        : '<h2 style="margin:0 0 8px;color:#b42318">Enlace no válido</h2><p>El enlace de confirmación no es válido o ya no existe.</p>'}</div>
    </div></body></html>`;
  return HtmlService.createHtmlOutput(html).setTitle('Confirmación de recepción');
}

function construirCorreo(d) {
  const n = d.llegadas.length;
  const asunto = `Notificación de llegadas tarde – ${d.estudiante.nombre} (${d.estudiante.curso}) – ${d.periodo.nombre} ${d.periodo.anio}`;
  const filas = d.llegadas.map((l, i) => `
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e9f0;color:#5b6475">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e9f0">${esc(fechaLarga(l.fecha))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e9f0">${esc(String(l.hora).slice(0, 5))}</td></tr>`).join('');
  const dato = (k, v) => (v ? `<tr><td style="padding:4px 0;color:#5b6475;width:150px">${k}</td><td style="padding:4px 0;color:#1b2333;font-weight:600">${esc(v)}</td></tr>` : '');
  const confirmar = d.enlace ? `<tr><td style="padding:20px 28px 0" align="center">
      <a href="${esc(d.enlace)}" style="display:inline-block;background:#123a6b;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">Confirmar recepción de esta notificación</a>
      <p style="font-size:12px;color:#5b6475;margin:8px 0 0">Al pulsar el botón, la institución sabrá que usted leyó este mensaje.</p></td></tr>` : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f2f4f8;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2333">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dfe4ec">
  <tr><td style="background:#123a6b;padding:22px 28px;color:#ffffff">
    ${d.institucion.logo ? `<img src="${esc(d.institucion.logo)}" alt="" height="48" style="float:right;max-height:48px">` : ''}
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">${esc(d.institucion.nombre)}</div>
    <div style="font-size:21px;font-weight:700;margin-top:4px">Notificación de llegadas tarde</div>
  </td></tr>
  <tr><td style="height:4px;background:#c8a24a"></td></tr>
  <tr><td style="padding:26px 28px 8px">
    <p style="margin:0 0 14px">Señor(a) <strong>${esc(d.acudiente.nombre || 'acudiente')}</strong>:</p>
    <p style="margin:0 0 14px;line-height:1.55">Reciba un cordial saludo. Le informamos que el/la estudiante <strong>${esc(d.estudiante.nombre)}</strong>,
      de grado <strong>${esc(d.estudiante.grado)}</strong>, curso <strong>${esc(d.estudiante.curso)}</strong>, registra
      <strong>${n} llegadas tarde</strong> durante el <strong>${esc(d.periodo.nombre)} ${esc(d.periodo.anio)}</strong>, superando el límite institucional de ${esc(d.umbral)}.</p>
    <p style="margin:0 0 6px;line-height:1.55">La puntualidad es parte fundamental del proceso formativo. Le solicitamos acompañar al estudiante para superar esta situación
      y, si lo considera necesario, comunicarse con la institución.</p>
  </td></tr>
  <tr><td style="padding:12px 28px 0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;border-radius:10px;padding:14px 18px;font-size:14px">
      <tr><td colspan="2" style="padding-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#123a6b;font-weight:700">Datos del estudiante</td></tr>
      ${dato('Estudiante', d.estudiante.nombre)}${dato('Documento', `${d.estudiante.tipo} ${d.estudiante.documento}`)}
      ${dato('Grado', d.estudiante.grado)}${dato('Curso', d.estudiante.curso)}
      ${dato('Período académico', `${d.periodo.nombre} ${d.periodo.anio}`)}${dato('Cantidad de reportes', String(n))}
    </table></td></tr>
  <tr><td style="padding:18px 28px 0">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#123a6b;font-weight:700;margin-bottom:6px">Fechas de las llegadas tarde</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;border:1px solid #e5e9f0;border-radius:8px">
      <tr style="background:#eef2f8"><th align="left" style="padding:8px 12px">#</th><th align="left" style="padding:8px 12px">Fecha</th><th align="left" style="padding:8px 12px">Hora de llegada</th></tr>
      ${filas}
    </table></td></tr>
  <tr><td style="padding:18px 28px 0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;border-radius:10px;padding:14px 18px;font-size:14px">
      <tr><td colspan="2" style="padding-bottom:6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#123a6b;font-weight:700">Datos del acudiente registrados</td></tr>
      ${dato('Nombre', d.acudiente.nombre)}${dato('Parentesco', d.acudiente.parentesco)}${dato('Correo', d.acudiente.correo)}
      ${dato('Teléfono', d.acudiente.telefono)}${dato('Dirección', d.acudiente.direccion)}
    </table>
    <p style="font-size:12px;color:#5b6475;margin:8px 0 0">Si algún dato no es correcto, por favor infórmelo a la institución para actualizarlo.</p>
  </td></tr>
  ${confirmar}
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0">Atentamente,</p>
    <p style="margin:14px 0 0;font-weight:700">${esc(d.institucion.responsable || '')}</p>
    <p style="margin:0;color:#5b6475">${esc(d.institucion.cargo || '')}<br>${esc(d.institucion.nombre)}${d.institucion.ciudad ? ' · ' + esc(d.institucion.ciudad) : ''}
      ${d.institucion.telefono ? '<br>Tel. ' + esc(d.institucion.telefono) : ''}${d.institucion.correo ? '<br>' + esc(d.institucion.correo) : ''}</p>
  </td></tr>
  <tr><td style="background:#f6f8fb;padding:14px 28px;font-size:11px;line-height:1.5;color:#6b7385;border-top:1px solid #e5e9f0">
    Mensaje generado por el sistema institucional de control de llegadas tarde. La información es confidencial y está dirigida exclusivamente
    al acudiente registrado; se trata conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 de protección de datos personales.
    Si recibió este correo por error, por favor elimínelo e infórmenos.
  </td></tr>
</table></td></tr></table></body></html>`;
  const texto = [
    `${d.institucion.nombre} – Notificación de llegadas tarde`, '',
    `Señor(a) ${d.acudiente.nombre || 'acudiente'}:`,
    `El/la estudiante ${d.estudiante.nombre} (grado ${d.estudiante.grado}, curso ${d.estudiante.curso}) registra ${n} llegadas tarde en el ${d.periodo.nombre} ${d.periodo.anio}.`,
    '', 'Fechas:', ...d.llegadas.map((l, i) => `${i + 1}. ${fechaLarga(l.fecha)} – ${String(l.hora).slice(0, 5)}`), '',
    d.enlace ? `Confirme la recepción en: ${d.enlace}` : '', '',
    `${d.institucion.responsable || ''} – ${d.institucion.cargo || ''}`, d.institucion.nombre,
  ].join('\n');
  return { asunto, html, texto };
}

/** Correo de bienvenida o de recuperación de contraseña para usuarios de la plataforma. */
function enviarCorreoCuenta(u, clave, sitio, recuperacion) {
  const conf = leerConfig();
  const enlace = /^https?:\/\//.test(String(sitio || '')) ? String(sitio) : '';
  const asunto = recuperacion ? 'Recuperación de contraseña – Control de Llegadas Tarde' : 'Su acceso a la plataforma de Control de Llegadas Tarde';
  const html = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2333;max-width:560px">
    <h2 style="color:#123a6b;margin:0 0 6px">${esc(conf.nombre_institucion)}</h2>
    <p>Hola, <strong>${esc(u.nombre)}</strong>.</p>
    <p>${recuperacion ? 'Recibimos una solicitud para restablecer su contraseña. Use esta contraseña temporal:' : `Se creó su cuenta como <strong>${u.rol === 'admin' ? 'administrador(a)' : 'docente'}</strong> en la plataforma institucional de control de llegadas tarde.`}</p>
    <table style="background:#f6f8fb;border-radius:8px;padding:12px 16px;font-size:15px">
      <tr><td style="color:#5b6475;padding-right:12px">Usuario</td><td><strong>${esc(u.correo)}</strong></td></tr>
      <tr><td style="color:#5b6475;padding-right:12px">Contraseña temporal</td><td><strong style="font-family:monospace;font-size:16px">${esc(clave)}</strong></td></tr>
    </table>
    ${enlace ? `<p><a href="${esc(enlace)}" style="display:inline-block;background:#123a6b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">Ingresar a la plataforma</a></p>` : ''}
    <p>Por seguridad, la plataforma le pedirá cambiar esta contraseña al ingresar.${recuperacion ? ' Si usted no solicitó el cambio, comuníquese con el administrador.' : ''}</p>
    <p style="font-size:12px;color:#6b7385">Datos personales tratados conforme a la Ley 1581 de 2012. No comparta su contraseña.</p></div>`;
  GmailApp.sendEmail(u.correo, asunto, `Usuario: ${u.correo}\nContraseña temporal: ${clave}\n${enlace}`, { htmlBody: html, name: conf.nombre_institucion });
}

/* ------------------------------------------------------------------------- */
/* 10. Estado de entrega (se ejecuta cada hora con un activador)              */
/* ------------------------------------------------------------------------- */
/**
 * Revisa la bandeja de entrada de la cuenta que envía:
 *  · Si llega un aviso de "correo no entregado" (mailer-daemon) para un
 *    destinatario reciente, la notificación queda como "Rebotado".
 *  · Si pasan HORAS_SIN_REBOTE horas sin aviso de error, queda como "Entregado".
 */
function revisarEntregas() {
  conBloqueo(() => {
    const pendientes = BD.leer('notificaciones').filter((n) => n.estado === 'enviado');
    if (!pendientes.length) return;
    const avisos = [];
    GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:7d', 0, 100).forEach((hilo) =>
      hilo.getMessages().forEach((m) => avisos.push({ fecha: m.getDate().toISOString(), texto: (m.getSubject() + '\n' + m.getPlainBody()).toLowerCase() })));
    const limite = new Date(Date.now() - AJUSTES.HORAS_SIN_REBOTE * 3600e3).toISOString();
    pendientes.forEach((n) => {
      const destino = String(n.destinatario).toLowerCase();
      const rebote = avisos.find((a) => a.fecha >= n.enviado_en && a.texto.indexOf(destino) >= 0);
      if (rebote) {
        const linea = rebote.texto.split('\n').find((l) => /(no se ha encontrado|not found|does not exist|no existe|rejected|rechaz|unable|couldn't be delivered|address)/.test(l)) || 'El servidor de destino rechazó el mensaje';
        n.estado = 'rebotado'; n.error = linea.trim().slice(0, 300);
      } else if (n.enviado_en <= limite) {
        n.estado = 'entregado';
      } else return;
      n.actualizado_en = ahoraIso();
      BD.actualizar('notificaciones', n);
    });
  });
}

/* ------------------------------------------------------------------------- */
/* 11. Instalación y mantenimiento (ejecutar desde el editor)                 */
/* ------------------------------------------------------------------------- */
/**
 * Crea (o completa) la hoja de cálculo en su Drive, el primer administrador
 * y el activador horario de estado de entrega. Puede ejecutarse varias veces
 * sin perder datos.
 */
function instalar() {
  let libro = null;
  const id = props().getProperty('ID_HOJA');
  if (id) { try { libro = SpreadsheetApp.openById(id); } catch (e) { libro = null; } }
  if (!libro) {
    libro = SpreadsheetApp.create(AJUSTES.NOMBRE_HOJA);
    props().setProperty('ID_HOJA', libro.getId());
  }
  libro.setSpreadsheetTimeZone(AJUSTES.ZONA);
  Object.keys(ESQUEMA).forEach((t) => {
    const d = BD.def(t);
    let h = libro.getSheetByName(d.hoja);
    if (!h) h = libro.insertSheet(d.hoja);
    const ancho = d.cols.length;
    if (h.getMaxColumns() < ancho) h.insertColumnsAfter(h.getMaxColumns(), ancho - h.getMaxColumns());
    h.getRange(1, 1, h.getMaxRows(), ancho).setNumberFormat('@');
    h.getRange(1, 1, 1, ancho).setValues([d.cols.map((c) => c.n)]).setFontWeight('bold').setBackground('#123a6b').setFontColor('#ffffff');
    h.setFrozenRows(1);
  });
  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach((n) => { const h = libro.getSheetByName(n); if (h && libro.getSheets().length > 1) libro.deleteSheet(h); });
  secreto();

  // Configuración por defecto
  const conf = BD.leer('configuracion');
  BD.insertar('configuracion', Object.keys(CONFIG_DEFECTO).filter((k) => !conf.some((f) => f.clave === k)).map((k) => ({ clave: k, valor: CONFIG_DEFECTO[k] })));

  // Primer administrador
  const usuarios = BD.leer('usuarios');
  let mensajeAdmin = 'Ya existe al menos un administrador.';
  if (!usuarios.some((u) => u.rol === 'admin' && u.activo)) {
    const correo = String(AJUSTES.ADMIN_CORREO).trim().toLowerCase();
    if (!validarCorreo(correo) || /su-institucion/.test(correo)) throw new Error('Escriba un correo real en AJUSTES.ADMIN_CORREO antes de instalar.');
    const temporal = claveTemporal();
    let u = usuarios.find((x) => x.correo === correo);
    if (u) { u.rol = 'admin'; u.activo = true; fijarClave(u, temporal, true); BD.actualizar('usuarios', u); }
    else { u = { id: uid(), nombre: AJUSTES.ADMIN_NOMBRE, correo, rol: 'admin', activo: true, version: 0, creado_en: ahoraIso(), ultimo_ingreso: '' }; fijarClave(u, temporal, true); BD.insertar('usuarios', [u]); }
    try { enviarCorreoCuenta(u, temporal, '', false); } catch (e) { /* se muestra en el registro */ }
    mensajeAdmin = `Administrador: ${correo}  ·  Contraseña temporal: ${temporal}  (también se envió a ese correo)`;
  }

  // Activador horario del estado de entrega
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'revisarEntregas').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarEntregas').timeBased().everyHours(1).create();
  props().setProperty('VERSION_DATOS', String(Date.now()));

  Logger.log('✔ Instalación completa.');
  Logger.log('Hoja de cálculo en su Drive: ' + libro.getUrl());
  Logger.log(mensajeAdmin);
  Logger.log('Siguiente paso: Implementar › Nueva implementación › Aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario).');
}

/** Opcional: crea los grados 6.º a 11.º (dos cursos por grado) y cuatro períodos del año en curso. */
function cargarCatalogoBase() {
  conBloqueo(() => {
    const anio = Number(Utilities.formatDate(new Date(), zona(), 'yyyy'));
    const grados = BD.leer('grados'), cursos = BD.leer('cursos'), periodos = BD.leer('periodos');
    const nombres = ['Sexto', 'Séptimo', 'Octavo', 'Noveno', 'Décimo', 'Once'];
    nombres.forEach((nombre, i) => {
      const orden = i + 6;
      let g = grados.find((x) => norm(x.nombre) === norm(nombre));
      if (!g) { g = { id: uid(), nombre, orden }; BD.insertar('grados', [g]); }
      [1, 2].forEach((k) => {
        const n = String(orden * 100 + k);
        if (!cursos.some((c) => c.grado_id === g.id && c.nombre === n)) BD.insertar('cursos', [{ id: uid(), grado_id: g.id, nombre: n, director: '' }]);
      });
    });
    if (!periodos.some((p) => p.anio === anio)) {
      BD.insertar('periodos', [
        ['Período 1', '01-26', '04-05'], ['Período 2', '04-06', '06-21'], ['Período 3', '06-22', '09-13'], ['Período 4', '09-14', '12-04'],
      ].map(([nombre, i, f]) => ({ id: uid(), nombre, anio, fecha_inicio: `${anio}-${i}`, fecha_fin: `${anio}-${f}`, creado_en: ahoraIso() })));
    }
  });
  Logger.log('Grados, cursos y períodos base creados. Ajuste las fechas en la plataforma (Configuración › Períodos).');
}

/** Emergencia: genera una nueva contraseña temporal para el administrador de AJUSTES.ADMIN_CORREO. */
function restablecerAdministrador() {
  conBloqueo(() => {
    const correo = String(AJUSTES.ADMIN_CORREO).trim().toLowerCase();
    const u = BD.leer('usuarios').find((x) => x.correo === correo) || fallo('No existe un usuario con ' + correo);
    const temporal = claveTemporal();
    u.rol = 'admin'; u.activo = true; fijarClave(u, temporal, true); BD.actualizar('usuarios', u);
    Logger.log(`Nueva contraseña temporal para ${correo}: ${temporal}`);
  });
}

/** Muestra el cupo de correos disponible hoy para la cuenta. */
function verCupoCorreo() { Logger.log('Correos disponibles hoy: ' + MailApp.getRemainingDailyQuota()); }
