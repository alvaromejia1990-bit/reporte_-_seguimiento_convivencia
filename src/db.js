'use strict';

const path = require('path');
const fs = require('fs');
const { marcaTiempo } = require('./utils');

// SQLite integrado en Node.js (sin dependencias nativas que compilar).
// Se silencia el aviso "experimental" que Node imprime al cargar el módulo.
const emitirAviso = process.emitWarning;
process.emitWarning = (aviso, ...resto) => {
  if (String(aviso?.message ?? aviso).includes('SQLite')) return;
  return emitirAviso.call(process, aviso, ...resto);
};
const sqlite = require('node:sqlite');

const RUTA_DB = path.resolve(process.env.RUTA_BASE_DATOS || path.join(__dirname, '..', 'data', 'tardanzas.db'));
fs.mkdirSync(path.dirname(RUTA_DB), { recursive: true });

/** Adaptador mínimo con la interfaz usada por la aplicación (prepare/get/all/run, transaction, backup). */
function normalizarValor(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
function crearConexion(ruta) {
  const nativa = new sqlite.DatabaseSync(ruta);
  let profundidad = 0;
  const conexion = {
    exec: (sql) => nativa.exec(sql),
    pragma: (p) => nativa.exec(`PRAGMA ${p}`),
    close: () => nativa.close(),
    prepare(sql) {
      const st = nativa.prepare(sql);
      const nombres = new Set([...sql.matchAll(/[@:$]([A-Za-z_]\w*)/g)].map((m) => m[1]));
      const args = (params) => {
        if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0]) && !Buffer.isBuffer(params[0])) {
          const o = {};
          for (const n of nombres) o[n] = normalizarValor(params[0][n]);
          return [o];
        }
        return params.map(normalizarValor);
      };
      const plano = (f) => (f ? { ...f } : f);
      return {
        run: (...p) => st.run(...args(p)),
        get: (...p) => plano(st.get(...args(p))),
        all: (...p) => st.all(...args(p)).map(plano),
      };
    },
    transaction(fn) {
      return (...a) => {
        const sp = `sp_${profundidad}`;
        nativa.exec(profundidad === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
        profundidad++;
        try {
          const r = fn(...a);
          profundidad--;
          nativa.exec(profundidad === 0 ? 'COMMIT' : `RELEASE ${sp}`);
          return r;
        } catch (e) {
          profundidad--;
          nativa.exec(profundidad === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
          throw e;
        }
      };
    },
    /** Copia de seguridad consistente de la base en caliente. */
    async backup(destino) {
      if (typeof sqlite.backup === 'function') return sqlite.backup(nativa, destino);
      nativa.exec(`VACUUM INTO '${String(destino).replace(/'/g, "''")}'`);
      return undefined;
    },
  };
  return conexion;
}

