'use strict';

const { db } = require('../db');
const {
  limpiar, normalizar, nombrePropio, correoValido, telefonoValido, enteroOpcional,
  enmascararCorreo, enmascararTelefono, marcaTiempo, ErrorHttp,
} = require('../utils');

const SELECT_ESTUDIANTE = `
  SELECT e.*, g.nombre AS grado, c.nombre AS curso, g.orden AS grado_orden
  FROM estudiantes e
  JOIN grados g ON g.id = e.grado_id
  JOIN cursos c ON c.id = e.curso_id`;

/**
 * Valida y normaliza los datos de un estudiante.
 * Devuelve { datos, errores, advertencias }.
 */
function validar(entrada, { omitirUbicacion = false } = {}) {
  const errores = [];
  const advertencias = [];
  const d = {};

  d.nombre = nombrePropio(entrada.nombre);
  if (d.nombre.length < 5 || d.nombre.split(' ').length < 2) errores.push('El nombre completo es obligatorio (nombre y apellido).');
  if (d.nombre.length > 120) errores.push('El nombre supera 120 caracteres.');
  if (/[0-9<>{}]/.test(d.nombre)) errores.push('El nombre contiene caracteres no válidos.');

  const doc = limpiar(entrada.documento).replace(/[.\s]/g, '');
  d.documento = doc || null;
  if (d.documento && !/^[A-Za-z0-9-]{4,20}$/.test(d.documento)) errores.push('El documento de identidad no es válido.');

  const edad = enteroOpcional(entrada.edad);
  if (Number.isNaN(edad) || (edad !== null && (edad < 3 || edad > 30))) errores.push('La edad debe ser un número entre 3 y 30.');
  d.edad = Number.isNaN(edad) ? null : edad;

  d.acudiente = nombrePropio(entrada.acudiente) || null;
  d.correo_acudiente = limpiar(entrada.correo_acudiente).toLowerCase() || null;
  if (d.correo_acudiente && !correoValido(d.correo_acudiente)) errores.push('El correo del acudiente no es válido.');
  if (!d.correo_acudiente) advertencias.push('Sin correo del acudiente: no podrá recibir notificaciones.');
  if (!d.acudiente) advertencias.push('Sin nombre del acudiente.');

  d.telefono = limpiar(entrada.telefono) || null;
  if (d.telefono && !telefonoValido(d.telefono)) errores.push('El teléfono debe tener entre 7 y 15 dígitos.');
  d.direccion = limpiar(entrada.direccion).slice(0, 200) || null;

  d.nombre_norm = normalizar(d.nombre);
  if (omitirUbicacion) return { datos: d, errores, advertencias };

  d.grado_id = Number(entrada.grado_id) || null;
  d.curso_id = Number(entrada.curso_id) || null;
  if (!d.grado_id) errores.push('Seleccione el grado.');
  if (!d.curso_id) errores.push('Seleccione el curso.');
  if (d.grado_id && d.curso_id) {
    const c = db.prepare('SELECT grado_id FROM cursos WHERE id = ?').get(d.curso_id);
    if (!c) errores.push('El curso no existe.');
    else if (c.grado_id !== d.grado_id) errores.push('El curso no pertenece al grado seleccionado.');
  }
  return { datos: d, errores, advertencias };
}

/**
 * Busca un estudiante que corresponda a los datos (para evitar duplicados).
 * - Con documento: coincide por documento, o por nombre si el registro existente no tiene documento.
 * - Sin documento: coincide por nombre normalizado.
 */
function buscarExistente({ documento, nombre_norm }, excluirId = 0) {
  if (documento) {
    const porDoc = db.prepare('SELECT * FROM estudiantes WHERE documento = ? AND id <> ?').get(documento, excluirId);
    if (porDoc) return { estudiante: porDoc, motivo: 'documento' };
    const porNombre = db.prepare('SELECT * FROM estudiantes WHERE nombre_norm = ? AND documento IS NULL AND id <> ?').all(nombre_norm, excluirId);
    if (porNombre.length === 1) return { estudiante: porNombre[0], motivo: 'nombre' };
    return null;
  }
  const porNombre = db.prepare('SELECT * FROM estudiantes WHERE nombre_norm = ? AND id <> ?').all(nombre_norm, excluirId);
  if (porNombre.length === 1) return { estudiante: porNombre[0], motivo: 'nombre' };
  if (porNombre.length > 1) return { ambiguo: true, motivo: 'nombre' };
  return null;
}

function crear(d) {
  const t = marcaTiempo();
  const info = db.prepare(`
    INSERT INTO estudiantes (documento, nombre, nombre_norm, edad, grado_id, curso_id, acudiente, correo_acudiente, telefono, direccion, activo, creado_en, actualizado_en)
    VALUES (@documento, @nombre, @nombre_norm, @edad, @grado_id, @curso_id, @acudiente, @correo_acudiente, @telefono, @direccion, 1, @t, @t)
  `).run({ ...d, t });
  return info.lastInsertRowid;
}

/** Actualiza; si soloConValor=true, los campos vacíos no borran datos existentes (carga masiva). */
function actualizar(id, d, soloConValor = false) {
  const campos = ['documento', 'nombre', 'nombre_norm', 'edad', 'grado_id', 'curso_id', 'acudiente', 'correo_acudiente', 'telefono', 'direccion'];
  const sets = [];
  const vals = {};
  for (const c of campos) {
    if (soloConValor && (d[c] === null || d[c] === undefined || d[c] === '')) continue;
    sets.push(`${c} = @${c}`);
    vals[c] = d[c];
  }
  vals.id = id;
  vals.t = marcaTiempo();
  db.prepare(`UPDATE estudiantes SET ${sets.join(', ')}, actualizado_en = @t WHERE id = @id`).run(vals);
}

function obtener(id) {
  return db.prepare(`${SELECT_ESTUDIANTE} WHERE e.id = ?`).get(id);
}

/** Oculta datos de contacto a quienes no son administradores (protección de datos). */
function proteger(est, usuario) {
  if (!est || usuario?.rol === 'admin') return est;
  const { documento, telefono, direccion, correo_acudiente, ...resto } = est;
  return {
    ...resto,
    documento: documento ? `****${String(documento).slice(-3)}` : null,
    correo_acudiente: enmascararCorreo(correo_acudiente),
    telefono: enmascararTelefono(telefono),
    direccion: direccion ? 'Reservado' : null,
    protegido: true,
  };
}

module.exports = { SELECT_ESTUDIANTE, validar, buscarExistente, crear, actualizar, obtener, proteger };
