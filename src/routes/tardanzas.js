'use strict';

const express = require('express');
const { db, auditar, periodoDeFecha } = require('../db');
const { requiereRol } = require('../middleware/auth');
const { ahora, limpiar, normalizar, ErrorHttp, ruta } = require('../utils');

const r = express.Router();

/** Estado del día: fecha, hora y período vigente. */
r.get('/jornada', (req, res) => {
  const { fecha, hora } = ahora();
  res.json({ fecha, hora, periodo: periodoDeFecha(fecha) });
});

/** Listado de estudiantes activos para reportar, con contadores y marca de "reportado hoy". */
r.get('/estudiantes', ruta(async (req, res) => {
  const { fecha } = ahora();
  const periodo = periodoDeFecha(fecha);
  const where = ['e.activo = 1'];
  const p = { fecha, periodo_id: periodo?.id ?? -1 };
  if (req.query.grado_id) { where.push('e.grado_id = @grado_id'); p.grado_id = Number(req.query.grado_id); }
  if (req.query.curso_id) { where.push('e.curso_id = @curso_id'); p.curso_id = Number(req.query.curso_id); }
  if (req.query.q) { where.push('e.nombre_norm LIKE @q'); p.q = `%${normalizar(req.query.q)}%`; }
  const filas = db.prepare(`
    SELECT e.id, e.nombre, e.grado_id, e.curso_id, g.nombre AS grado, c.nombre AS curso,
      (SELECT COUNT(*) FROM llegadas_tarde lt WHERE lt.estudiante_id = e.id AND lt.periodo_id = @periodo_id) AS tardanzas_periodo,
      (SELECT COUNT(*) FROM llegadas_tarde lt WHERE lt.estudiante_id = e.id) AS tardanzas_total,
      (SELECT lt.hora FROM llegadas_tarde lt WHERE lt.estudiante_id = e.id AND lt.fecha = @fecha) AS hora_hoy
    FROM estudiantes e
    JOIN grados g ON g.id = e.grado_id
    JOIN cursos c ON c.id = e.curso_id
    WHERE ${where.join(' AND ')}
    ORDER BY g.orden, c.nombre, e.nombre
    LIMIT 1000`).all(p);
  res.json({ fecha, periodo, estudiantes: filas });
}));

/**
 * Registra llegadas tarde (uno o varios estudiantes).
 * Fecha, hora y período se toman del servidor; no se permite duplicar en la misma jornada.
 */
r.post('/', ruta(async (req, res) => {
  const ids = [...new Set((req.body?.estudiante_ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw new ErrorHttp(400, 'Seleccione al menos un estudiante.');
  if (ids.length > 300) throw new ErrorHttp(400, 'Máximo 300 estudiantes por reporte.');
  const observacion = limpiar(req.body?.observacion).slice(0, 300) || null;
  const { fecha, hora, marca } = ahora();
  const periodo = periodoDeFecha(fecha);
  if (!periodo) {
    throw new ErrorHttp(400, `No hay un período académico configurado que incluya la fecha de hoy (${fecha}). Un administrador debe configurarlo en Configuración › Períodos.`);
  }

  const buscar = db.prepare('SELECT id, nombre, grado_id, curso_id, activo FROM estudiantes WHERE id = ?');
  const insertar = db.prepare(`
    INSERT INTO llegadas_tarde (estudiante_id, fecha, hora, periodo_id, grado_id, curso_id, registrado_por, observacion, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (estudiante_id, fecha) DO NOTHING`);
  const contar = db.prepare('SELECT COUNT(*) n FROM llegadas_tarde WHERE estudiante_id = ? AND periodo_id = ?');

  const registrados = [];
  const duplicados = [];
  const errores = [];
  db.transaction(() => {
    for (const id of ids) {
      const e = buscar.get(id);
      if (!e || !e.activo) { errores.push({ id, motivo: 'Estudiante no encontrado o retirado.' }); continue; }
      const info = insertar.run(e.id, fecha, hora.slice(0, 5), periodo.id, e.grado_id, e.curso_id, req.usuario.id, observacion, marca);
      if (info.changes === 0) duplicados.push({ id: e.id, nombre: e.nombre });
      else registrados.push({ id: e.id, nombre: e.nombre, acumulado_periodo: contar.get(e.id, periodo.id).n });
    }
  })();

  if (registrados.length) auditar(req, 'reportar_tardanza', { fecha, cantidad: registrados.length, ids: registrados.map((x) => x.id) });
  res.status(registrados.length ? 201 : 200).json({ fecha, hora: hora.slice(0, 5), periodo, registrados, duplicados, errores });
}));

/** Reportes del día actual. */
r.get('/hoy', ruta(async (req, res) => {
  const { fecha } = ahora();
  const filas = db.prepare(`
    SELECT lt.id, lt.hora, lt.observacion, e.id AS estudiante_id, e.nombre, g.nombre AS grado, c.nombre AS curso, u.nombre AS registrado_por
    FROM llegadas_tarde lt
    JOIN estudiantes e ON e.id = lt.estudiante_id
    JOIN grados g ON g.id = lt.grado_id
    JOIN cursos c ON c.id = lt.curso_id
    LEFT JOIN usuarios u ON u.id = lt.registrado_por
    WHERE lt.fecha = ? ORDER BY lt.hora DESC, e.nombre`).all(fecha);
  res.json({ fecha, reportes: filas });
}));

/** Anular un reporte (solo administrador; queda en auditoría). */
r.delete('/:id', requiereRol('admin'), ruta(async (req, res) => {
  const id = Number(req.params.id);
  const lt = db.prepare('SELECT lt.*, e.nombre FROM llegadas_tarde lt JOIN estudiantes e ON e.id = lt.estudiante_id WHERE lt.id = ?').get(id);
  if (!lt) throw new ErrorHttp(404, 'Reporte no encontrado.');
  db.prepare('DELETE FROM llegadas_tarde WHERE id = ?').run(id);
  auditar(req, 'anular_tardanza', { id, estudiante: lt.nombre, fecha: lt.fecha, motivo: limpiar(req.body?.motivo) || null });
  res.json({ ok: true });
}));

module.exports = r;
