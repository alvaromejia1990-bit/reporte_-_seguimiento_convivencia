'use strict';
/** Copia de seguridad consistente de la base de datos. Uso: npm run respaldo [carpeta_destino] */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { db } = require('../src/db');

const carpeta = path.resolve(process.argv[2] || path.join(__dirname, '..', 'respaldos'));
fs.mkdirSync(carpeta, { recursive: true });
const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const destino = path.join(carpeta, `tardanzas_${sello}.db`);
db.backup(destino).then(() => {
  console.log(`✔ Respaldo creado: ${destino}`);
  // Conserva los 30 respaldos más recientes
  const archivos = fs.readdirSync(carpeta).filter((f) => /^tardanzas_.*\.db$/.test(f)).sort();
  archivos.slice(0, Math.max(0, archivos.length - 30)).forEach((f) => fs.unlinkSync(path.join(carpeta, f)));
  db.close();
}).catch((e) => { console.error('Error en el respaldo:', e.message); process.exit(1); });
