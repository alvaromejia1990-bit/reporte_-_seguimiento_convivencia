'use strict';

const { db, leerConfig } = require('../db');
const { fechaValida, inicioSemana, diaSemana, DIAS, MESES } = require('../utils');

/** Construye el WHERE de los informes a partir de los filtros. */
function construirFiltro(f, { omitirPeriodo = false } = {}) {
  const w = [];
  const p = {};
  if (f.periodo_id && f.periodo_id !== 'todos' && !omitirPeriodo) { w.push('lt.periodo_id = @periodo_id'); p.periodo_id = Number(f.periodo_id); }
  if (f.grado_id) { w.push('lt.grado_id = @grado_id'); p.grado_id = Number(f.grado_id); }
  if (f.curso_id) { w.push('lt.curso_id = @curso_id'); p.curso_id = Number(f.curso_id); }
  if (f.estudiante_id) { w.push('lt.estudiante_id = @estudiante_id'); p.estudiante_id = Number(f.estudiante_id); }
  if (!omitirPeriodo && fechaValida(f.desde)) { w.push('lt.fecha >= @desde'); p.desde = f.desde; }
  if (!omitirPeriodo && fechaValida(f.hasta)) { w.push('lt.fecha <= @hasta'); p.hasta = f.hasta; }
  return { where: w.length ? `WHERE ${w.join(' AND ')}` : '', params: p };
}

const BASE = `FROM llegadas_tarde lt
  JOIN estudiantes e ON e.id = lt.estudiante_id
  JOIN grados g ON g.id = lt.grado_id
  JOIN cursos c ON c.id = lt.curso_id
  JOIN periodos pe ON pe.id = lt.periodo_id`;

