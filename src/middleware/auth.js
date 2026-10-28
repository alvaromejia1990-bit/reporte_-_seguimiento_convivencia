'use strict';

const jwt = require('jsonwebtoken');
const { db } = require('../db');

const COOKIE = 'lt_sesion';
const DURACION_HORAS = Number(process.env.SESION_HORAS) || 8;

function secreto() {
  const s = process.env.JWT_SECRETO;
  if (!s || s.length < 32) {
    throw new Error('Configure JWT_SECRETO en el archivo .env (mínimo 32 caracteres aleatorios).');
  }
  return s;
}

function emitirSesion(res, usuario) {
  const token = jwt.sign({ sub: usuario.id, v: usuario.version_sesion }, secreto(), {
    expiresIn: `${DURACION_HORAS}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SEGURA === 'true',
    maxAge: DURACION_HORAS * 3600 * 1000,
    path: '/',
  });
}

function cerrarSesion(res) {
  res.clearCookie(COOKIE, { path: '/', sameSite: 'strict', secure: process.env.COOKIE_SEGURA === 'true' });
}

/** Exige sesión válida; carga el usuario actual en req.usuario. */
function requiereSesion(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Sesión no iniciada.' });
  try {
    const datos = jwt.verify(token, secreto());
    const u = db.prepare('SELECT id, nombre, email, rol, activo, version_sesion FROM usuarios WHERE id = ?').get(datos.sub);
    if (!u || !u.activo || u.version_sesion !== datos.v) {
      cerrarSesion(res);
      return res.status(401).json({ error: 'La sesión ya no es válida. Ingrese nuevamente.' });
    }
    req.usuario = u;
    next();
  } catch {
    cerrarSesion(res);
    return res.status(401).json({ error: 'La sesión expiró. Ingrese nuevamente.' });
  }
}

/** Restringe la ruta a ciertos roles. */
const requiereRol = (...roles) => (req, res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'No tiene permisos para realizar esta acción.' });
  }
  next();
};

/**
 * Protección CSRF complementaria a SameSite=strict: toda petición que modifica
 * datos debe venir del propio frontend con la cabecera X-Requested-With.
 */
function antiCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') {
    return res.status(403).json({ error: 'Petición rechazada.' });
  }
  next();
}

module.exports = { emitirSesion, cerrarSesion, requiereSesion, requiereRol, antiCsrf, secreto };
