'use strict';

const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { db, auditar, periodoDeFecha } = require('../db');
const { requiereRol } = require('../middleware/auth');
const est = require('../services/estudiantes');
const importador = require('../services/importador');
const { normalizar, ahora, ErrorHttp, ruta } = require('../utils');

const r = express.Router();
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

/** Listado con búsqueda, filtros y paginación. */
r.get('/', ruta(async (req, res) => {
  const { q, grado_id, curso_id } = req.query;
  const estado = req.query.estado || 'activos';
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 25));
  const where = [];
  const p = {};
  if (estado === 'activos') where.push('e.activo = 1');
  else if (estado === 'retirados') where.push('e.activo = 0');
  if (grado_id) { where.push('e.grado_id = @grado_id'); p.grado_id = Number(grado_id); }
  if (curso_id) { where.push('e.curso_id = @curso_id'); p.curso_id = Number(curso_id); }
  if (q) {
    where.push("(e.nombre_norm LIKE @q OR IFNULL(e.documento,'') LIKE @qd OR lower(IFNULL(e.acudiente,'')) LIKE @q)");
    p.q = `%${normalizar(q)}%`;
    p.qd = `%${String(q).trim()}%`;
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const periodo = periodoDeFecha(ahora().fecha);
  p.periodo_id = periodo?.id ?? -1;

  const total = db.prepare(`SELECT COUNT(*) n FROM estudiantes e ${w}`).get(p).n;
  const filas = db.prepare(`
    ${est.SELECT_ESTUDIANTE.replace('SELECT e.*,', `SELECT e.*,
      (SELECT COUNT(*) FROM llegadas_tarde lt WHERE lt.estudiante_id = e.id) AS tardanzas_total,
      (SELECT COUNT(*) FROM llegadas_tarde lt WHERE lt.estudiante_id = e.id AND lt.periodo_id = @periodo_id) AS tardanzas_periodo,`)}
    ${w}
    ORDER BY g.orden, c.nombre, e.nombre
    LIMIT @limite OFFSET @offset
  `).all({ ...p, limite, offset: (pagina - 1) * limite });

  res.json({
    total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)),
    estudiantes: filas.map((e) => est.proteger(e, req.usuario)),
  });
}));

r.get('/plantilla.xlsx', ruta(async (req, res) => {
  const buf = await importador.plantilla();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_estudiantes.xlsx"');
  res.send(Buffer.from(buf));
}));