function calcular(filtros = {}) {
  const config = leerConfig();
  const umbral = config.umbral_seguimiento;
  const { where, params } = construirFiltro(filtros);

  const total = db.prepare(`SELECT COUNT(*) n ${BASE} ${where}`).get(params).n;

  const porEstudiante = db.prepare(`
    SELECT e.id, e.nombre, g.nombre AS grado, c.nombre AS curso, COUNT(*) AS cantidad, MIN(lt.fecha) AS primera, MAX(lt.fecha) AS ultima
    ${BASE} ${where} GROUP BY e.id ORDER BY cantidad DESC, e.nombre`).all(params);

  const porGrado = db.prepare(`
    SELECT g.id, g.nombre, g.orden, COUNT(*) AS cantidad, COUNT(DISTINCT lt.estudiante_id) AS estudiantes
    ${BASE} ${where} GROUP BY g.id ORDER BY g.orden, g.nombre`).all(params);

  const porCurso = db.prepare(`
    SELECT c.id, c.nombre, g.nombre AS grado, COUNT(*) AS cantidad, COUNT(DISTINCT lt.estudiante_id) AS estudiantes
    ${BASE} ${where} GROUP BY c.id ORDER BY g.orden, c.nombre`).all(params);

  const porFecha = db.prepare(`SELECT lt.fecha, COUNT(*) AS cantidad ${BASE} ${where} GROUP BY lt.fecha ORDER BY lt.fecha`).all(params);
  const porHoraRaw = db.prepare(`SELECT lt.hora, COUNT(*) AS cantidad ${BASE} ${where} GROUP BY lt.hora`).all(params);

  // Población de referencia (estudiantes activos en el alcance del filtro)
  const wPob = ['activo = 1'];
  const pPob = {};
  if (filtros.grado_id) { wPob.push('grado_id = @grado_id'); pPob.grado_id = Number(filtros.grado_id); }
  if (filtros.curso_id) { wPob.push('curso_id = @curso_id'); pPob.curso_id = Number(filtros.curso_id); }
  if (filtros.estudiante_id) { wPob.push('id = @id'); pPob.id = Number(filtros.estudiante_id); }
  const poblacion = db.prepare(`SELECT COUNT(*) n FROM estudiantes WHERE ${wPob.join(' AND ')}`).get(pPob).n;
  const matriculaGrado = new Map(db.prepare('SELECT grado_id, COUNT(*) n FROM estudiantes WHERE activo = 1 GROUP BY grado_id').all().map((x) => [x.grado_id, x.n]));
  const matriculaCurso = new Map(db.prepare('SELECT curso_id, COUNT(*) n FROM estudiantes WHERE activo = 1 GROUP BY curso_id').all().map((x) => [x.curso_id, x.n]));
  porGrado.forEach((g) => { g.matricula = matriculaGrado.get(g.id) || 0; g.tasa = g.matricula ? +(g.cantidad / g.matricula).toFixed(2) : null; });
  porCurso.forEach((c) => { c.matricula = matriculaCurso.get(c.id) || 0; c.tasa = c.matricula ? +(c.cantidad / c.matricula).toFixed(2) : null; });

  // Tendencias
  const semanal = new Map();
  const mensual = new Map();
  const dias = new Map();
  for (const f of porFecha) {
    const s = inicioSemana(f.fecha);
    semanal.set(s, (semanal.get(s) || 0) + f.cantidad);
    const m = f.fecha.slice(0, 7);
    mensual.set(m, (mensual.get(m) || 0) + f.cantidad);
    const d = diaSemana(f.fecha);
    dias.set(d, (dias.get(d) || 0) + f.cantidad);
  }
  const diasOrden = [1, 2, 3, 4, 5, 6, 0].filter((d) => d <= 5 && d >= 1 || dias.get(d));
  const porDiaSemana = diasOrden.map((d) => ({ dia: DIAS[d], cantidad: dias.get(d) || 0 }));

  // Distribución por franja de 15 minutos
  const franjas = new Map();
  for (const h of porHoraRaw) {
    const [hh, mm] = String(h.hora).split(':').map(Number);
    const ini = hh * 60 + Math.floor(mm / 15) * 15;
    franjas.set(ini, (franjas.get(ini) || 0) + h.cantidad);
  }
  const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const porFranja = [...franjas.entries()].sort((a, b) => a[0] - b[0]).map(([ini, n]) => ({ franja: `${fmt(ini)}–${fmt(ini + 14)}`, cantidad: n }));

  // Comparativo por período (respeta grado/curso/estudiante, no el período ni las fechas)
  const fc = construirFiltro(filtros, { omitirPeriodo: true });
  const periodos = db.prepare('SELECT * FROM periodos ORDER BY fecha_inicio').all();
  const conteoPeriodo = new Map(db.prepare(`SELECT lt.periodo_id, COUNT(*) n, COUNT(DISTINCT lt.estudiante_id) est ${BASE} ${fc.where} GROUP BY lt.periodo_id`).all(fc.params).map((x) => [x.periodo_id, x]));
  const reincPeriodo = new Map(db.prepare(`SELECT periodo_id, COUNT(*) n FROM (SELECT lt.periodo_id, lt.estudiante_id, COUNT(*) c ${BASE} ${fc.where} GROUP BY lt.periodo_id, lt.estudiante_id HAVING c > ${Number(umbral)}) GROUP BY periodo_id`).all(fc.params).map((x) => [x.periodo_id, x.n]));
  const comparativoPeriodos = periodos.map((p) => ({
    id: p.id, nombre: p.nombre, cantidad: conteoPeriodo.get(p.id)?.n || 0,
    estudiantes: conteoPeriodo.get(p.id)?.est || 0, reincidentes: reincPeriodo.get(p.id) || 0,
  }));
  const matriz = db.prepare(`SELECT lt.periodo_id, g.id AS grado_id, g.nombre AS grado, g.orden, COUNT(*) n ${BASE} ${fc.where} GROUP BY lt.periodo_id, g.id ORDER BY g.orden`).all(fc.params);
  const gradosMatriz = [...new Map(matriz.map((m) => [m.grado_id, { id: m.grado_id, nombre: m.grado, orden: m.orden }])).values()].sort((a, b) => a.orden - b.orden);
  const comparativoGradoPeriodo = {
    periodos: periodos.map((p) => p.nombre),
    series: gradosMatriz.map((g) => ({
      grado: g.nombre,
      valores: periodos.map((p) => matriz.find((m) => m.periodo_id === p.id && m.grado_id === g.id)?.n || 0),
    })),
  };

  const conReporte = porEstudiante.length;
  const reincidentes = porEstudiante.filter((e) => e.cantidad > umbral);
  const diaPico = porFecha.reduce((m, f) => (f.cantidad > (m?.cantidad || 0) ? f : m), null);
  const cursoCritico = porCurso.reduce((m, c) => (c.cantidad > (m?.cantidad || 0) ? c : m), null);

  return {
    umbral,
    kpis: {
      total_reportes: total,
      estudiantes_con_reporte: conReporte,
      reincidentes: reincidentes.length,
      poblacion,
      porcentaje_con_reporte: poblacion ? +((conReporte / poblacion) * 100).toFixed(1) : 0,
      promedio_por_estudiante: conReporte ? +(total / conReporte).toFixed(2) : 0,
      dias_con_reporte: porFecha.length,
      promedio_diario: porFecha.length ? +(total / porFecha.length).toFixed(1) : 0,
      dia_pico: diaPico,
      curso_critico: cursoCritico ? { nombre: cursoCritico.nombre, grado: cursoCritico.grado, cantidad: cursoCritico.cantidad } : null,
    },
    porGrado,
    porCurso,
    porEstudiante,
    reincidentes,
    tendencia: {
      diaria: porFecha,
      semanal: [...semanal.entries()].sort().map(([s, n]) => ({ semana: s, cantidad: n })),
      mensual: [...mensual.entries()].sort().map(([m, n]) => ({ mes: m, etiqueta: `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`, cantidad: n })),
    },
    porDiaSemana,
    porFranja,
    comparativoPeriodos,
    comparativoGradoPeriodo,
  };
}

