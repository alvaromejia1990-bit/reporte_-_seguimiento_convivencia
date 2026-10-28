'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, leerConfig, guardarConfig, periodoDeFecha, auditar } = require('../db');
const { requiereRol } = require('../middleware/auth');
const { validarClave } = require('./auth');
const correo = require('../services/correo');
const { TZ, ahora, limpiar, fechaValida, correoValido, marcaTiempo, ErrorHttp, ruta } = require('../utils');

const r = express.Router();
const soloAdmin = requiereRol('admin');

/** Configuración general visible para todos los usuarios autenticados. */
r.get('/', (req, res) => {
  const c = leerConfig();
  res.json({
    institucion: { nombre: c.institucion_nombre, sigla: c.institucion_sigla, ciudad: c.institucion_ciudad, firma_correo: c.firma_correo },
    umbral: c.umbral_seguimiento,
    periodos: db.prepare('SELECT * FROM periodos ORDER BY fecha_inicio').all(),
    periodo_actual: periodoDeFecha(ahora().fecha),
    grados: db.prepare('SELECT g.*, (SELECT COUNT(*) FROM estudiantes e WHERE e.grado_id = g.id AND e.activo = 1) AS estudiantes FROM grados g ORDER BY orden, nombre').all(),
    cursos: db.prepare(`SELECT c.*, g.nombre AS grado, (SELECT COUNT(*) FROM estudiantes e WHERE e.curso_id = c.id AND e.activo = 1) AS estudiantes
                        FROM cursos c JOIN grados g ON g.id = c.grado_id ORDER BY g.orden, c.nombre`).all(),
    correo_configurado: correo.correoConfigurado(),
    hoy: ahora().fecha,
    zona: TZ,
  });
});

r.put('/institucion', soloAdmin, (req, res) => {
  const nombre = limpiar(req.body?.nombre);
  if (nombre.length < 3) throw new ErrorHttp(400, 'Ingrese el nombre de la institución.');
  const umbral = Number(req.body?.umbral);
  if (!Number.isInteger(umbral) || umbral < 1 || umbral > 50) throw new ErrorHttp(400, 'El límite de llegadas tarde debe ser un entero entre 1 y 50.');
  guardarConfig('institucion_nombre', nombre.slice(0, 150));
  guardarConfig('institucion_sigla', limpiar(req.body?.sigla).slice(0, 30));
  guardarConfig('institucion_ciudad', limpiar(req.body?.ciudad).slice(0, 80));
  guardarConfig('firma_correo', limpiar(req.body?.firma_correo).slice(0, 120) || 'Coordinación');
  guardarConfig('umbral_seguimiento', umbral);
  auditar(req, 'configurar_institucion', { nombre, umbral });
  res.json({ ok: true });
});

/* ------------------------------ Períodos ------------------------------ */
function validarPeriodo(b, id = 0) {
  const nombre = limpiar(b?.nombre);
  if (!nombre) throw new ErrorHttp(400, 'Ingrese el nombre del período.');
  if (!fechaValida(b?.fecha_inicio) || !fechaValida(b?.fecha_fin)) throw new ErrorHttp(400, 'Ingrese fechas válidas.');
  if (b.fecha_fin < b.fecha_inicio) throw new ErrorHttp(400, 'La fecha final debe ser posterior a la inicial.');
  const cruce = db.prepare('SELECT nombre FROM periodos WHERE id <> ? AND fecha_inicio <= ? AND fecha_fin >= ?').get(id, b.fecha_fin, b.fecha_inicio);
  if (cruce) throw new ErrorHttp(409, `Las fechas se cruzan con el período "${cruce.nombre}".`);
  return { nombre, fecha_inicio: b.fecha_inicio, fecha_fin: b.fecha_fin };
}

r.post('/periodos', soloAdmin, (req, res) => {
  const p = validarPeriodo(req.body);
  try {
    const info = db.prepare('INSERT INTO periodos (nombre, fecha_inicio, fecha_fin) VALUES (@nombre, @fecha_inicio, @fecha_fin)').run(p);
    auditar(req, 'crear_periodo', p);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorHttp(409, 'Ya existe un período con ese nombre.');
    throw e;
  }
});

r.put('/periodos/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const p = validarPeriodo(req.body, id);
  const fuera = db.prepare('SELECT COUNT(*) n FROM llegadas_tarde WHERE periodo_id = ? AND (fecha < ? OR fecha > ?)').get(id, p.fecha_inicio, p.fecha_fin).n;
  if (fuera) throw new ErrorHttp(409, `Hay ${fuera} reportes que quedarían fuera de las nuevas fechas del período.`);
  try {
    db.prepare('UPDATE periodos SET nombre = @nombre, fecha_inicio = @fecha_inicio, fecha_fin = @fecha_fin WHERE id = @id').run({ ...p, id });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorHttp(409, 'Ya existe un período con ese nombre.');
    throw e;
  }
  auditar(req, 'editar_periodo', { id, ...p });
  res.json({ ok: true });
});

