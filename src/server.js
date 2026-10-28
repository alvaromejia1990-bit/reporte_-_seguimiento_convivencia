'use strict';

require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { db, RUTA_DB } = require('./db');
const { requiereSesion, antiCsrf, secreto } = require('./middleware/auth');
const { ErrorHttp, marcaTiempo, correoValido } = require('./utils');

secreto(); // valida la configuración antes de iniciar

const app = express();
app.disable('x-powered-by');
if (process.env.CONFIAR_PROXY) app.set('trust proxy', Number(process.env.CONFIAR_PROXY) || 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'frame-src': ["'self'", 'blob:'],
      'object-src': ["'none'"],
      'upgrade-insecure-requests': process.env.COOKIE_SEGURA === 'true' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cookieParser());
app.use('/api/informes/exportar', express.json({ limit: '20mb' }));
app.use(express.json({ limit: '1mb' }));

/* API */
app.use('/api', antiCsrf);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/auth', require('./routes/auth'));
app.use('/api/estudiantes', requiereSesion, require('./routes/estudiantes'));
app.use('/api/tardanzas', requiereSesion, require('./routes/tardanzas'));
app.use('/api/seguimiento', requiereSesion, require('./routes/seguimiento'));
app.use('/api/informes', requiereSesion, require('./routes/informes'));
app.use('/api/configuracion', requiereSesion, require('./routes/configuracion'));
app.get('/api/publico', (req, res) => {
  const c = require('./db').leerConfig();
  res.json({ nombre: c.institucion_nombre, sigla: c.institucion_sigla });
});
app.get('/api/salud', (req, res) => res.json({ ok: true, hora: marcaTiempo() }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

/* Frontend */
app.get('/img/logo', (req, res) => {
  const png = path.join(__dirname, '..', 'public', 'img', 'logo.png');
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(require('fs').existsSync(png) ? png : path.join(__dirname, '..', 'public', 'img', 'escudo.svg'));
});
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

/* Errores */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ErrorHttp) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 5 MB.' : `Error al recibir el archivo: ${err.message}` });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'La información enviada es demasiado grande.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Formato de datos no válido.' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor. Intente de nuevo o contacte al administrador.' });
});

/* Administrador inicial */
function crearAdministradorInicial() {
  const n = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
  if (n > 0) return;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const clave = String(process.env.ADMIN_CLAVE || '');
  if (!correoValido(email) || clave.length < 8) {
    console.warn('⚠  No hay usuarios. Defina ADMIN_EMAIL y ADMIN_CLAVE en .env o ejecute: npm run crear-admin');
    return;
  }
  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, creado_en) VALUES (?, ?, ?, ?, ?)')
    .run(process.env.ADMIN_NOMBRE || 'Administrador', email, bcrypt.hashSync(clave, 12), 'admin', marcaTiempo());
  console.log(`✔  Administrador inicial creado: ${email}. Cambie la contraseña tras el primer ingreso.`);
}
crearAdministradorInicial();

const PUERTO = Number(process.env.PUERTO) || 3000;
const servidor = app.listen(PUERTO, () => {
  console.log(`Plataforma de llegadas tarde en http://localhost:${PUERTO}`);
  console.log(`Base de datos: ${RUTA_DB}`);
});

function apagar() {
  servidor.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

module.exports = app;
