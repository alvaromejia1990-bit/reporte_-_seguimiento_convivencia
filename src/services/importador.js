'use strict';

const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const { db, auditar } = require('../db');
const est = require('./estudiantes');
const { normalizar, limpiar, ErrorHttp } = require('../utils');

const ALIAS = {
  documento: ['documento', 'documento de identidad', 'identificacion', 'numero de documento', 'no documento', 'n documento',
    'tarjeta de identidad', 'ti', 'nuip', 'doc', 'cedula', 'id estudiante'],
  nombre: ['nombre', 'nombre completo', 'nombres y apellidos', 'apellidos y nombres', 'estudiante', 'nombre del estudiante',
    'nombre estudiante', 'alumno', 'nombre completo del estudiante'],
  edad: ['edad', 'edad anos', 'anos'],
  grado: ['grado', 'nivel'],
  curso: ['curso', 'grupo', 'salon', 'seccion'],
  acudiente: ['acudiente', 'nombre acudiente', 'nombre del acudiente', 'padre de familia', 'responsable', 'nombre del responsable'],
  correo_acudiente: ['correo', 'correo acudiente', 'correo del acudiente', 'correo electronico', 'correo electronico del acudiente',
    'correo electronico acudiente', 'email', 'e-mail', 'email acudiente', 'mail'],
  telefono: ['telefono', 'celular', 'telefono acudiente', 'telefono del acudiente', 'movil', 'contacto', 'telefono de contacto'],
  direccion: ['direccion', 'direccion de residencia', 'residencia', 'domicilio'],
};
const MAPA_ALIAS = new Map();
for (const [campo, lista] of Object.entries(ALIAS)) for (const a of lista) MAPA_ALIAS.set(a, campo);

const normEncabezado = (h) => normalizar(h).replace(/[.:#°º()_*]/g, ' ').replace(/\s+/g, ' ').trim();

const ORDINALES = {
  preescolar: '0', transicion: '0', jardin: '-1', prejardin: '-2',
  primero: '1', segundo: '2', tercero: '3', cuarto: '4', quinto: '5', sexto: '6', septimo: '7',
  octavo: '8', noveno: '9', decimo: '10', undecimo: '11', once: '11', onceavo: '11', doce: '12', duodecimo: '12',
};
/** Clave comparable para nombres de grado: "6°", "Sexto", "grado 6" -> "6" */
function claveGrado(s) {
  let k = normalizar(s).replace(/[°º.]/g, '').replace(/^grado\s+/, '').trim();
  const m = k.match(/^(\d{1,2})\s*(o)?$/);
  if (m) return String(Number(m[1]));
  return ORDINALES[k] ?? k;
}

/** Texto de una celda de ExcelJS (fórmulas, hipervínculos, texto enriquecido, fechas). */
function textoCelda(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return textoCelda(v.result);
    if ('text' in v) return textoCelda(v.text);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('hyperlink' in v) return String(v.hyperlink).replace(/^mailto:/, '');
    return '';
  }
  return String(v);
}

function decodificar(buffer) {
  let txt = buffer.toString('utf8');
  if (txt.includes('�')) txt = buffer.toString('latin1'); // archivos guardados por Excel en ANSI
  return txt.replace(/^﻿/, '');
}

/** Lee XLSX o CSV y devuelve filas con campos canónicos. */
async function leerArchivo(buffer, nombreArchivo) {
  const ext = String(nombreArchivo || '').toLowerCase().split('.').pop();
  let matriz = [];
  if (ext === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw new ErrorHttp(400, 'No se pudo leer el archivo Excel. Verifique que sea un .xlsx válido.');
    }
    const hoja = wb.worksheets.find((h) => h.rowCount > 0);
    if (!hoja) throw new ErrorHttp(400, 'El archivo no contiene datos.');
    hoja.eachRow({ includeEmpty: true }, (fila, n) => {
      const valores = [];
      for (let c = 1; c <= hoja.columnCount; c++) valores.push(limpiar(textoCelda(fila.getCell(c).value)));
      matriz[n - 1] = valores;
    });
    matriz = Array.from(matriz, (f) => f || []);
  } else if (ext === 'csv' || ext === 'txt') {
    const txt = decodificar(buffer);
    const primera = txt.split(/\r?\n/)[0] || '';
    const delimitador = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
    try {
      matriz = parse(txt, { delimiter: delimitador, relax_column_count: true, skip_empty_lines: false, trim: true });
    } catch (e) {
      throw new ErrorHttp(400, `El archivo CSV tiene un formato no válido: ${e.message}`);
    }
  } else {
    throw new ErrorHttp(400, 'Formato no admitido. Use archivos .xlsx o .csv.');
  }

  // Encabezado: primera fila que contenga una columna reconocida como "nombre".
  let filaEnc = -1;
  let columnas = [];
  for (let i = 0; i < Math.min(matriz.length, 10); i++) {
    const cols = (matriz[i] || []).map((h) => MAPA_ALIAS.get(normEncabezado(h)) || null);
    if (cols.includes('nombre')) { filaEnc = i; columnas = cols; break; }
  }
  if (filaEnc < 0) {
    throw new ErrorHttp(400, 'No se encontró la fila de encabezados. Debe existir al menos la columna "Nombre". Descargue la plantilla para ver el formato.');
  }
  const faltantes = ['nombre', 'grado', 'curso'].filter((c) => !columnas.includes(c));
  if (faltantes.length) throw new ErrorHttp(400, `Faltan columnas obligatorias: ${faltantes.join(', ')}.`);

  const filas = [];
  for (let i = filaEnc + 1; i < matriz.length; i++) {
    const valores = matriz[i] || [];
    if (valores.every((v) => !limpiar(v))) continue;
    const obj = { _fila: i + 1 };
    columnas.forEach((campo, idx) => { if (campo && !obj[campo]) obj[campo] = limpiar(valores[idx]); });
    filas.push(obj);
  }
  if (!filas.length) throw new ErrorHttp(400, 'El archivo no tiene filas de estudiantes.');
  if (filas.length > 5000) throw new ErrorHttp(400, 'Máximo 5.000 estudiantes por archivo.');
  return filas;
}

