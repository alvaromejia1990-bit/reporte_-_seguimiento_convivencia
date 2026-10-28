'use strict';

const express = require('express');
const { auditar } = require('../db');
const estad = require('../services/estadisticas');
const exportador = require('../services/exportador');
const { ahora, ruta } = require('../utils');

const r = express.Router();

const filtrosDe = (o = {}) => ({
  periodo_id: o.periodo_id || '', grado_id: o.grado_id || '', curso_id: o.curso_id || '',
  estudiante_id: o.estudiante_id || '', desde: o.desde || '', hasta: o.hasta || '',
});

r.get('/', ruta(async (req, res) => {
  res.json({ filtros: filtrosDe(req.query), descripcion: estad.describirFiltros(filtrosDe(req.query)), ...estad.calcular(filtrosDe(req.query)) });
}));

r.post('/exportar/:formato', ruta(async (req, res) => {
  const filtros = filtrosDe(req.body?.filtros);
  const graficos = req.body?.graficos || [];
  const sello = ahora().fecha;
  if (req.params.formato === 'pdf') {
    const buf = await exportador.informePdf(filtros, graficos, req.usuario);
    auditar(req, 'exportar_informe', { formato: 'pdf', filtros });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="informe_llegadas_tarde_${sello}.pdf"`);
    return res.send(buf);
  }
  if (req.params.formato === 'xlsx') {
    const buf = await exportador.informeXlsx(filtros, graficos, req.usuario);
    auditar(req, 'exportar_informe', { formato: 'xlsx', filtros });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="informe_llegadas_tarde_${sello}.xlsx"`);
    return res.send(buf);
  }
  res.status(400).json({ error: 'Formato no válido. Use pdf o xlsx.' });
}));

module.exports = r;
