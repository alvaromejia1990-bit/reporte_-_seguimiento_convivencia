'use strict';
/**
 * Carga datos de DEMOSTRACIÓN (períodos, grados, cursos, estudiantes ficticios y reportes).
 * Solo se ejecuta sobre una base sin estudiantes, salvo que se use --forzar.
 * Uso: npm run demo
 */
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');
const { normalizar, marcaTiempo, ahora } = require('../src/utils');

const forzar = process.argv.includes('--forzar');
if (!forzar && db.prepare('SELECT COUNT(*) n FROM estudiantes').get().n > 0) {
  console.error('La base ya tiene estudiantes. Use "npm run demo -- --forzar" solo en un entorno de pruebas.');
  process.exit(1);
}

let semilla = 20261028;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };
const elegir = (a) => a[Math.floor(azar() * a.length)];

const NOMBRES = ['Sofía', 'Valentina', 'Isabella', 'Mariana', 'Gabriela', 'Daniela', 'Luciana', 'Sara', 'Salomé', 'Camila', 'Laura', 'Juliana', 'Antonella', 'Manuela', 'Paula',
  'Santiago', 'Samuel', 'Matías', 'Sebastián', 'Nicolás', 'Alejandro', 'Daniel', 'Tomás', 'Juan José', 'Emmanuel', 'David', 'Felipe', 'Andrés', 'Miguel Ángel', 'Juan Pablo', 'Jerónimo', 'Martín'];
const APELLIDOS = ['Rodríguez', 'Gómez', 'González', 'Martínez', 'García', 'López', 'Hernández', 'Sánchez', 'Ramírez', 'Pérez', 'Díaz', 'Moreno', 'Rojas', 'Vargas', 'Castro',
  'Ortiz', 'Jiménez', 'Torres', 'Ruiz', 'Suárez', 'Cárdenas', 'Mejía', 'Herrera', 'Medina', 'Aguilar', 'Bermúdez', 'Quintero', 'Ospina', 'Cortés', 'Patiño'];
const ADULTOS = ['Martha', 'Luz Marina', 'Carlos', 'Jorge', 'Gloria', 'Patricia', 'Luis Fernando', 'Ana María', 'Claudia', 'Óscar', 'Sandra', 'William', 'Diana', 'Hernán'];
const CALLES = ['Calle', 'Carrera', 'Avenida', 'Diagonal', 'Transversal'];