const db = crearConexion(RUTA_DB);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  rol             TEXT NOT NULL CHECK (rol IN ('admin','docente')),
  activo          INTEGER NOT NULL DEFAULT 1,
  version_sesion  INTEGER NOT NULL DEFAULT 1,
  ultimo_acceso   TEXT,
  creado_en       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS periodos (
  id            INTEGER PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  fecha_inicio  TEXT NOT NULL,
  fecha_fin     TEXT NOT NULL,
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS grados (
  id      INTEGER PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  orden   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cursos (
  id        INTEGER PRIMARY KEY,
  grado_id  INTEGER NOT NULL REFERENCES grados(id) ON DELETE RESTRICT,
  nombre    TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (grado_id, nombre)
);

CREATE TABLE IF NOT EXISTS estudiantes (
  id                INTEGER PRIMARY KEY,
  documento         TEXT,
  nombre            TEXT NOT NULL,
  nombre_norm       TEXT NOT NULL,
  edad              INTEGER CHECK (edad IS NULL OR edad BETWEEN 3 AND 30),
  grado_id          INTEGER NOT NULL REFERENCES grados(id) ON DELETE RESTRICT,
  curso_id          INTEGER NOT NULL REFERENCES cursos(id) ON DELETE RESTRICT,
  acudiente         TEXT,
  correo_acudiente  TEXT,
  telefono          TEXT,
  direccion         TEXT,
  activo            INTEGER NOT NULL DEFAULT 1,
  creado_en         TEXT NOT NULL,
  actualizado_en    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_estudiantes_documento ON estudiantes(documento) WHERE documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_estudiantes_nombre ON estudiantes(nombre_norm);
CREATE INDEX IF NOT EXISTS ix_estudiantes_curso ON estudiantes(grado_id, curso_id);

CREATE TABLE IF NOT EXISTS llegadas_tarde (
  id              INTEGER PRIMARY KEY,
  estudiante_id   INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
  fecha           TEXT NOT NULL,
  hora            TEXT NOT NULL,
  periodo_id      INTEGER NOT NULL REFERENCES periodos(id) ON DELETE RESTRICT,
  grado_id        INTEGER NOT NULL REFERENCES grados(id),
  curso_id        INTEGER NOT NULL REFERENCES cursos(id),
  registrado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  observacion     TEXT,
  creado_en       TEXT NOT NULL,
  UNIQUE (estudiante_id, fecha)
);
CREATE INDEX IF NOT EXISTS ix_lt_fecha ON llegadas_tarde(fecha);
CREATE INDEX IF NOT EXISTS ix_lt_periodo ON llegadas_tarde(periodo_id);
CREATE INDEX IF NOT EXISTS ix_lt_curso ON llegadas_tarde(grado_id, curso_id);

CREATE TABLE IF NOT EXISTS notificaciones (
  id                 INTEGER PRIMARY KEY,
  estudiante_id      INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
  periodo_id         INTEGER REFERENCES periodos(id) ON DELETE SET NULL,
  enviado_por        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  destinatario       TEXT NOT NULL,
  asunto             TEXT NOT NULL,
  cantidad_reportes  INTEGER NOT NULL,
  fechas             TEXT NOT NULL,
  estado             TEXT NOT NULL CHECK (estado IN ('enviado','rechazado','fallido')),
  detalle            TEXT,
  message_id         TEXT,
  fecha_envio        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notif_est ON notificaciones(estudiante_id);

CREATE TABLE IF NOT EXISTS auditoria (
  id          INTEGER PRIMARY KEY,
  usuario_id  INTEGER,
  usuario     TEXT,
  accion      TEXT NOT NULL,
  detalle     TEXT,
  ip          TEXT,
  fecha       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria(fecha);

CREATE TABLE IF NOT EXISTS configuracion (
  clave  TEXT PRIMARY KEY,
  valor  TEXT
);
`;

db.exec(ESQUEMA);

const CONFIG_INICIAL = {
  institucion_nombre: process.env.INSTITUCION_NOMBRE || 'Institución Educativa',
  institucion_sigla: process.env.INSTITUCION_SIGLA || '',
  institucion_ciudad: process.env.INSTITUCION_CIUDAD || '',
  umbral_seguimiento: '4',
  firma_correo: 'Coordinación de Convivencia',
};
const insCfg = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(CONFIG_INICIAL)) insCfg.run(k, v);

function leerConfig() {
  const filas = db.prepare('SELECT clave, valor FROM configuracion').all();
  const c = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  c.umbral_seguimiento = Number(c.umbral_seguimiento) || 4;
  return c;
}

function guardarConfig(clave, valor) {
  db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .run(clave, String(valor));
}

/** Período académico que contiene la fecha dada (YYYY-MM-DD). */
function periodoDeFecha(fecha) {
  return db.prepare(
    'SELECT * FROM periodos WHERE ? BETWEEN fecha_inicio AND fecha_fin ORDER BY fecha_inicio DESC LIMIT 1'
  ).get(fecha) || null;
}

function auditar(req, accion, detalle) {
  try {
    db.prepare('INSERT INTO auditoria (usuario_id, usuario, accion, detalle, ip, fecha) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req?.usuario?.id ?? null, req?.usuario?.email ?? null, accion,
        typeof detalle === 'string' ? detalle : JSON.stringify(detalle ?? null),
        req?.ip ?? null, marcaTiempo());
  } catch (e) {
    console.error('No se pudo registrar auditoría:', e.message);
  }
}

module.exports = { db, RUTA_DB, leerConfig, guardarConfig, periodoDeFecha, auditar };
