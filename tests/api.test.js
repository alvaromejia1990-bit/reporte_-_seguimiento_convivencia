'use strict';
/**
 * Pruebas de integración de la API.
 * Levantan el servidor con una base de datos temporal y datos de demostración.
 * Ejecutar: npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tardanzas-test-'));
const PUERTO = 3900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PUERTO}`;
const ENV = {
  ...process.env,
  PUERTO: String(PUERTO),
  RUTA_BASE_DATOS: path.join(DIR, 'prueba.db'),
  JWT_SECRETO: 'secreto_de_pruebas_0123456789abcdef0123456789abcdef',
  ZONA_HORARIA: 'America/Bogota',
  ADMIN_EMAIL: '',
  ADMIN_CLAVE: '',
  SMTP_HOST: '',
  CORREO_REMITENTE: '',
};

let servidor;

/** Cliente con su propia cookie de sesión. */
function cliente() {
  let cookie = '';
  return async (metodo, ruta, cuerpo, { crudo = false, sinCsrf = false } = {}) => {
    const h = { cookie };
    if (!sinCsrf) h['X-Requested-With'] = 'fetch';
    let body = cuerpo;
    if (cuerpo !== undefined && !(cuerpo instanceof FormData)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
    const r = await fetch(B + ruta, { method: metodo, headers: h, body });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    if (crudo) return r;
    return { s: r.status, j: await r.json().catch(() => null) };
  };
}

before(async () => {
  const seed = spawnSync(process.execPath, ['scripts/seed-demo.js'], { cwd: RAIZ, env: ENV, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
  servidor = spawn(process.execPath, ['src/server.js'], { cwd: RAIZ, env: ENV, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${B}/api/salud`)).ok) return; } catch { /* aún iniciando */ }
    await new Promise((ok) => setTimeout(ok, 200));
  }
  throw new Error('El servidor no inició');
});

after(() => {
  servidor?.kill();
  fs.rmSync(DIR, { recursive: true, force: true });
});

const admin = cliente();
const docente = cliente();
let config;
let idNuevo;

test('autenticación: rechaza credenciales incorrectas y acepta las válidas', async () => {
  assert.equal((await admin('POST', '/api/auth/login', { email: 'admin@demo.edu.co', password: 'incorrecta' })).s, 401);
  assert.equal((await admin('POST', '/api/auth/login', { email: 'admin@demo.edu.co', password: 'Admin2026' })).s, 200);
  assert.equal((await docente('POST', '/api/auth/login', { email: 'docente@demo.edu.co', password: 'Docente2026' })).s, 200);
  config = (await admin('GET', '/api/configuracion')).j;
  assert.ok(config.grados.length > 0 && config.cursos.length > 0);
  // Si la fecha de ejecución cae fuera de los períodos de demostración, se crea uno que la incluya.
  if (!config.periodo_actual) {
    const r = await admin('POST', '/api/configuracion/periodos', { nombre: 'Período de prueba', fecha_inicio: config.hoy, fecha_fin: config.hoy });
    assert.equal(r.s, 201);
    config = (await admin('GET', '/api/configuracion')).j;
  }
});

test('sin sesión no hay acceso a los datos', async () => {
  const anonimo = cliente();
  assert.equal((await anonimo('GET', '/api/estudiantes')).s, 401);
});

test('peticiones que modifican datos exigen la cabecera anti-CSRF', async () => {
  const r = await admin('POST', '/api/tardanzas', { estudiante_ids: [1] }, { sinCsrf: true });
  assert.equal(r.s, 403);
});

test('registro de estudiante y prevención de duplicados', async () => {
  const curso = config.cursos[0];
  const datos = { nombre: 'prueba  ÁLVARO de la  torre', documento: '55443322', edad: 12, grado_id: curso.grado_id, curso_id: curso.id, correo_acudiente: 'acudiente@example.com', telefono: '3001234567' };
  const r = await admin('POST', '/api/estudiantes', datos);
  assert.equal(r.s, 201);
  assert.equal(r.j.estudiante.nombre, 'Prueba Álvaro de la Torre');
  idNuevo = r.j.estudiante.id;
  assert.equal((await admin('POST', '/api/estudiantes', { ...datos, documento: '' })).s, 409, 'duplicado por nombre');
  assert.equal((await admin('POST', '/api/estudiantes', { ...datos, nombre: 'Otro Nombre' })).s, 409, 'duplicado por documento');
  assert.equal((await admin('POST', '/api/estudiantes', { ...datos, nombre: 'X', documento: '1', correo_acudiente: 'malo' })).s, 400);
});

test('el docente no puede crear estudiantes y ve los datos de contacto enmascarados', async () => {
  assert.equal((await docente('POST', '/api/estudiantes', { nombre: 'Ana Gómez' })).s, 403);
  const r = await docente('GET', `/api/estudiantes/${idNuevo}`);
  assert.equal(r.j.estudiante.protegido, true);
  assert.notEqual(r.j.estudiante.correo_acudiente, 'acudiente@example.com');
});

test('carga masiva: vista previa, actualización y errores', async () => {
  const grado = config.grados[0];
  const curso = config.cursos.find((c) => c.grado_id === grado.id);
  const csv = [
    'Documento;Nombre completo;Edad;Grado;Curso;Acudiente;Correo acudiente;Teléfono;Dirección',
    `55443322;Prueba Álvaro de la Torre;13;${grado.nombre};${curso.nombre};Rosa Torre;nuevo@example.com;3001234567;`,
    `;Estudiante Nuevo Importado;11;${grado.nombre};${curso.nombre};;;;`,
    ';Sin Grado Ni Curso;11;;;;;;',
  ].join('\n');
  const enviar = (modo) => {
    const fd = new FormData();
    fd.append('archivo', new Blob([csv]), 'estudiantes.csv');
    fd.append('modo', modo);
    return admin('POST', '/api/estudiantes/importar', fd);
  };
  const previa = await enviar('previsualizar');
  assert.deepEqual([previa.j.resumen.crear, previa.j.resumen.actualizar, previa.j.resumen.errores], [1, 1, 1]);
  const aplicada = await enviar('aplicar');
  assert.equal(aplicada.j.aplicado, true);
  const e = await admin('GET', `/api/estudiantes/${idNuevo}`);
  assert.equal(e.j.estudiante.correo_acudiente, 'nuevo@example.com');
  assert.equal(e.j.estudiante.edad, 13);
});

test('reporte de llegadas tarde múltiple sin duplicados en la misma jornada', async () => {
  const lista = (await docente('GET', `/api/tardanzas/estudiantes?curso_id=${config.cursos[0].id}`)).j.estudiantes;
  const ids = lista.filter((x) => !x.hora_hoy).slice(0, 3).map((x) => x.id);
  const r = await docente('POST', '/api/tardanzas', { estudiante_ids: ids, observacion: 'Prueba' });
  assert.equal(r.j.registrados.length, ids.length);
  assert.match(r.j.hora, /^\d{2}:\d{2}$/);
  const otra = await docente('POST', '/api/tardanzas', { estudiante_ids: [ids[0]] });
  assert.equal(otra.j.registrados.length, 0);
  assert.equal(otra.j.duplicados.length, 1);
});

test('seguimiento: solo estudiantes por encima del límite', async () => {
  const r = await admin('GET', '/api/seguimiento?periodo_id=todos');
  assert.ok(r.j.estudiantes.length > 0);
  assert.ok(r.j.estudiantes.every((e) => e.cantidad > r.j.umbral));
});

test('notificar sin correo configurado responde con un error claro', async () => {
  const id = (await admin('GET', '/api/seguimiento?periodo_id=todos')).j.estudiantes[0].id;
  const r = await admin('POST', `/api/seguimiento/estudiante/${id}/notificar`, { periodo_id: 'todos' });
  assert.equal(r.s, 503);
});

test('reporte individual en PDF', async () => {
  const id = (await admin('GET', '/api/seguimiento?periodo_id=todos')).j.estudiantes[0].id;
  const r = await admin('GET', `/api/seguimiento/estudiante/${id}/reporte.pdf?periodo_id=todos`, undefined, { crudo: true });
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.subarray(0, 4).toString(), '%PDF');
});

test('informes: indicadores y exportación a PDF y Excel', async () => {
  const r = await admin('GET', '/api/informes?periodo_id=todos');
  assert.ok(r.j.kpis.total_reportes > 0);
  assert.ok(r.j.porGrado.length > 0 && r.j.comparativoPeriodos.length > 0);
  const pdf = await admin('POST', '/api/informes/exportar/pdf', { filtros: {} }, { crudo: true });
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  const xlsx = await admin('POST', '/api/informes/exportar/xlsx', { filtros: {} }, { crudo: true });
  assert.equal(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
});

test('configuración: solo administradores y validación de períodos', async () => {
  assert.equal((await docente('GET', '/api/configuracion/usuarios')).s, 403);
  const p = config.periodos.at(-1);
  const cruce = await admin('POST', '/api/configuracion/periodos', { nombre: 'Cruce', fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin });
  assert.equal(cruce.s, 409);
  const respaldo = await admin('GET', '/api/configuracion/respaldo', undefined, { crudo: true });
  assert.equal(respaldo.status, 200);
});
