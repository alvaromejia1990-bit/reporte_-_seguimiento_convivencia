'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db, auditar } = require('../db');
const { emitirSesion, cerrarSesion, requiereSesion } = require('../middleware/auth');
const { limpiar, marcaTiempo, ErrorHttp, ruta } = require('../utils');

const r = express.Router();

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.' },
});

// Hash ficticio para igualar tiempos cuando el usuario no existe.
const HASH_FICTICIO = bcrypt.hashSync('contraseña-ficticia-para-tiempo-constante', 10);

r.post('/login', limiteLogin, ruta(async (req, res) => {
  const email = limpiar(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new ErrorHttp(400, 'Ingrese correo y contraseña.');

  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  const ok = await bcrypt.compare(password, u?.password_hash || HASH_FICTICIO);
  if (!u || !ok || !u.activo) {
    auditar({ ip: req.ip, usuario: { email } }, 'login_fallido', { email });
    throw new ErrorHttp(401, 'Credenciales incorrectas o usuario inactivo.');
  }
  db.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').run(marcaTiempo(), u.id);
  emitirSesion(res, u);
  req.usuario = u;
  auditar(req, 'login', null);
  res.json({ usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } });
}));

r.post('/logout', (req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});

r.get('/yo', (req, res, next) => {
  if (!req.cookies?.lt_sesion) return res.json({ usuario: null });
  next();
}, requiereSesion, (req, res) => {
  const { id, nombre, email, rol } = req.usuario;
  res.json({ usuario: { id, nombre, email, rol } });
});

r.put('/clave', requiereSesion, ruta(async (req, res) => {
  const actual = String(req.body?.actual || '');
  const nueva = String(req.body?.nueva || '');
  validarClave(nueva);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!(await bcrypt.compare(actual, u.password_hash))) throw new ErrorHttp(400, 'La contraseña actual no es correcta.');
  const hash = await bcrypt.hash(nueva, 12);
  db.prepare('UPDATE usuarios SET password_hash = ?, version_sesion = version_sesion + 1 WHERE id = ?').run(hash, u.id);
  const act = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
  emitirSesion(res, act);
  auditar(req, 'cambio_clave', null);
  res.json({ ok: true });
}));

function validarClave(c) {
  if (c.length < 8 || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) || !/\d/.test(c)) {
    throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.');
  }
}

module.exports = r;
module.exports.validarClave = validarClave;
