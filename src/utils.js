'use strict';

const TZ = process.env.ZONA_HORARIA || 'America/Bogota';

/** Fecha y hora actuales en la zona horaria de la institución. */
function ahora() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const fecha = `${p.year}-${p.month}-${p.day}`;
  const hora = `${p.hour}:${p.minute}:${p.second}`;
  return { fecha, hora, marca: `${fecha} ${hora}` };
}

const marcaTiempo = () => ahora().marca;

/** Texto limpio: sin espacios repetidos ni en los extremos. */
function limpiar(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Clave de comparación: minúsculas, sin tildes, espacios normalizados. */
function normalizar(v) {
  return limpiar(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Nombre propio con mayúscula inicial en cada palabra. */
function nombrePropio(v) {
  const menores = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
  return limpiar(v).toLowerCase().split(' ').map((w, i) =>
    (i > 0 && menores.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const correoValido = (c) => RE_CORREO.test(String(c || ''));

function telefonoValido(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 7 && d.length <= 15;
}

function fechaValida(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f || ''))) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

function enteroOpcional(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/** Enmascara un correo: an****@dominio.com */
function enmascararCorreo(c) {
  if (!c) return c;
  const [u, d] = String(c).split('@');
  if (!d) return '****';
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(2, u.length - 2))}@${d}`;
}

function enmascararTelefono(t) {
  if (!t) return t;
  const s = String(t);
  return s.length <= 3 ? '***' : `${'*'.repeat(s.length - 3)}${s.slice(-3)}`;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 2026-10-28 -> "miércoles 28 de octubre de 2026" */
function fechaLarga(f) {
  const d = new Date(`${f}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()].toLowerCase()} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** 2026-10-28 -> "28/10/2026" */
function fechaCorta(f) {
  if (!f) return '';
  const [y, m, d] = String(f).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function diaSemana(f) {
  return new Date(`${f}T12:00:00Z`).getUTCDay();
}

/** Lunes de la semana de la fecha (YYYY-MM-DD). */
function inicioSemana(f) {
  const d = new Date(`${f}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

class ErrorHttp extends Error {
  constructor(status, mensaje, extra) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}

/** Envuelve controladores async para delegar errores a Express. */
const ruta = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  TZ, ahora, marcaTiempo, limpiar, normalizar, nombrePropio, correoValido, telefonoValido,
  fechaValida, enteroOpcional, enmascararCorreo, enmascararTelefono, fechaLarga, fechaCorta,
  diaSemana, inicioSemana, DIAS, MESES, ErrorHttp, ruta,
};
