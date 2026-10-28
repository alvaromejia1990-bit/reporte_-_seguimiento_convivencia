'use strict';

const ExcelJS = require('exceljs');
const { leerConfig } = require('../db');
const pdf = require('./pdf');
const estad = require('./estadisticas');
const { ahora, fechaCorta } = require('../utils');

const AZUL = 'FF16324F';
const DORADO = 'FFC8963E';

function graficosValidos(graficos) {
  return (Array.isArray(graficos) ? graficos : [])
    .filter((g) => g && typeof g.imagen === 'string' && /^data:image\/png;base64,/.test(g.imagen) && g.imagen.length < 4_000_000)
    .slice(0, 10);
}

/** Informe en PDF con indicadores, gráficos y tablas. */
async function informePdf(filtros, graficos, usuario) {
  const config = leerConfig();
  const datos = estad.calcular(filtros);
  const k = datos.kpis;
  const { doc, terminado } = pdf.nuevoDocumento('Informe de llegadas tarde');
  pdf.encabezado(doc, config, 'Informe estadístico de llegadas tarde', estad.describirFiltros(filtros));

  pdf.tituloSeccion(doc, 'Indicadores principales');
  pdf.indicadores(doc, [
    { valor: k.total_reportes, etiqueta: 'Total de reportes' },
    { valor: k.estudiantes_con_reporte, etiqueta: 'Estudiantes con reportes' },
    { valor: k.reincidentes, etiqueta: `Reincidentes (más de ${datos.umbral})`, color: k.reincidentes ? pdf.COLOR.peligro : undefined },
    { valor: `${k.porcentaje_con_reporte}%`, etiqueta: `De ${k.poblacion} estudiantes activos` },
    { valor: k.promedio_por_estudiante, etiqueta: 'Promedio por estudiante' },
    { valor: k.promedio_diario, etiqueta: 'Promedio por día con reportes' },
    { valor: k.dia_pico ? fechaCorta(k.dia_pico.fecha) : '—', etiqueta: k.dia_pico ? `Día pico (${k.dia_pico.cantidad} reportes)` : 'Día pico' },
    { valor: k.curso_critico ? k.curso_critico.nombre : '—', etiqueta: k.curso_critico ? `Curso con más reportes (${k.curso_critico.cantidad})` : 'Curso con más reportes' },
  ]);

  const imgs = graficosValidos(graficos);
  if (imgs.length) {
    pdf.tituloSeccion(doc, 'Gráficos');
    imgs.forEach((g) => pdf.imagen(doc, g.imagen, { titulo: g.titulo, alto: 210 }));
  }

  pdf.tituloSeccion(doc, 'Llegadas tarde por grado');
  pdf.tabla(doc, [
    { titulo: 'Grado', campo: 'nombre', ancho: 2 },
    { titulo: 'Reportes', campo: 'cantidad', ancho: 1, alinear: 'right' },
    { titulo: 'Estudiantes', campo: 'estudiantes', ancho: 1, alinear: 'right' },
    { titulo: 'Matrícula activa', campo: 'matricula', ancho: 1, alinear: 'right' },
    { titulo: 'Reportes por estudiante matriculado', campo: 'tasa', ancho: 1.6, alinear: 'right' },
  ], datos.porGrado);

  pdf.tituloSeccion(doc, 'Llegadas tarde por curso');
  pdf.tabla(doc, [
    { titulo: 'Grado', campo: 'grado', ancho: 1.4 }, { titulo: 'Curso', campo: 'nombre', ancho: 1 },
    { titulo: 'Reportes', campo: 'cantidad', ancho: 1, alinear: 'right' },
    { titulo: 'Estudiantes', campo: 'estudiantes', ancho: 1, alinear: 'right' },
    { titulo: 'Matrícula', campo: 'matricula', ancho: 1, alinear: 'right' },
    { titulo: 'Tasa', campo: 'tasa', ancho: 0.8, alinear: 'right' },
  ], datos.porCurso);

  pdf.tituloSeccion(doc, 'Comparativo por período académico');
  pdf.tabla(doc, [
    { titulo: 'Período', campo: 'nombre', ancho: 2 },
    { titulo: 'Reportes', campo: 'cantidad', ancho: 1, alinear: 'right' },
    { titulo: 'Estudiantes con reportes', campo: 'estudiantes', ancho: 1.4, alinear: 'right' },
    { titulo: 'Reincidentes', campo: 'reincidentes', ancho: 1, alinear: 'right' },
  ], datos.comparativoPeriodos);

  pdf.tituloSeccion(doc, `Estudiantes reincidentes (más de ${datos.umbral} llegadas tarde)`);
  pdf.tabla(doc, [
    { titulo: '#', campo: (_, i) => i + 1, ancho: 0.4, alinear: 'center' },
    { titulo: 'Estudiante', campo: 'nombre', ancho: 3 },
    { titulo: 'Grado', campo: 'grado', ancho: 1 }, { titulo: 'Curso', campo: 'curso', ancho: 0.8 },
    { titulo: 'Reportes', campo: 'cantidad', ancho: 0.9, alinear: 'right' },
    { titulo: 'Última', campo: (e) => fechaCorta(e.ultima), ancho: 1.1 },
  ], datos.reincidentes, { vacio: 'No hay estudiantes que superen el límite en este alcance.' });

  pdf.tituloSeccion(doc, 'Estudiantes con más llegadas tarde (top 25)');
  pdf.tabla(doc, [
    { titulo: '#', campo: (_, i) => i + 1, ancho: 0.4, alinear: 'center' },
    { titulo: 'Estudiante', campo: 'nombre', ancho: 3 },
    { titulo: 'Grado', campo: 'grado', ancho: 1 }, { titulo: 'Curso', campo: 'curso', ancho: 0.8 },
    { titulo: 'Reportes', campo: 'cantidad', ancho: 0.9, alinear: 'right' },
  ], datos.porEstudiante.slice(0, 25));

  pdf.finalizar(doc, usuario?.nombre);
  return terminado;
}

