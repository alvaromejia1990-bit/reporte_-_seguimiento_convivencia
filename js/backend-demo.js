/* =========================================================================
   Backend de DEMOSTRACIÓN
   Implementa la misma interfaz que backend-supabase.js, guardando los datos
   en el almacenamiento local del navegador. Aplica las mismas reglas de negocio
   (duplicados, períodos, permisos por rol) para poder probar la plataforma
   sin configurar un servidor. No usar con datos reales.
   ========================================================================= */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const CLAVE = "lt_demo_v1";
  const SESION = "lt_demo_sesion";
  let db = null;
  let usuario = null;

  const clonar = (o) => JSON.parse(JSON.stringify(o));
  const fallo = (m) => { throw new Error(m); };
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch (e) { /* almacenamiento no disponible: se mantiene en memoria */ } };
  const leer = () => { try { const t = localStorage.getItem(CLAVE); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const perfil = (u) => ({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, activo: u.activo, creado_en: u.creado_en });
  const reqUsuario = () => { if (!usuario || !usuario.activo) fallo("Sesión requerida"); };
  const reqAdmin = () => { reqUsuario(); if (usuario.rol !== "admin") fallo("Solo un administrador puede realizar esta acción"); };
  const auditar = (tabla, accion, registro_id, detalle) => {
    db.auditoria.unshift({ id: Date.now() + Math.random(), fecha: new Date().toISOString(), usuario: usuario ? usuario.nombre : "Sistema", tabla, accion, registro_id, detalle });
    db.auditoria = db.auditoria.slice(0, 500);
  };
  const basico = (e) => {
    const { acudiente_nombre, acudiente_parentesco, acudiente_correo, acudiente_telefono, direccion, ...resto } = e;
    return { ...resto, tiene_correo_acudiente: !!acudiente_correo };
  };

  /* ---------------- Datos de ejemplo ---------------- */
  function semilla() {
    let s = 20261028;
    const azar = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const elegir = (a) => a[Math.floor(azar() * a.length)];
    const NOM_F = ["Valentina", "Sofía", "Isabella", "Mariana", "Gabriela", "Sara", "Daniela", "Luciana", "Camila", "Salomé", "Antonella", "Juliana", "Laura", "María José", "Paula", "Manuela", "Ana Sofía", "Valeria", "Natalia", "Emily"];
    const NOM_M = ["Santiago", "Sebastián", "Matías", "Samuel", "Nicolás", "Alejandro", "Juan José", "Tomás", "Emmanuel", "Daniel", "Jerónimo", "Martín", "David", "Juan Esteban", "Miguel Ángel", "Andrés", "Felipe", "Julián", "Kevin", "Esteban"];
    const APE = ["Rodríguez", "Gómez", "González", "Martínez", "García", "López", "Hernández", "Sánchez", "Ramírez", "Pérez", "Díaz", "Muñoz", "Rojas", "Moreno", "Jiménez", "Vargas", "Castro", "Ortiz", "Rubio", "Suárez", "Cárdenas", "Prieto", "Barrera", "Quintero", "Mejía", "Bermúdez", "Cifuentes", "Lozano", "Arias", "Ospina"];
    const BARRIOS = ["Barrio Granada", "Barrio Kennedy", "Barrio Santander", "Barrio Alto del Rosario", "Barrio Sucre", "Barrio La Esperanza", "Barrio Portachuelo", "Barrio Gaitán", "Barrio Rosablanca", "Barrio Diamante"];
    const ahora = new Date().toISOString();
    const NOMBRES_G = ["Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Once"];
    const grados = NOMBRES_G.map((n, i) => ({ id: "g" + (i + 6), nombre: n, orden: i + 6 }));
    const cursos = [];
    grados.forEach((g) => [1, 2].forEach((k) => cursos.push({ id: `c${g.orden}${k}`, grado_id: g.id, nombre: `${g.orden}0${k}`, director: "" })));
    const anio = Number(U.hoy().slice(0, 4));
    const periodos = [
      { id: "p1", nombre: "Período 1", anio, fecha_inicio: `${anio}-01-26`, fecha_fin: `${anio}-04-05` },
      { id: "p2", nombre: "Período 2", anio, fecha_inicio: `${anio}-04-06`, fecha_fin: `${anio}-06-21` },
      { id: "p3", nombre: "Período 3", anio, fecha_inicio: `${anio}-06-22`, fecha_fin: `${anio}-09-13` },
      { id: "p4", nombre: "Período 4", anio, fecha_inicio: `${anio}-09-14`, fecha_fin: `${anio}-12-04` },
    ];
    const estudiantes = [];
    let doc = 1104700000;
    cursos.forEach((c) => {
      const g = grados.find((x) => x.id === c.grado_id);
      const n = 13 + Math.floor(azar() * 5);
      for (let i = 0; i < n; i++) {
        const mujer = azar() < 0.5;
        const ape = `${elegir(APE)} ${elegir(APE)}`;
        const nom = elegir(mujer ? NOM_F : NOM_M);
        if (estudiantes.some((e) => e.curso_id === c.id && e.apellidos === ape && e.nombres === nom)) { i--; continue; }
        doc += 1 + Math.floor(azar() * 900);
        const acuNom = `${elegir(azar() < 0.7 ? NOM_F : NOM_M)} ${ape.split(" ")[0]}`;
        estudiantes.push({
          id: U.uid(), tipo_documento: g.orden >= 11 && azar() < 0.3 ? "CC" : "TI", documento: String(doc),
          apellidos: ape, nombres: nom, edad: g.orden + 5 + Math.floor(azar() * 2), grado_id: g.id, curso_id: c.id,
          acudiente_nombre: acuNom, acudiente_parentesco: elegir(["Madre", "Padre", "Abuela", "Tía", "Madre", "Padre"]),
          acudiente_correo: azar() < 0.92 ? `${U.norm(acuNom).replace(/[^a-z]+/g, ".")}${Math.floor(azar() * 90 + 10)}@correo.com` : null,
          acudiente_telefono: `3${Math.floor(azar() * 3 + 10)}${String(Math.floor(azar() * 1e7)).padStart(7, "0")}`,
          direccion: `Calle ${Math.floor(azar() * 30 + 1)} # ${Math.floor(azar() * 20 + 1)}-${Math.floor(azar() * 90 + 10)}, ${elegir(BARRIOS)}`,
          estado: "activo", total_llegadas: 0, creado_en: ahora, actualizado_en: ahora,
        });
      }
    });
    // Propensión a llegar tarde: la mayoría casi nunca, algunos con frecuencia
    const prop = new Map(estudiantes.map((e) => { const r = azar(); return [e.id, r < 0.55 ? 0.004 : r < 0.85 ? 0.02 : r < 0.96 ? 0.06 : 0.13]; }));
    const DOCENTES = ["Coordinación de Convivencia", "Prof. Martha Herrera", "Prof. Carlos Ruiz"];
    const llegadas = [];
    const hoy = U.hoy();
    periodos.forEach((p) => {
      for (let f = p.fecha_inicio; f <= p.fecha_fin && f < hoy; f = U.sumarDias(f, 1)) {
        if (U.diaSemana(f) > 4) continue;
        const factorDia = [1.3, 0.9, 0.85, 0.9, 1.15][U.diaSemana(f)];
        estudiantes.forEach((e) => {
          if (azar() < prop.get(e.id) * factorDia) {
            const min = 31 + Math.floor(Math.pow(azar(), 1.8) * 60);
            const hora = `0${6 + Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}:${String(Math.floor(azar() * 60)).padStart(2, "0")}`;
            const g = grados.find((x) => x.id === e.grado_id), c = cursos.find((x) => x.id === e.curso_id);
            llegadas.push({ id: U.uid(), estudiante_id: e.id, fecha: f, hora, periodo_id: p.id, grado_id: g.id, curso_id: c.id,
              grado_nombre: g.nombre, curso_nombre: c.nombre, observacion: null, registrado_por_nombre: elegir(DOCENTES), creado_en: `${f}T${hora}-05:00` });
            e.total_llegadas++;
          }
        });
      }
    });
    // Notificaciones de ejemplo para reincidentes de períodos anteriores
    const notificaciones = [];
    periodos.filter((p) => p.fecha_fin < hoy).forEach((p) => {
      const cuenta = {};
      llegadas.filter((l) => l.periodo_id === p.id).forEach((l) => (cuenta[l.estudiante_id] = (cuenta[l.estudiante_id] || 0) + 1));
      Object.entries(cuenta).filter(([, n]) => n > 4).forEach(([id, n], i) => {
        const e = estudiantes.find((x) => x.id === id);
        if (!e.acudiente_correo || azar() < 0.2) return;
        const fechas = llegadas.filter((l) => l.periodo_id === p.id && l.estudiante_id === id).map((l) => l.fecha).sort();
        notificaciones.push({ id: U.uid(), estudiante_id: id, periodo_id: p.id, destinatario: e.acudiente_correo,
          asunto: `Notificación de llegadas tarde – ${e.nombres} ${e.apellidos} (${cursos.find((c) => c.id === e.curso_id).nombre}) – ${p.nombre} ${p.anio}`,
          cantidad_reportes: n, fechas, estado: i % 9 === 4 ? "rebotado" : azar() < 0.6 ? "abierto" : "entregado", proveedor: "simulación",
          error: i % 9 === 4 ? "Buzón inexistente (simulado)" : null, enviado_por_nombre: "Coordinación de Convivencia",
          enviado_en: `${U.sumarDias(fechas[fechas.length - 1], 1)}T15:20:00-05:00` });
      });
    });
    return {
      version: 1,
      config: { nombre_institucion: "Institución Educativa Demostración", sigla: "IED", nit: "", ciudad: "Girardot, Cundinamarca", direccion: "Carrera 10 # 20-30",
        telefono: "(601) 888 0000", correo_institucional: "convivencia@institucion.edu.co", responsable_nombre: "Coordinación de Convivencia",
        responsable_cargo: "Coordinador(a) de Convivencia", umbral_seguimiento: 4, zona_horaria: U.TZ, hora_limite_ingreso: "06:30", logo_url: "" },
      usuarios: [
        { id: "u-admin", nombre: "Administrador Demo", correo: "admin@demo.edu.co", password: "admin123", rol: "admin", activo: true, creado_en: ahora },
        { id: "u-doc", nombre: "Docente Demo", correo: "docente@demo.edu.co", password: "docente123", rol: "docente", activo: true, creado_en: ahora },
      ],
      periodos, grados, cursos, estudiantes, llegadas, notificaciones, auditoria: [],
    };
  }

  /* ---------------- Interfaz pública ---------------- */
  const B = (LT.backendDemo = {
    modo: "demo",
    async init() {
      db = leer() || semilla();
      guardar();
      try { const id = sessionStorage.getItem(SESION); usuario = db.usuarios.find((u) => u.id === id && u.activo) || null; } catch (e) { usuario = null; }
    },
    reiniciar() { db = semilla(); guardar(); },
    cuentasDemo: { admin: ["admin@demo.edu.co", "admin123"], docente: ["docente@demo.edu.co", "docente123"] },

    // ---- Autenticación
    async login(correo, password) {
      await U.sleep(200);
      const u = db.usuarios.find((x) => x.correo === String(correo).trim().toLowerCase());
      if (!u || u.password !== password) fallo("Correo o contraseña incorrectos");
      if (!u.activo) fallo("Su cuenta está inactiva. Comuníquese con el administrador.");
      usuario = u;
      try { sessionStorage.setItem(SESION, u.id); } catch (e) { /* sin almacenamiento */ }
      return perfil(u);
    },
    async logout() { usuario = null; try { sessionStorage.removeItem(SESION); } catch (e) { /* */ } },
    usuarioActual() { return usuario ? perfil(usuario) : null; },
    async recuperarClave() { fallo("En modo demostración no se envían correos. Use las cuentas de ejemplo."); },
    async cambiarClave(nueva) { reqUsuario(); usuario.password = nueva; guardar(); },
    alRecuperarClave() {},
    suscribir(cb) {
      window.addEventListener("storage", (e) => { if (e.key === CLAVE) { db = leer() || db; cb("externo"); } });
    },

    // ---- Catálogos y configuración
    async catalogos() {
      reqUsuario();
      return clonar({
        config: db.config,
        periodos: [...db.periodos].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)),
        grados: [...db.grados].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
        cursos: [...db.cursos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true })),
      });
    },
    async guardarConfig(c) {
      reqAdmin();
      const umbral = Number(c.umbral_seguimiento);
      if (!(umbral >= 1 && umbral <= 100)) fallo("El límite de seguimiento debe estar entre 1 y 100");
      db.config = { ...db.config, ...c, umbral_seguimiento: umbral };
      auditar("configuracion", "UPDATE", "1", c); guardar();
    },
    async guardarPeriodo(p) {
      reqAdmin();
      if (!p.nombre || !p.fecha_inicio || !p.fecha_fin) fallo("Complete nombre y fechas");
      if (p.fecha_fin < p.fecha_inicio) fallo("La fecha final debe ser posterior a la inicial");
      if (db.periodos.some((x) => x.id !== p.id && x.anio === Number(p.anio) && U.norm(x.nombre) === U.norm(p.nombre))) fallo("Ya existe un período con ese nombre en ese año");
      if (db.periodos.some((x) => x.id !== p.id && !(p.fecha_fin < x.fecha_inicio || p.fecha_inicio > x.fecha_fin))) fallo("Las fechas se cruzan con otro período");
      const reg = { ...p, anio: Number(p.anio) };
      if (p.id) Object.assign(db.periodos.find((x) => x.id === p.id), reg); else db.periodos.push({ ...reg, id: U.uid() });
      guardar();
    },
    async eliminarPeriodo(id) {
      reqAdmin();
      if (db.llegadas.some((l) => l.periodo_id === id)) fallo("No se puede eliminar: el período tiene llegadas tarde registradas");
      db.periodos = db.periodos.filter((x) => x.id !== id); guardar();
    },
    async guardarGrado(g) {
      reqAdmin();
      if (!String(g.nombre || "").trim()) fallo("El nombre del grado es obligatorio");
      if (db.grados.some((x) => x.id !== g.id && U.norm(x.nombre) === U.norm(g.nombre))) fallo("Ya existe un grado con ese nombre");
      const reg = { nombre: g.nombre.trim(), orden: Number(g.orden) || 0 };
      if (g.id) Object.assign(db.grados.find((x) => x.id === g.id), reg); else db.grados.push({ ...reg, id: U.uid() });
      guardar();
    },
    async eliminarGrado(id) {
      reqAdmin();
      if (db.cursos.some((c) => c.grado_id === id)) fallo("No se puede eliminar: el grado tiene cursos. Elimínelos primero.");
      db.grados = db.grados.filter((x) => x.id !== id); guardar();
    },
    async guardarCurso(c) {
      reqAdmin();
      if (!c.grado_id || !String(c.nombre || "").trim()) fallo("Seleccione el grado y escriba el nombre del curso");
      if (db.cursos.some((x) => x.id !== c.id && x.grado_id === c.grado_id && U.norm(x.nombre) === U.norm(c.nombre))) fallo("Ese curso ya existe en el grado");
      const reg = { grado_id: c.grado_id, nombre: c.nombre.trim(), director: c.director || "" };
      if (c.id) {
        Object.assign(db.cursos.find((x) => x.id === c.id), reg);
        db.estudiantes.filter((e) => e.curso_id === c.id).forEach((e) => (e.grado_id = reg.grado_id));
      } else db.cursos.push({ ...reg, id: U.uid() });
      guardar();
    },
    async eliminarCurso(id) {
      reqAdmin();
      if (db.estudiantes.some((e) => e.curso_id === id)) fallo("No se puede eliminar: el curso tiene estudiantes asignados");
      db.cursos = db.cursos.filter((x) => x.id !== id); guardar();
    },

    // ---- Estudiantes
    async estudiantes() {
      reqUsuario();
      const lista = clonar(db.estudiantes);
      return usuario.rol === "admin" ? lista : lista.map(basico);
    },
    async guardarEstudiante(e) {
      reqAdmin();
      const curso = db.cursos.find((c) => c.id === e.curso_id);
      if (!curso) fallo("Seleccione un curso válido");
      const reg = {
        tipo_documento: e.tipo_documento || "TI", documento: U.limpiarDocumento(e.documento),
        apellidos: String(e.apellidos || "").trim().replace(/\s+/g, " "), nombres: String(e.nombres || "").trim().replace(/\s+/g, " "),
        edad: e.edad === "" || e.edad == null ? null : Number(e.edad), grado_id: curso.grado_id, curso_id: curso.id,
        acudiente_nombre: String(e.acudiente_nombre || "").trim(), acudiente_parentesco: e.acudiente_parentesco || null,
        acudiente_correo: String(e.acudiente_correo || "").trim().toLowerCase() || null,
        acudiente_telefono: String(e.acudiente_telefono || "").trim() || null, direccion: String(e.direccion || "").trim() || null,
        estado: e.estado || "activo",
      };
      if (!U.validarDocumento(reg.documento)) fallo("Documento inválido (3 a 20 letras o números)");
      if (!reg.nombres) fallo("El nombre del estudiante es obligatorio");
      if (reg.edad != null && !(reg.edad >= 3 && reg.edad <= 30)) fallo("Edad fuera de rango (3 a 30)");
      if (reg.acudiente_correo && !U.validarCorreo(reg.acudiente_correo)) fallo("Correo del acudiente inválido");
      if (db.estudiantes.some((x) => x.id !== e.id && x.documento === reg.documento)) fallo(`Ya existe un estudiante con el documento ${reg.documento}`);
      if (db.estudiantes.some((x) => x.id !== e.id && x.curso_id === reg.curso_id && U.norm(x.apellidos) === U.norm(reg.apellidos) && U.norm(x.nombres) === U.norm(reg.nombres)))
        fallo("Ya existe otro estudiante con el mismo nombre en ese curso");
      const ahora = new Date().toISOString();
      if (e.id) {
        const x = db.estudiantes.find((y) => y.id === e.id);
        auditar("estudiantes", "UPDATE", e.id, { antes: clonar(x), despues: reg });
        Object.assign(x, reg, { actualizado_en: ahora });
        guardar(); return clonar(x);
      }
      const nuevo = { ...reg, id: U.uid(), total_llegadas: 0, creado_en: ahora, actualizado_en: ahora };
      db.estudiantes.push(nuevo); guardar(); return clonar(nuevo);
    },
    async eliminarEstudiante(id) {
      reqAdmin();
      const x = db.estudiantes.find((y) => y.id === id);
      auditar("estudiantes", "DELETE", id, clonar(x));
      db.estudiantes = db.estudiantes.filter((y) => y.id !== id);
      db.llegadas = db.llegadas.filter((l) => l.estudiante_id !== id);
      db.notificaciones = db.notificaciones.filter((n) => n.estudiante_id !== id);
      guardar();
    },
    async importarEstudiantes(filas, crearFaltantes) {
      reqAdmin();
      let insertados = 0, actualizados = 0; const errores = [];
      for (const [i, f] of filas.entries()) {
        try {
          const cat = { grados: db.grados, cursos: db.cursos };
          let { grado, curso } = U.resolverCurso(cat, f.grado, f.curso);
          if (!curso && crearFaltantes && String(f.grado || "").trim() && String(f.curso || "").trim()) {
            if (!grado) { grado = { id: U.uid(), nombre: String(f.grado).trim(), orden: Number(String(f.grado).replace(/\D/g, "")) || 0 }; db.grados.push(grado); }
            curso = { id: U.uid(), grado_id: grado.id, nombre: String(f.curso).trim(), director: "" }; db.cursos.push(curso);
          }
          if (!curso) fallo(`Grado "${f.grado || ""}" / curso "${f.curso || ""}" no existe`);
          const doc = U.limpiarDocumento(f.documento);
          const previo = db.estudiantes.find((x) => x.documento === doc);
          const datos = {
            id: previo ? previo.id : undefined, documento: doc, tipo_documento: String(f.tipo_documento || (previo && previo.tipo_documento) || "TI").toUpperCase(),
            apellidos: f.apellidos || "", nombres: f.nombres, edad: f.edad === "" || f.edad == null ? (previo ? previo.edad : null) : Math.round(Number(f.edad)), curso_id: curso.id,
            acudiente_nombre: f.acudiente_nombre || (previo && previo.acudiente_nombre) || "", acudiente_parentesco: f.acudiente_parentesco || (previo && previo.acudiente_parentesco) || null,
            acudiente_correo: f.acudiente_correo || (previo && previo.acudiente_correo) || null, acudiente_telefono: f.acudiente_telefono || (previo && previo.acudiente_telefono) || null,
            direccion: f.direccion || (previo && previo.direccion) || null, estado: "activo",
          };
          if (!U.TIPOS_DOC[datos.tipo_documento]) fallo("Tipo de documento inválido");
          await B.guardarEstudiante(datos);
          previo ? actualizados++ : insertados++;
        } catch (e) { errores.push({ fila: f._fila || i + 1, documento: f.documento, mensaje: e.message }); }
      }
      auditar("estudiantes", "IMPORTACION", null, { filas: filas.length, insertados, actualizados, errores: errores.length });
      guardar();
      return { insertados, actualizados, errores };
    },

    // ---- Llegadas tarde
    async reportarLlegadas(ids, observacion, fecha, hora) {
      reqUsuario();
      const a = U.ahora();
      const f = usuario.rol === "admin" && fecha ? fecha : a.fecha;
      const h = usuario.rol === "admin" && hora ? (hora.length === 5 ? hora + ":00" : hora) : a.hora;
      const periodo = U.periodoDe(f, db.periodos);
      const resultado = ids.map((id) => {
        const e = db.estudiantes.find((x) => x.id === id);
        if (!e) return { estudiante_id: id, estado: "error", mensaje: "Estudiante no encontrado" };
        if (e.estado !== "activo") return { estudiante_id: id, estado: "error", mensaje: "El estudiante está retirado" };
        if (!periodo) return { estudiante_id: id, estado: "error", mensaje: `No hay un período académico configurado para la fecha ${f}` };
        if (db.llegadas.some((l) => l.estudiante_id === id && l.fecha === f)) return { estudiante_id: id, estado: "duplicado", mensaje: "Ya tenía reporte de llegada tarde en esa jornada" };
        const g = db.grados.find((x) => x.id === e.grado_id), c = db.cursos.find((x) => x.id === e.curso_id);
        const l = { id: U.uid(), estudiante_id: id, fecha: f, hora: h, periodo_id: periodo.id, grado_id: g.id, curso_id: c.id, grado_nombre: g.nombre, curso_nombre: c.nombre,
          observacion: String(observacion || "").trim() || null, registrado_por_nombre: usuario.nombre, creado_en: new Date().toISOString() };
        db.llegadas.push(l); e.total_llegadas++;
        return { estudiante_id: id, estado: "registrado", mensaje: "Reporte registrado", llegada_id: l.id };
      });
      guardar();
      return resultado;
    },
    async llegadas(f = {}) {
      reqUsuario();
      return clonar(db.llegadas.filter((l) =>
        (!f.periodoId || l.periodo_id === f.periodoId) && (!f.estudianteId || l.estudiante_id === f.estudianteId) &&
        (!f.desde || l.fecha >= f.desde) && (!f.hasta || l.fecha <= f.hasta)));
    },
    async eliminarLlegada(id) {
      reqAdmin();
      const l = db.llegadas.find((x) => x.id === id);
      if (!l) return;
      auditar("llegadas_tarde", "DELETE", id, clonar(l));
      db.llegadas = db.llegadas.filter((x) => x.id !== id);
      const e = db.estudiantes.find((x) => x.id === l.estudiante_id);
      if (e) e.total_llegadas = Math.max(0, e.total_llegadas - 1);
      guardar();
    },

    // ---- Notificaciones
    async notificaciones(f = {}) {
      reqUsuario();
      return clonar(db.notificaciones.filter((n) => (!f.periodoId || n.periodo_id === f.periodoId) && (!f.estudianteId || n.estudiante_id === f.estudianteId))
        .sort((a, b) => b.enviado_en.localeCompare(a.enviado_en)));
    },
    async notificar(estudianteId, periodoId, { modo = "previsualizar", forzar = false } = {}) {
      reqUsuario();
      const e = db.estudiantes.find((x) => x.id === estudianteId);
      const p = db.periodos.find((x) => x.id === periodoId);
      if (!e) fallo("Estudiante no encontrado");
      if (!p) fallo("Período no encontrado");
      const ll = db.llegadas.filter((l) => l.estudiante_id === estudianteId && l.periodo_id === periodoId).sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (!ll.length) fallo("El estudiante no tiene llegadas tarde en ese período");
      if (!e.acudiente_correo) fallo("El estudiante no tiene correo de acudiente registrado");
      const c = db.config;
      const correo = LT.plantillaCorreo({
        institucion: { nombre: c.nombre_institucion, ciudad: c.ciudad, telefono: c.telefono, correo: c.correo_institucional, responsable: c.responsable_nombre, cargo: c.responsable_cargo, logo: c.logo_url },
        estudiante: { nombre: `${e.nombres} ${e.apellidos}`.trim(), documento: e.documento, tipo: e.tipo_documento,
          grado: db.grados.find((g) => g.id === e.grado_id).nombre, curso: db.cursos.find((x) => x.id === e.curso_id).nombre },
        acudiente: { nombre: e.acudiente_nombre, parentesco: e.acudiente_parentesco, correo: e.acudiente_correo, telefono: e.acudiente_telefono, direccion: e.direccion },
        periodo: { nombre: p.nombre, anio: p.anio }, llegadas: ll, umbral: c.umbral_seguimiento,
      });
      const visible = usuario.rol === "admin" ? e.acudiente_correo : e.acudiente_correo.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
      if (modo === "previsualizar") return { asunto: correo.asunto, html: correo.html, destinatario: visible, cantidad: ll.length };
      const hace20h = new Date(Date.now() - 20 * 3600e3).toISOString();
      if (!forzar && db.notificaciones.some((n) => n.estudiante_id === estudianteId && n.periodo_id === periodoId && ["enviado", "entregado", "abierto"].includes(n.estado) && n.enviado_en >= hace20h)) {
        const err = new Error("Ya se envió una notificación a este acudiente en las últimas horas."); err.requiereConfirmacion = true; throw err;
      }
      await U.sleep(500);
      const n = { id: U.uid(), estudiante_id: estudianteId, periodo_id: periodoId, destinatario: e.acudiente_correo, asunto: correo.asunto,
        cantidad_reportes: ll.length, fechas: ll.map((l) => l.fecha), estado: "enviado", proveedor: "simulación", error: null,
        enviado_por_nombre: usuario.nombre, enviado_en: new Date().toISOString() };
      db.notificaciones.unshift(n);
      auditar("notificaciones", "ENVIO", n.id, { estudianteId, periodoId });
      guardar();
      // Simula el aviso de entrega del proveedor de correo
      setTimeout(() => { const x = (db.notificaciones || []).find((y) => y.id === n.id); if (x && x.estado === "enviado") { x.estado = "entregado"; guardar(); } }, 4000);
      return { ok: true, estado: "enviado", id: n.id, destinatario: visible };
    },

    // ---- Usuarios y auditoría
    async usuarios() { reqAdmin(); return db.usuarios.map(perfil); },
    async crearUsuario({ correo, nombre, rol, password }) {
      reqAdmin();
      correo = String(correo || "").trim().toLowerCase();
      if (!U.validarCorreo(correo)) fallo("Correo inválido");
      if (!String(nombre || "").trim()) fallo("El nombre es obligatorio");
      if (String(password || "").length < 8) fallo("La contraseña debe tener al menos 8 caracteres");
      if (db.usuarios.some((u) => u.correo === correo)) fallo("Ya existe un usuario con ese correo");
      const u = { id: U.uid(), correo, nombre: nombre.trim(), rol: rol === "admin" ? "admin" : "docente", password, activo: true, creado_en: new Date().toISOString() };
      db.usuarios.push(u); auditar("usuarios", "CREAR", u.id, { correo, rol: u.rol }); guardar();
    },
    async actualizarUsuario(id, cambios) {
      reqAdmin();
      if (id === usuario.id && (cambios.rol === "docente" || cambios.activo === false)) fallo("No puede quitarse a sí mismo el rol de administrador ni desactivarse");
      const u = db.usuarios.find((x) => x.id === id);
      Object.assign(u, cambios); auditar("usuarios", "ACTUALIZAR", id, cambios); guardar();
    },
    async restablecerClave(id, password) {
      reqAdmin();
      if (String(password || "").length < 8) fallo("La contraseña debe tener al menos 8 caracteres");
      db.usuarios.find((x) => x.id === id).password = password; auditar("usuarios", "RESTABLECER_CLAVE", id, {}); guardar();
    },
    async eliminarUsuario(id) {
      reqAdmin();
      if (id === usuario.id) fallo("No puede eliminar su propia cuenta");
      db.usuarios = db.usuarios.filter((x) => x.id !== id); auditar("usuarios", "ELIMINAR", id, {}); guardar();
    },
    async auditoria() { reqAdmin(); return clonar(db.auditoria.slice(0, 300)); },
  });
})();
