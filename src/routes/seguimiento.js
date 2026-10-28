'use strict';

const express = require('express');
const { db, leerConfig } = require('../db');
const est = require('../services/estudiantes');
const seg = require('../services/seguimiento');
const { enmascararCorreo, normalizar, ruta } = require('../utils');

const r = express.Router();

/** Estudiantes que superan el umbral, con filtros por período, grado y curso. */
r.get('/', ruta(async (req, res) => {
  const config = leerConfig();
  const periodo = seg.resolverPeriodo(req.query.periodo_id);
  const filas = seg.listar({ periodo, grado_id: req.query.grado_id, curso_id: req.query.curso_id, umbral: config.umbral_seguimiento });
  const admin = req.usuario.rol === 'admin';
  res.json({
    periodo,
    umbral: config.umbral_seguimiento,
    estudiantes: filas.map((f) => ({ ...f, correo_acudiente: admin ? f.correo_acudiente : enmascararCorreo(f.correo_acudiente) })),
  });
}));

/** Historial de notificaciones. */
r.get('/notificaciones', ruta(async (req, res) => {
  const where = [];
  const p = {};
  const periodo = req.query.periodo_id && req.query.periodo_id !== 'todos' ? Number(req.query.periodo_id) : null;
  if (periodo) { where.push('n.periodo_id = @periodo'); p.periodo = periodo; }
  if (req.query.estado) { where.push('n.estado = @estado'); p.estado = req.query.estado; }
  if (req.query.q) { where.push('e.nombre_norm LIKE @q'); p.q = `%${normalizar(req.query.q)}%`; }
  const filas = db.prepare(`
    SELECT n.id, n.fecha_envio, n.destinatario, n.estado, n.detalle, n.cantidad_reportes, n.asunto,
           e.id AS estudiante_id, e.nombre, g.nombre AS grado, c.nombre AS curso, p.nombre AS periodo, u.nombre AS enviado_por
    FROM notificaciones n
    JOIN estudiantes e ON e.id = n.estudiante_id
    JOIN grados g ON g.id = e.grado_id
    JOIN cursos c ON c.id = e.curso_id
    LEFT JOIN periodos p ON p.id = n.periodo_id
    LEFT JOIN usuarios u ON u.id = n.enviado_por
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY n.id DESC LIMIT 500`).all(p);
  const admin = req.usuario.rol === 'admin';
  res.json({ notificaciones: filas.map((f) => ({ ...f, destinatario: admin ? f.destinatario : enmascararCorreo(f.destinatario) })) });
}));

/** Reporte individual (JSON). */
r.get('/estudiante/:id', ruta(async (req, res) => {
  const periodo = seg.resolverPeriodo(req.query.periodo_id);
  const d = seg.detalle(Number(req.params.id), periodo);
  const admin = req.usuario.rol === 'admin';
  res.json({
    ...d,
    estudiante: est.proteger(d.estudiante, req.usuario),
    notificaciones: d.notificaciones.map((n) => ({ ...n, destinatario: admin ? n.destinatario : enmascararCorreo(n.destinatario) })),
    umbral: leerConfig().umbral_seguimiento,
  });
}));

/** Reporte individual (PDF descargable). */
r.get('/estudiante/:id/reporte.pdf', ruta(async (req, res) => {
  const periodo = seg.resolverPeriodo(req.query.periodo_id);
  const d = seg.detalle(Number(req.params.id), periodo);
  const buf = await seg.pdfIndividual(d, req.usuario);
  const nombre = d.estudiante.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.ver ? 'inline' : 'attachment'}; filename="reporte_${nombre}.pdf"`);
  res.send(buf);
}));

/** Vista previa del correo que se enviará. */
r.get('/estudiante/:id/vista-correo', ruta(async (req, res) => {
  const periodo = seg.resolverPeriodo(req.query.periodo_id);
  const d = seg.detalle(Number(req.params.id), periodo);
  const { asunto, html } = seg.construirCorreo(d, leerConfig());
  const admin = req.usuario.rol === 'admin';
  res.json({ asunto, html: admin ? html : html.replaceAll(d.estudiante.correo_acudiente || '\u0000', enmascararCorreo(d.estudiante.correo_acudiente)).replaceAll(d.estudiante.telefono || '\u0000', '(reservado)'), destinatario: admin ? d.estudiante.correo_acudiente : enmascararCorreo(d.estudiante.correo_acudiente) });
}));

/** Notificar al acudiente por correo. */
r.post('/estudiante/:id/notificar', ruta(async (req, res) => {
  const periodo = seg.resolverPeriodo(req.body?.periodo_id);
  const resultado = await seg.notificar(Number(req.params.id), periodo, req, { forzar: Boolean(req.body?.forzar) });
  if (req.usuario.rol !== 'admin') resultado.destinatario = enmascararCorreo(resultado.destinatario);
  res.json(resultado);
}));

module.exports = r;