r.delete('/periodos/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const n = db.prepare('SELECT COUNT(*) n FROM llegadas_tarde WHERE periodo_id = ?').get(id).n;
  if (n) throw new ErrorHttp(409, `No se puede eliminar: el período tiene ${n} reportes registrados.`);
  db.prepare('DELETE FROM periodos WHERE id = ?').run(id);
  auditar(req, 'eliminar_periodo', { id });
  res.json({ ok: true });
});

/* ------------------------------ Grados ------------------------------ */
r.post('/grados', soloAdmin, (req, res) => {
  const nombre = limpiar(req.body?.nombre);
  if (!nombre) throw new ErrorHttp(400, 'Ingrese el nombre del grado.');
  const orden = Number(req.body?.orden) || (db.prepare('SELECT IFNULL(MAX(orden),0) m FROM grados').get().m + 1);
  try {
    const info = db.prepare('INSERT INTO grados (nombre, orden) VALUES (?, ?)').run(nombre, orden);
    auditar(req, 'crear_grado', { nombre });
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorHttp(409, 'Ese grado ya existe.');
    throw e;
  }
});

r.put('/grados/:id', soloAdmin, (req, res) => {
  const nombre = limpiar(req.body?.nombre);
  if (!nombre) throw new ErrorHttp(400, 'Ingrese el nombre del grado.');
  try {
    db.prepare('UPDATE grados SET nombre = ?, orden = ? WHERE id = ?').run(nombre, Number(req.body?.orden) || 0, Number(req.params.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorHttp(409, 'Ese grado ya existe.');
    throw e;
  }
  auditar(req, 'editar_grado', { id: req.params.id, nombre });
  res.json({ ok: true });
});

r.delete('/grados/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const uso = db.prepare('SELECT (SELECT COUNT(*) FROM cursos WHERE grado_id = ?) c, (SELECT COUNT(*) FROM estudiantes WHERE grado_id = ?) e').get(id, id);
  if (uso.c || uso.e) throw new ErrorHttp(409, 'No se puede eliminar: el grado tiene cursos o estudiantes asociados.');
  db.prepare('DELETE FROM grados WHERE id = ?').run(id);
  auditar(req, 'eliminar_grado', { id });
  res.json({ ok: true });
});

/* ------------------------------ Cursos ------------------------------ */
r.post('/cursos', soloAdmin, (req, res) => {
  const nombre = limpiar(req.body?.nombre).toUpperCase();
  const gradoId = Number(req.body?.grado_id);
  if (!nombre || !gradoId) throw new ErrorHttp(400, 'Indique el grado y el nombre del curso.');
  if (!db.prepare('SELECT id FROM grados WHERE id = ?').get(gradoId)) throw new ErrorHttp(404, 'Grado no encontrado.');
  try {
    const info = db.prepare('INSERT INTO cursos (grado_id, nombre) VALUES (?, ?)').run(gradoId, nombre);
    auditar(req, 'crear_curso', { nombre, grado_id: gradoId });
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorHttp(409, 'Ese curso ya existe en el grado.');
    throw e;
  }
});

r.put('/cursos/:id', soloAdmin, (req, res) => {
  const nombre = limpiar(req.body?.nombre).toUpperCase();
  if (!nombre) throw new ErrorHttp(400, 'Ingrese el nombre del curso.');
  try {
    db.prepare('UPDATE cursos SET nombre = ? WHERE id = ?').run(nombre, Number(req.params.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorHttp(409, 'Ese curso ya existe en el grado.');
    throw e;
  }
  auditar(req, 'editar_curso', { id: req.params.id, nombre });
  res.json({ ok: true });
});

r.delete('/cursos/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const uso = db.prepare('SELECT (SELECT COUNT(*) FROM estudiantes WHERE curso_id = ?) e, (SELECT COUNT(*) FROM llegadas_tarde WHERE curso_id = ?) t').get(id, id);
  if (uso.e || uso.t) throw new ErrorHttp(409, 'No se puede eliminar: el curso tiene estudiantes o reportes asociados.');
  db.prepare('DELETE FROM cursos WHERE id = ?').run(id);
  auditar(req, 'eliminar_curso', { id });
  res.json({ ok: true });
});

/* ------------------------------ Usuarios ------------------------------ */
r.get('/usuarios', soloAdmin, (req, res) => {
  res.json({ usuarios: db.prepare('SELECT id, nombre, email, rol, activo, ultimo_acceso, creado_en FROM usuarios ORDER BY rol, nombre').all() });
});

r.post('/usuarios', soloAdmin, ruta(async (req, res) => {
  const nombre = limpiar(req.body?.nombre);
  const email = limpiar(req.body?.email).toLowerCase();
  const rol = req.body?.rol === 'admin' ? 'admin' : 'docente';
  const clave = String(req.body?.password || '');
  if (nombre.length < 3) throw new ErrorHttp(400, 'Ingrese el nombre del usuario.');
  if (!correoValido(email)) throw new ErrorHttp(400, 'Correo no válido.');
  validarClave(clave);
  if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo.');
  const hash = await bcrypt.hash(clave, 12);
  const info = db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, creado_en) VALUES (?, ?, ?, ?, ?)').run(nombre, email, hash, rol, marcaTiempo());
  auditar(req, 'crear_usuario', { email, rol });
  res.status(201).json({ id: Number(info.lastInsertRowid) });
}));

r.put('/usuarios/:id', soloAdmin, ruta(async (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) throw new ErrorHttp(404, 'Usuario no encontrado.');
  const nombre = limpiar(req.body?.nombre) || u.nombre;
  const email = limpiar(req.body?.email).toLowerCase() || u.email;
  const rol = req.body?.rol === 'admin' ? 'admin' : req.body?.rol === 'docente' ? 'docente' : u.rol;
  const activo = req.body?.activo === undefined ? u.activo : (req.body.activo ? 1 : 0);
  if (!correoValido(email)) throw new ErrorHttp(400, 'Correo no válido.');
  if (db.prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?').get(email, id)) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo.');
  const admins = db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?").get(id).n;
  if (u.rol === 'admin' && (rol !== 'admin' || !activo) && admins === 0) throw new ErrorHttp(409, 'Debe existir al menos un administrador activo.');
  if (id === req.usuario.id && (!activo || rol !== 'admin')) throw new ErrorHttp(409, 'No puede desactivar ni quitar el rol de administrador a su propia cuenta.');

  let cambioSesion = (rol !== u.rol || activo !== u.activo) ? 1 : 0;
  let hash = u.password_hash;
  if (req.body?.password) {
    validarClave(String(req.body.password));
    hash = await bcrypt.hash(String(req.body.password), 12);
    cambioSesion = 1;
  }
  db.prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ?, activo = ?, password_hash = ?, version_sesion = version_sesion + ? WHERE id = ?')
    .run(nombre, email, rol, activo, hash, cambioSesion, id);
  auditar(req, 'editar_usuario', { id, email, rol, activo, clave_cambiada: Boolean(req.body?.password) });
  res.json({ ok: true });
}));