const t = marcaTiempo();
db.transaction(() => {
  if (forzar) {
    db.exec('DELETE FROM notificaciones; DELETE FROM llegadas_tarde; DELETE FROM estudiantes; DELETE FROM cursos; DELETE FROM grados; DELETE FROM periodos;');
  }
  const anio = Number(ahora().fecha.slice(0, 4));
  const periodos = [
    ['Período 1', `${anio}-01-26`, `${anio}-04-03`], ['Período 2', `${anio}-04-06`, `${anio}-06-19`],
    ['Período 3', `${anio}-07-06`, `${anio}-09-11`], ['Período 4', `${anio}-09-14`, `${anio}-11-27`],
  ];
  const insP = db.prepare('INSERT OR IGNORE INTO periodos (nombre, fecha_inicio, fecha_fin) VALUES (?, ?, ?)');
  periodos.forEach((p) => insP.run(...p));

  const grados = [['Sexto', 6], ['Séptimo', 7], ['Octavo', 8], ['Noveno', 9], ['Décimo', 10], ['Undécimo', 11]];
  const insG = db.prepare('INSERT OR IGNORE INTO grados (nombre, orden) VALUES (?, ?)');
  const insC = db.prepare('INSERT OR IGNORE INTO cursos (grado_id, nombre) VALUES (?, ?)');
  const insE = db.prepare(`INSERT INTO estudiantes (documento, nombre, nombre_norm, edad, grado_id, curso_id, acudiente, correo_acudiente, telefono, direccion, activo, creado_en, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
  const usados = new Set();
  let doc = 1070500000;
  const estudiantes = [];
  for (const [nombreG, num] of grados) {
    insG.run(nombreG, num);
    const g = db.prepare('SELECT id FROM grados WHERE nombre = ?').get(nombreG);
    for (let k = 1; k <= 2; k++) {
      const nombreC = `${num}0${k}`;
      insC.run(g.id, nombreC);
      const c = db.prepare('SELECT id FROM cursos WHERE grado_id = ? AND nombre = ?').get(g.id, nombreC);
      for (let i = 0; i < 28; i++) {
        let nombre;
        do { nombre = `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`; } while (usados.has(nombre));
        usados.add(nombre);
        const ap = nombre.split(' ').slice(-2)[0];
        const acudiente = `${elegir(ADULTOS)} ${ap} ${elegir(APELLIDOS)}`;
        const correo = `${normalizar(acudiente).split(' ').slice(0, 2).join('.').replace(/[^a-z.]/g, '')}${Math.floor(azar() * 90 + 10)}@example.com`;
        const info = insE.run(String(doc++), nombre, normalizar(nombre), num + 5 + Math.floor(azar() * 2), g.id, c.id, acudiente, correo,
          `3${Math.floor(azar() * 9e8 + 1e8)}`, `${elegir(CALLES)} ${Math.floor(azar() * 40 + 1)} # ${Math.floor(azar() * 30 + 1)}-${Math.floor(azar() * 90 + 10)}`, t, t);
        // Propensión: la mayoría casi nunca llega tarde; unos pocos con frecuencia
        const r = azar();
        const prop = r < 0.6 ? 0.004 : r < 0.88 ? 0.02 : r < 0.97 ? 0.06 : 0.11;
        estudiantes.push({ id: info.lastInsertRowid, grado_id: g.id, curso_id: c.id, prop: prop * (num >= 10 ? 1.3 : 1) });
      }
    }
  }

  let usuarioDocente = db.prepare("SELECT id FROM usuarios WHERE email = 'docente@demo.edu.co'").get();
  if (!usuarioDocente) {
    const info = db.prepare("INSERT INTO usuarios (nombre, email, password_hash, rol, creado_en) VALUES ('Docente de Demostración', 'docente@demo.edu.co', ?, 'docente', ?)")
      .run(bcrypt.hashSync('Docente2026', 12), t);
    usuarioDocente = { id: info.lastInsertRowid };
  }
  if (!db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get()) {
    db.prepare("INSERT INTO usuarios (nombre, email, password_hash, rol, creado_en) VALUES ('Administrador de Demostración', 'admin@demo.edu.co', ?, 'admin', ?)")
      .run(bcrypt.hashSync('Admin2026', 12), t);
    console.log('Administrador demo: admin@demo.edu.co / Admin2026');
  }

  const insT = db.prepare(`INSERT OR IGNORE INTO llegadas_tarde (estudiante_id, fecha, hora, periodo_id, grado_id, curso_id, registrado_por, observacion, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`);
  const hoy = ahora().fecha;
  let total = 0;
  for (const p of db.prepare('SELECT * FROM periodos ORDER BY fecha_inicio').all()) {
    const d = new Date(`${p.fecha_inicio}T12:00:00Z`);
    const fin = p.fecha_fin < hoy ? p.fecha_fin : hoy;
    while (d.toISOString().slice(0, 10) < fin) {
      const f = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        const factorDia = dow === 1 ? 1.5 : dow === 5 ? 1.2 : 1; // lunes y viernes con más tardanzas
        const factorPeriodo = 1 + (Number(p.nombre.slice(-1)) - 1) * 0.12;
        for (const e of estudiantes) {
          if (azar() < e.prop * factorDia * factorPeriodo) {
            const minutos = 6 * 60 + 31 + Math.floor(Math.pow(azar(), 2) * 55);
            const hora = `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
            total += insT.run(e.id, f, hora, p.id, e.grado_id, e.curso_id, usuarioDocente.id, `${f} ${hora}:00`).changes;
          }
        }
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  console.log(`✔ Datos de demostración: ${estudiantes.length} estudiantes, ${total} llegadas tarde.`);
  console.log('  Docente demo: docente@demo.edu.co / Docente2026');
})();