/** Exporta la base de estudiantes (solo administrador). */
r.get('/exportar.xlsx', requiereRol('admin'), ruta(async (req, res) => {
  const filas = db.prepare(`${est.SELECT_ESTUDIANTE.replace('SELECT e.*,', 'SELECT e.*, (SELECT COUNT(*) FROM llegadas_tarde lt WHERE lt.estudiante_id = e.id) AS tardanzas_total,')} ORDER BY g.orden, c.nombre, e.nombre`).all();
  const wb = new ExcelJS.Workbook();
  const h = wb.addWorksheet('Estudiantes');
  h.columns = [
    { header: 'Documento', key: 'documento', width: 16 }, { header: 'Nombre completo', key: 'nombre', width: 34 },
    { header: 'Edad', key: 'edad', width: 8 }, { header: 'Grado', key: 'grado', width: 12 }, { header: 'Curso', key: 'curso', width: 10 },
    { header: 'Acudiente', key: 'acudiente', width: 30 }, { header: 'Correo acudiente', key: 'correo_acudiente', width: 32 },
    { header: 'Teléfono', key: 'telefono', width: 16 }, { header: 'Dirección', key: 'direccion', width: 36 },
    { header: 'Estado', key: 'estado', width: 11 }, { header: 'Llegadas tarde (total)', key: 'tardanzas_total', width: 14 },
  ];
  filas.forEach((f) => h.addRow({ ...f, estado: f.activo ? 'Activo' : 'Retirado' }));
  h.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16324F' } };
  h.views = [{ state: 'frozen', ySplit: 1 }];
  h.autoFilter = { from: 'A1', to: 'K1' };
  auditar(req, 'exportar_estudiantes', { cantidad: filas.length });
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="estudiantes_${ahora().fecha}.xlsx"`);
  res.send(Buffer.from(buf));
}));

/** Carga masiva: modo=previsualizar (por defecto) o aplicar. */
r.post('/importar', requiereRol('admin'), subida.single('archivo'), ruta(async (req, res) => {
  if (!req.file) throw new ErrorHttp(400, 'Adjunte un archivo .xlsx o .csv.');
  const filas = await importador.leerArchivo(req.file.buffer, req.file.originalname);
  const resultado = importador.procesar(filas, {
    aplicar: req.body.modo === 'aplicar',
    crearFaltantes: req.body.crear_faltantes === 'true',
    req,
  });
  res.json(resultado);
}));

r.get('/:id', ruta(async (req, res) => {
  const e = est.obtener(Number(req.params.id));
  if (!e) throw new ErrorHttp(404, 'Estudiante no encontrado.');
  const tardanzas = db.prepare(`
    SELECT lt.id, lt.fecha, lt.hora, lt.observacion, p.nombre AS periodo, u.nombre AS registrado_por
    FROM llegadas_tarde lt
    JOIN periodos p ON p.id = lt.periodo_id
    LEFT JOIN usuarios u ON u.id = lt.registrado_por
    WHERE lt.estudiante_id = ? ORDER BY lt.fecha DESC`).all(e.id);
  res.json({ estudiante: est.proteger(e, req.usuario), tardanzas });
}));

r.post('/', requiereRol('admin'), ruta(async (req, res) => {
  const { datos, errores, advertencias } = est.validar(req.body || {});
  if (errores.length) throw new ErrorHttp(400, errores.join(' '), { errores });
  const ex = est.buscarExistente(datos);
  if (ex) {
    const msg = ex.ambiguo
      ? 'Ya existen varios estudiantes con este nombre. Registre el documento de identidad.'
      : `Ya existe un estudiante con ${ex.motivo === 'documento' ? 'este documento' : 'este nombre'}: ${ex.estudiante.nombre}. Edite el registro existente.`;
    throw new ErrorHttp(409, msg, { existente_id: ex.estudiante?.id });
  }
  const id = Number(est.crear(datos));
  auditar(req, 'crear_estudiante', { id, nombre: datos.nombre });
  res.status(201).json({ estudiante: est.obtener(id), advertencias });
}));

r.put('/:id', requiereRol('admin'), ruta(async (req, res) => {
  const id = Number(req.params.id);
  if (!est.obtener(id)) throw new ErrorHttp(404, 'Estudiante no encontrado.');
  const { datos, errores, advertencias } = est.validar(req.body || {});
  if (errores.length) throw new ErrorHttp(400, errores.join(' '), { errores });
  const ex = est.buscarExistente(datos, id);
  if (ex && (ex.ambiguo || ex.motivo === 'documento' || !datos.documento)) {
    throw new ErrorHttp(409, `Los datos coinciden con otro estudiante registrado${ex.estudiante ? `: ${ex.estudiante.nombre}` : ''}.`);
  }
  est.actualizar(id, datos);
  auditar(req, 'editar_estudiante', { id, nombre: datos.nombre });
  res.json({ estudiante: est.obtener(id), advertencias });
}));

/** Retirar / reactivar sin perder el historial. */
r.patch('/:id/estado', requiereRol('admin'), ruta(async (req, res) => {
  const id = Number(req.params.id);
  const e = est.obtener(id);
  if (!e) throw new ErrorHttp(404, 'Estudiante no encontrado.');
  const activo = req.body?.activo ? 1 : 0;
  db.prepare('UPDATE estudiantes SET activo = ? WHERE id = ?').run(activo, id);
  auditar(req, activo ? 'reactivar_estudiante' : 'retirar_estudiante', { id, nombre: e.nombre });
  res.json({ ok: true });
}));

/** Eliminación definitiva (incluye historial). Uso: solicitudes de supresión de datos. */
r.delete('/:id', requiereRol('admin'), ruta(async (req, res) => {
  const id = Number(req.params.id);
  const e = est.obtener(id);
  if (!e) throw new ErrorHttp(404, 'Estudiante no encontrado.');
  db.prepare('DELETE FROM estudiantes WHERE id = ?').run(id);
  auditar(req, 'eliminar_estudiante', { id, nombre: e.nombre });
  res.json({ ok: true });
}));

module.exports = r;