/** Listado plano de reportes para exportar. */
function detalleReportes(filtros = {}) {
  const { where, params } = construirFiltro(filtros);
  return db.prepare(`
    SELECT lt.fecha, lt.hora, e.documento, e.nombre, g.nombre AS grado, c.nombre AS curso, pe.nombre AS periodo,
           lt.observacion, u.nombre AS registrado_por
    ${BASE} LEFT JOIN usuarios u ON u.id = lt.registrado_por
    ${where} ORDER BY lt.fecha, lt.hora, e.nombre`).all(params);
}

/** Descripción legible de los filtros aplicados. */
function describirFiltros(f) {
  const partes = [];
  const periodo = f.periodo_id && f.periodo_id !== 'todos' ? db.prepare('SELECT nombre FROM periodos WHERE id = ?').get(Number(f.periodo_id)) : null;
  partes.push(`Período: ${periodo ? periodo.nombre : 'Todos'}`);
  if (f.grado_id) partes.push(`Grado: ${db.prepare('SELECT nombre FROM grados WHERE id = ?').get(Number(f.grado_id))?.nombre || '—'}`);
  if (f.curso_id) partes.push(`Curso: ${db.prepare('SELECT nombre FROM cursos WHERE id = ?').get(Number(f.curso_id))?.nombre || '—'}`);
  if (f.estudiante_id) partes.push(`Estudiante: ${db.prepare('SELECT nombre FROM estudiantes WHERE id = ?').get(Number(f.estudiante_id))?.nombre || '—'}`);
  if (fechaValida(f.desde)) partes.push(`Desde: ${f.desde}`);
  if (fechaValida(f.hasta)) partes.push(`Hasta: ${f.hasta}`);
  if (partes.length === 1) partes.push('Consolidado institucional');
  return partes.join(' · ');
}

module.exports = { calcular, detalleReportes, describirFiltros };