/* ------------------------------ Correo ------------------------------ */
r.get('/correo', soloAdmin, ruta(async (req, res) => {
  const estado = { configurado: correo.correoConfigurado(), servidor: process.env.SMTP_HOST || null, remitente: process.env.CORREO_REMITENTE || null, conexion: null };
  if (estado.configurado) {
    try { await correo.verificar(); estado.conexion = 'ok'; } catch (e) { estado.conexion = e.message; }
  }
  res.json(estado);
}));

r.post('/correo/prueba', soloAdmin, ruta(async (req, res) => {
  const para = limpiar(req.body?.para) || req.usuario.email;
  if (!correoValido(para)) throw new ErrorHttp(400, 'Correo de destino no válido.');
  if (!correo.correoConfigurado()) throw new ErrorHttp(503, 'El servicio de correo no está configurado en el archivo .env.');
  const c = leerConfig();
  const r2 = await correo.enviar({
    para,
    asunto: `Prueba de correo · ${c.institucion_nombre}`,
    texto: 'Este es un mensaje de prueba de la plataforma de control de llegadas tarde. Si lo recibió, la configuración de correo funciona correctamente.',
    html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2 style="color:#16324F">${c.institucion_nombre}</h2><p>Este es un mensaje de prueba de la plataforma de control de llegadas tarde.</p><p>Si lo recibió, la configuración de correo funciona correctamente.</p></div>`,
  });
  auditar(req, 'prueba_correo', { para, estado: r2.estado });
  res.json(r2);
}));

/* ------------------------------ Auditoría y respaldo ------------------------------ */
r.get('/auditoria', soloAdmin, (req, res) => {
  const limite = Math.min(1000, Number(req.query.limite) || 200);
  res.json({ registros: db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?').all(limite) });
});

r.get('/respaldo', soloAdmin, ruta(async (req, res) => {
  const destino = path.join(os.tmpdir(), `respaldo_${Date.now()}.db`);
  await db.backup(destino);
  auditar(req, 'descargar_respaldo', null);
  res.download(destino, `respaldo_tardanzas_${ahora().fecha}.db`, () => fs.unlink(destino, () => {}));
}));

module.exports = r;
