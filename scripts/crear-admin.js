'use strict';
/**
 * Crea o restablece un usuario administrador.
 * Uso: npm run crear-admin            (pregunta los datos)
 *      npm run crear-admin -- correo@inst.edu.co "Nombre Apellido"
 */
require('dotenv').config({ quiet: true });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');
const { marcaTiempo, correoValido } = require('../src/utils');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (t) => new Promise((ok) => rl.question(t, ok));

(async () => {
  const email = (process.argv[2] || await preguntar('Correo del administrador: ')).trim().toLowerCase();
  if (!correoValido(email)) { console.error('Correo no válido.'); process.exit(1); }
  const nombre = (process.argv[3] || await preguntar('Nombre completo: ')).trim() || 'Administrador';
  const clave = (await preguntar('Contraseña (mín. 8 caracteres, letras y números): ')).trim();
  rl.close();
  if (clave.length < 8 || !/\d/.test(clave) || !/[a-zA-Z]/.test(clave)) { console.error('Contraseña demasiado débil.'); process.exit(1); }
  const hash = bcrypt.hashSync(clave, 12);
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) {
    db.prepare("UPDATE usuarios SET nombre = ?, password_hash = ?, rol = 'admin', activo = 1, version_sesion = version_sesion + 1 WHERE id = ?").run(nombre, hash, existe.id);
    console.log(`✔ Administrador actualizado: ${email}`);
  } else {
    db.prepare("INSERT INTO usuarios (nombre, email, password_hash, rol, creado_en) VALUES (?, ?, ?, 'admin', ?)").run(nombre, email, hash, marcaTiempo());
    console.log(`✔ Administrador creado: ${email}`);
  }
})();