function estiloEncabezado(fila) {
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  fila.alignment = { vertical: 'middle', wrapText: true };
  fila.height = 22;
}

function hojaTabla(wb, nombre, columnas, filas) {
  const h = wb.addWorksheet(nombre);
  h.columns = columnas;
  filas.forEach((f) => h.addRow(f));
  estiloEncabezado(h.getRow(1));
  h.views = [{ state: 'frozen', ySplit: 1 }];
  if (filas.length) h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  h.eachRow((fila, n) => {
    if (n > 1 && n % 2 === 0) fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F9' } };
  });
  return h;
}

/** Informe en Excel con hoja de resumen (indicadores + gráficos) y hojas de datos. */
async function informeXlsx(filtros, graficos, usuario) {
  const config = leerConfig();
  const datos = estad.calcular(filtros);
  const k = datos.kpis;
  const wb = new ExcelJS.Workbook();
  wb.creator = usuario?.nombre || 'Plataforma';
  wb.created = new Date();

  const r = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  r.columns = [{ width: 4 }, { width: 38 }, { width: 18 }, { width: 4 }, ...Array(10).fill({ width: 12 })];
  r.mergeCells('B2:L2');
  r.getCell('B2').value = config.institucion_nombre;
  r.getCell('B2').font = { bold: true, size: 16, color: { argb: AZUL } };
  r.mergeCells('B3:L3');
  r.getCell('B3').value = 'Informe estadístico de llegadas tarde';
  r.getCell('B3').font = { bold: true, size: 13, color: { argb: DORADO } };
  r.mergeCells('B4:L4');
  r.getCell('B4').value = `${estad.describirFiltros(filtros)} · Generado: ${ahora().marca}${usuario ? ` · ${usuario.nombre}` : ''}`;
  r.getCell('B4').font = { italic: true, size: 9, color: { argb: 'FF5B6B7B' } };

  const filasKpi = [
    ['Total de reportes', k.total_reportes],
    ['Estudiantes con reportes', k.estudiantes_con_reporte],
    [`Estudiantes reincidentes (más de ${datos.umbral})`, k.reincidentes],
    ['Estudiantes activos en el alcance', k.poblacion],
    ['% de estudiantes con reportes', k.porcentaje_con_reporte / 100],
    ['Promedio de reportes por estudiante', k.promedio_por_estudiante],
    ['Días con reportes', k.dias_con_reporte],
    ['Promedio de reportes por día', k.promedio_diario],
    ['Día pico', k.dia_pico ? `${fechaCorta(k.dia_pico.fecha)} (${k.dia_pico.cantidad})` : '—'],
    ['Curso con más reportes', k.curso_critico ? `${k.curso_critico.nombre} (${k.curso_critico.cantidad})` : '—'],
  ];
  const enc = r.getRow(6);
  enc.getCell(2).value = 'Indicador';
  enc.getCell(3).value = 'Valor';
  [2, 3].forEach((c) => {
    enc.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    enc.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  });
  filasKpi.forEach(([et, v], i) => {
    const f = r.getRow(7 + i);
    f.getCell(2).value = et;
    f.getCell(3).value = v;
    f.getCell(3).alignment = { horizontal: 'right' };
    if (i === 4) f.getCell(3).numFmt = '0.0%';
    [2, 3].forEach((c) => { f.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFD9E0E7' } } }; });
  });

  // Gráficos como imágenes, en una cuadrícula de dos columnas.
  const imgs = graficosValidos(graficos);
  let fila = 19;
  imgs.forEach((g, i) => {
    const col = i % 2 === 0 ? 1 : 7;
    if (i % 2 === 0 && i > 0) fila += 22;
    r.getCell(fila, col + 1).value = g.titulo || '';
    r.getCell(fila, col + 1).font = { bold: true, color: { argb: AZUL } };
    const id = wb.addImage({ base64: g.imagen, extension: 'png' });
    r.addImage(id, { tl: { col, row: fila }, ext: { width: 520, height: 280 } });
  });

  hojaTabla(wb, 'Por grado', [
    { header: 'Grado', key: 'nombre', width: 18 }, { header: 'Reportes', key: 'cantidad', width: 12 },
    { header: 'Estudiantes con reportes', key: 'estudiantes', width: 16 }, { header: 'Matrícula activa', key: 'matricula', width: 14 },
    { header: 'Reportes por estudiante matriculado', key: 'tasa', width: 18 },
  ], datos.porGrado);
  hojaTabla(wb, 'Por curso', [
    { header: 'Grado', key: 'grado', width: 16 }, { header: 'Curso', key: 'nombre', width: 12 },
    { header: 'Reportes', key: 'cantidad', width: 12 }, { header: 'Estudiantes con reportes', key: 'estudiantes', width: 16 },
    { header: 'Matrícula activa', key: 'matricula', width: 14 }, { header: 'Tasa', key: 'tasa', width: 10 },
  ], datos.porCurso);
  hojaTabla(wb, 'Por estudiante', [
    { header: 'Estudiante', key: 'nombre', width: 36 }, { header: 'Grado', key: 'grado', width: 14 },
    { header: 'Curso', key: 'curso', width: 10 }, { header: 'Reportes', key: 'cantidad', width: 11 },
    { header: 'Primera', key: 'primera', width: 12 }, { header: 'Última', key: 'ultima', width: 12 },
    { header: 'Reincidente', key: 'reincidente', width: 12 },
  ], datos.porEstudiante.map((e) => ({ ...e, reincidente: e.cantidad > datos.umbral ? 'Sí' : 'No' })));
  hojaTabla(wb, 'Tendencia diaria', [
    { header: 'Fecha', key: 'fecha', width: 14 }, { header: 'Reportes', key: 'cantidad', width: 12 },
  ], datos.tendencia.diaria);
  hojaTabla(wb, 'Tendencia mensual', [
    { header: 'Mes', key: 'etiqueta', width: 20 }, { header: 'Reportes', key: 'cantidad', width: 12 },
  ], datos.tendencia.mensual);
  hojaTabla(wb, 'Comparativo períodos', [
    { header: 'Período', key: 'nombre', width: 22 }, { header: 'Reportes', key: 'cantidad', width: 12 },
    { header: 'Estudiantes con reportes', key: 'estudiantes', width: 16 }, { header: 'Reincidentes', key: 'reincidentes', width: 14 },
  ], datos.comparativoPeriodos);
  hojaTabla(wb, 'Detalle de reportes', [
    { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Documento', key: 'documento', width: 14 }, { header: 'Estudiante', key: 'nombre', width: 34 },
    { header: 'Grado', key: 'grado', width: 12 }, { header: 'Curso', key: 'curso', width: 9 },
    { header: 'Período', key: 'periodo', width: 16 }, { header: 'Registrado por', key: 'registrado_por', width: 22 },
    { header: 'Observación', key: 'observacion', width: 30 },
  ], estad.detalleReportes(filtros).map((d) => (usuario?.rol === 'admin' ? d : { ...d, documento: d.documento ? `****${d.documento.slice(-3)}` : null })));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { informePdf, informeXlsx };