const CAMPOS_COMPARAR = ['documento', 'nombre', 'edad', 'grado_id', 'curso_id', 'acudiente', 'correo_acudiente', 'telefono', 'direccion'];

/**
 * Valida (y si aplicar=true, guarda) las filas. Devuelve un resumen por fila.
 */
function procesar(filas, { aplicar = false, crearFaltantes = false, req } = {}) {
  const grados = db.prepare('SELECT * FROM grados').all();
  const mapaGrados = new Map(grados.map((g) => [claveGrado(g.nombre), g]));
  const cursos = db.prepare('SELECT * FROM cursos').all();
  const mapaCursos = new Map(cursos.map((c) => [`${c.grado_id}|${normalizar(c.nombre)}`, c]));
  let ordenMax = grados.reduce((m, g) => Math.max(m, g.orden), 0);
  let idVirtual = -1;

  const nuevosGrados = new Set();
  const nuevosCursos = new Set();
  const vistos = new Map();
  const resultado = [];

  const insGrado = db.prepare('INSERT INTO grados (nombre, orden) VALUES (?, ?)');
  const insCurso = db.prepare('INSERT INTO cursos (grado_id, nombre) VALUES (?, ?)');

  const ejecutar = () => {
    for (const f of filas) {
      const r = { fila: f._fila, nombre: f.nombre || '', grado: f.grado || '', curso: f.curso || '', errores: [], advertencias: [] };
      const { datos, errores, advertencias } = est.validar(f, { omitirUbicacion: true });
      r.nombre = datos.nombre || r.nombre;
      r.errores.push(...errores);
      r.advertencias.push(...advertencias);

      // Grado y curso
      if (!limpiar(f.grado)) r.errores.push('Falta el grado.');
      if (!limpiar(f.curso)) r.errores.push('Falta el curso.');
      if (limpiar(f.grado) && limpiar(f.curso)) {
        let g = mapaGrados.get(claveGrado(f.grado));
        if (!g) {
          if (!crearFaltantes) r.errores.push(`El grado "${f.grado}" no está configurado.`);
          else {
            const nombreG = limpiar(f.grado);
            g = aplicar ? { id: insGrado.run(nombreG, ++ordenMax).lastInsertRowid, nombre: nombreG } : { id: idVirtual--, nombre: nombreG };
            mapaGrados.set(claveGrado(nombreG), g);
            nuevosGrados.add(nombreG);
          }
        }
        if (g) {
          const kc = `${g.id}|${normalizar(f.curso)}`;
          let c = mapaCursos.get(kc);
          if (!c) {
            if (!crearFaltantes) r.errores.push(`El curso "${f.curso}" no existe en el grado ${g.nombre}.`);
            else {
              const nombreC = limpiar(f.curso).toUpperCase();
              c = aplicar ? { id: insCurso.run(g.id, nombreC).lastInsertRowid, grado_id: g.id, nombre: nombreC } : { id: idVirtual--, grado_id: g.id, nombre: nombreC };
              mapaCursos.set(kc, c);
              nuevosCursos.add(`${g.nombre} - ${nombreC}`);
            }
          }
          if (c) { datos.grado_id = g.id; datos.curso_id = c.id; }
        }
      }

      // Duplicados dentro del mismo archivo
      if (datos.nombre_norm) {
        const clave = datos.documento ? `d:${datos.documento}` : `n:${datos.nombre_norm}`;
        const claveN = `n:${datos.nombre_norm}`;
        const previa = vistos.get(clave) || (!datos.documento && vistos.get(claveN));
        if (previa) r.errores.push(`Registro repetido en el archivo (igual a la fila ${previa}).`);
        vistos.set(clave, f._fila);
        if (!vistos.has(claveN)) vistos.set(claveN, f._fila);
      }

      if (r.errores.length) { r.accion = 'error'; resultado.push(r); continue; }

      const ex = est.buscarExistente(datos);
      if (ex?.ambiguo) {
        r.errores.push('Hay varios estudiantes con este nombre; agregue el documento de identidad para identificarlo.');
        r.accion = 'error';
      } else if (ex) {
        const actual = ex.estudiante;
        const cambios = CAMPOS_COMPARAR.filter((c) => datos[c] !== null && datos[c] !== undefined && datos[c] !== '' && String(datos[c]) !== String(actual[c] ?? ''));
        r.estudiante_id = actual.id;
        if (!cambios.length) r.accion = 'sin_cambios';
        else {
          r.accion = 'actualizar';
          r.cambios = cambios.map((c) => c.replace('_id', '').replace('_', ' '));
          if (aplicar) est.actualizar(actual.id, datos, true);
        }
        if (!actual.activo) r.advertencias.push('El estudiante estaba retirado; se mantiene su estado.');
      } else {
        r.accion = 'crear';
        if (aplicar) r.estudiante_id = Number(est.crear(datos));
      }
      resultado.push(r);
    }
  };

  if (aplicar) db.transaction(ejecutar)();
  else ejecutar();

  const resumen = {
    total: resultado.length,
    crear: resultado.filter((r) => r.accion === 'crear').length,
    actualizar: resultado.filter((r) => r.accion === 'actualizar').length,
    sin_cambios: resultado.filter((r) => r.accion === 'sin_cambios').length,
    errores: resultado.filter((r) => r.accion === 'error').length,
    nuevos_grados: [...nuevosGrados],
    nuevos_cursos: [...nuevosCursos],
  };
  if (aplicar && req) auditar(req, 'importacion_estudiantes', resumen);
  return { aplicado: aplicar, resumen, filas: resultado };
}

/** Plantilla de carga masiva en Excel. */
async function plantilla() {
  const wb = new ExcelJS.Workbook();
  const h = wb.addWorksheet('Estudiantes');
  h.columns = [
    { header: 'Documento', key: 'documento', width: 16 },
    { header: 'Nombre completo', key: 'nombre', width: 34 },
    { header: 'Edad', key: 'edad', width: 8 },
    { header: 'Grado', key: 'grado', width: 12 },
    { header: 'Curso', key: 'curso', width: 10 },
    { header: 'Acudiente', key: 'acudiente', width: 30 },
    { header: 'Correo acudiente', key: 'correo_acudiente', width: 32 },
    { header: 'Teléfono', key: 'telefono', width: 16 },
    { header: 'Dirección', key: 'direccion', width: 36 },
  ];
  h.addRow({ documento: '1070123456', nombre: 'Laura Sofía Gómez Ruiz', edad: 12, grado: 'Sexto', curso: '601', acudiente: 'Marta Ruiz Pérez', correo_acudiente: 'marta.ruiz@correo.com', telefono: '3001234567', direccion: 'Calle 10 # 5-20' });
  const enc = h.getRow(1);
  enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16324F' } };
  enc.height = 22;
  enc.alignment = { vertical: 'middle' };
  h.views = [{ state: 'frozen', ySplit: 1 }];
  h.getColumn('documento').numFmt = '@';
  h.getColumn('telefono').numFmt = '@';

  const ins = wb.addWorksheet('Instrucciones');
  ins.getColumn(1).width = 110;
  [
    'INSTRUCCIONES PARA LA CARGA MASIVA DE ESTUDIANTES',
    '',
    '1. Diligencie una fila por estudiante en la hoja "Estudiantes" (borre la fila de ejemplo).',
    '2. Columnas obligatorias: Nombre completo, Grado y Curso. Se recomienda incluir el Documento.',
    '3. El Documento de identidad identifica al estudiante: si ya existe, sus datos se ACTUALIZAN en lugar de duplicarse.',
    '   Sin documento, el sistema identifica al estudiante por su nombre completo.',
    '4. El grado puede escribirse como "Sexto", "6" o "6°". El curso debe coincidir con el configurado (p. ej. 601).',
    '5. Las celdas vacías no borran datos que ya existan en la plataforma.',
    '6. También puede usar un archivo CSV (separado por comas o punto y coma) con los mismos encabezados.',
    '7. Antes de guardar, la plataforma muestra una vista previa con errores y cambios para su revisión.',
  ].forEach((t, i) => {
    const c = ins.getCell(i + 1, 1);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 13, color: { argb: 'FF16324F' } };
  });
  return wb.xlsx.writeBuffer();
}

module.exports = { leerArchivo, procesar, plantilla, claveGrado };
