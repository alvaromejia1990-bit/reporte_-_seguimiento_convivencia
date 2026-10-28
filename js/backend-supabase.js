/* =========================================================================
   Backend de PRODUCCIÓN: Supabase (PostgreSQL + Auth + Edge Functions)
   Toda la seguridad se aplica en el servidor (RLS y funciones); este archivo
   solo traduce las llamadas de la interfaz.
   ========================================================================= */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  let sb = null;
  let perfilActual = null;
  // Enlace de recuperación de contraseña (llega con #...type=recovery)
  const vieneDeRecuperacion = /type=recovery/.test(location.hash + location.search);

  /* Traduce errores de PostgreSQL / PostgREST a mensajes comprensibles */
  function traducir(error) {
    if (!error) return null;
    const m = String(error.message || error.details || error);
    const c = error.code || "";
    if (c === "23505" || /duplicate key/.test(m)) {
      if (/documento/.test(m)) return "Ya existe un estudiante con ese número de documento";
      if (/nombre_curso/.test(m)) return "Ya existe otro estudiante con el mismo nombre en ese curso";
      if (/llegadas_una_por_dia/.test(m)) return "El estudiante ya tiene un reporte en esa jornada";
      if (/periodos_nombre/.test(m)) return "Ya existe un período con ese nombre en ese año";
      if (/grados_nombre/.test(m)) return "Ya existe un grado con ese nombre";
      if (/cursos_nombre/.test(m)) return "Ese curso ya existe en el grado";
      return "El registro ya existe";
    }
    if (c === "23P01" || /periodos_sin_solape/.test(m)) return "Las fechas se cruzan con otro período";
    if (c === "23503" || /foreign key/.test(m)) {
      if (/llegadas_tarde/.test(m)) return "No se puede eliminar: tiene llegadas tarde registradas";
      if (/estudiantes/.test(m)) return "No se puede eliminar: tiene estudiantes asignados";
      if (/cursos/.test(m)) return "No se puede eliminar: el grado tiene cursos. Elimínelos primero.";
      return "No se puede completar: hay registros relacionados";
    }
    if (c === "23514" || /check constraint/.test(m)) {
      if (/acudiente_correo/.test(m)) return "Correo del acudiente inválido";
      if (/documento_formato/.test(m)) return "Documento inválido (3 a 20 letras o números)";
      if (/edad/.test(m)) return "Edad fuera de rango (3 a 30)";
      if (/rango_valido/.test(m)) return "La fecha final debe ser posterior a la inicial";
      return "Algún dato no cumple las reglas de validación";
    }
    if (c === "42501" || /row-level security|permission denied/.test(m)) return "No tiene permisos para realizar esta acción";
    if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos";
    if (/Email not confirmed/i.test(m)) return "Debe confirmar su correo antes de ingresar";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión con el servidor. Verifique su internet.";
    if (/JWT expired/i.test(m)) return "Su sesión venció. Ingrese de nuevo.";
    return m;
  }
  const chequear = ({ data, error }) => { if (error) throw new Error(traducir(error)); return data; };

  /* Lee todas las filas superando el límite de 1000 por consulta.
     Cada consulta paginada termina en .order("id") para que el orden sea estable entre páginas. */
  async function todo(construir, tam = 1000) {
    const filas = [];
    for (let desde = 0; ; desde += tam) {
      const lote = chequear(await construir().range(desde, desde + tam - 1));
      filas.push(...lote);
      if (lote.length < tam) break;
    }
    return filas;
  }

  async function invocar(funcion, cuerpo) {
    const { data, error } = await sb.functions.invoke(funcion, { body: cuerpo });
    if (error) {
      let info = null;
      try { info = await error.context.json(); } catch (e) { /* sin cuerpo */ }
      const err = new Error((info && info.error) || traducir(error) || "Error en el servidor");
      if (info && info.requiereConfirmacion) err.requiereConfirmacion = true;
      throw err;
    }
    return data;
  }

  async function cargarPerfil(user) {
    if (!user) { perfilActual = null; return null; }
    const p = chequear(await sb.from("perfiles").select("*").eq("id", user.id).maybeSingle());
    perfilActual = p && p.activo ? { id: p.id, nombre: p.nombre || p.correo, correo: p.correo, rol: p.rol, activo: p.activo } : null;
    return p;
  }
  const esAdmin = () => perfilActual && perfilActual.rol === "admin";

  LT.backendSupabase = {
    modo: "supabase",
    async init() {
      const cfg = window.LT_CONFIG;
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data } = await sb.auth.getSession();
      if (data.session) {
        try { await cargarPerfil(data.session.user); } catch (e) { perfilActual = null; }
      }
    },

    // ---- Autenticación
    async login(correo, password) {
      chequear(await sb.auth.signInWithPassword({ email: String(correo).trim(), password }));
      const { data } = await sb.auth.getUser();
      const p = await cargarPerfil(data.user);
      if (!p || !p.activo) {
        await sb.auth.signOut();
        throw new Error("Su cuenta aún no está activa. Solicite al administrador que la habilite.");
      }
      return perfilActual;
    },
    async logout() { await sb.auth.signOut(); perfilActual = null; },
    usuarioActual() { return perfilActual; },
    async recuperarClave(correo) {
      chequear(await sb.auth.resetPasswordForEmail(String(correo).trim(), { redirectTo: location.origin + location.pathname }));
    },
    async cambiarClave(nueva) { chequear(await sb.auth.updateUser({ password: nueva })); },
    alRecuperarClave(cb) {
      let avisado = false;
      const avisar = () => { if (!avisado) { avisado = true; setTimeout(cb, 300); } };
      if (vieneDeRecuperacion) avisar();
      sb.auth.onAuthStateChange((evento) => { if (evento === "PASSWORD_RECOVERY") avisar(); });
    },
    suscribir(cb) {
      sb.channel("cambios-llegadas")
        .on("postgres_changes", { event: "*", schema: "public", table: "llegadas_tarde" }, () => cb("llegadas"))
        .on("postgres_changes", { event: "*", schema: "public", table: "notificaciones" }, () => cb("notificaciones"))
        .subscribe();
    },

    // ---- Catálogos y configuración
    async catalogos() {
      const [config, periodos, grados, cursos] = await Promise.all([
        sb.from("configuracion").select("*").eq("id", 1).maybeSingle().then(chequear),
        sb.from("periodos").select("*").order("fecha_inicio").then(chequear),
        sb.from("grados").select("*").order("orden").order("nombre").then(chequear),
        sb.from("cursos").select("*").then(chequear),
      ]);
      cursos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
      return { config: config || {}, periodos, grados, cursos };
    },
    async guardarConfig(c) {
      const { id, actualizado_en, ...datos } = c;
      chequear(await sb.from("configuracion").update(datos).eq("id", 1));
    },
    async guardarPeriodo(p) {
      const datos = { nombre: p.nombre, anio: Number(p.anio), fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin };
      chequear(p.id ? await sb.from("periodos").update(datos).eq("id", p.id) : await sb.from("periodos").insert(datos));
    },
    async eliminarPeriodo(id) { chequear(await sb.from("periodos").delete().eq("id", id)); },
    async guardarGrado(g) {
      const datos = { nombre: String(g.nombre).trim(), orden: Number(g.orden) || 0 };
      chequear(g.id ? await sb.from("grados").update(datos).eq("id", g.id) : await sb.from("grados").insert(datos));
    },
    async eliminarGrado(id) { chequear(await sb.from("grados").delete().eq("id", id)); },
    async guardarCurso(c) {
      const datos = { grado_id: c.grado_id, nombre: String(c.nombre).trim(), director: c.director || null };
      if (c.id) {
        chequear(await sb.from("cursos").update(datos).eq("id", c.id));
        // Mantener el grado de los estudiantes del curso (el disparador lo recalcula)
        chequear(await sb.from("estudiantes").update({ curso_id: c.id }).eq("curso_id", c.id));
      } else chequear(await sb.from("cursos").insert(datos));
    },
    async eliminarCurso(id) { chequear(await sb.from("cursos").delete().eq("id", id)); },

    // ---- Estudiantes
    async estudiantes() {
      return esAdmin()
        ? todo(() => sb.from("estudiantes").select("*").order("apellidos").order("nombres").order("id"))
        : todo(() => sb.from("v_estudiantes_basico").select("*").order("apellidos").order("nombres").order("id"));
    },
    async guardarEstudiante(e) {
      const datos = {
        tipo_documento: e.tipo_documento || "TI", documento: U.limpiarDocumento(e.documento), apellidos: e.apellidos || "", nombres: e.nombres,
        edad: e.edad === "" || e.edad == null ? null : Number(e.edad), curso_id: e.curso_id, grado_id: e.grado_id,
        acudiente_nombre: e.acudiente_nombre || "", acudiente_parentesco: e.acudiente_parentesco || null, acudiente_correo: e.acudiente_correo || null,
        acudiente_telefono: e.acudiente_telefono || null, direccion: e.direccion || null, estado: e.estado || "activo",
      };
      return chequear(e.id
        ? await sb.from("estudiantes").update(datos).eq("id", e.id).select().single()
        : await sb.from("estudiantes").insert(datos).select().single());
    },
    async eliminarEstudiante(id) { chequear(await sb.from("estudiantes").delete().eq("id", id)); },
    async importarEstudiantes(filas, crearFaltantes) {
      // Se envía por lotes para no exceder el tamaño de la solicitud
      const total = { insertados: 0, actualizados: 0, errores: [] };
      for (let i = 0; i < filas.length; i += 400) {
        const r = chequear(await sb.rpc("importar_estudiantes", { p_filas: filas.slice(i, i + 400), p_crear_faltantes: !!crearFaltantes }));
        total.insertados += r.insertados; total.actualizados += r.actualizados; total.errores.push(...r.errores);
      }
      return total;
    },

    // ---- Llegadas tarde
    async reportarLlegadas(ids, observacion, fecha, hora) {
      return chequear(await sb.rpc("reportar_llegadas", {
        p_estudiantes: ids, p_observacion: observacion || null, p_fecha: fecha || null, p_hora: hora || null,
      }));
    },
    async llegadas(f = {}) {
      return todo(() => {
        let q = sb.from("llegadas_tarde").select("*").order("fecha").order("hora").order("id");
        if (f.periodoId) q = q.eq("periodo_id", f.periodoId);
        if (f.estudianteId) q = q.eq("estudiante_id", f.estudianteId);
        if (f.desde) q = q.gte("fecha", f.desde);
        if (f.hasta) q = q.lte("fecha", f.hasta);
        return q;
      });
    },
    async eliminarLlegada(id) { chequear(await sb.from("llegadas_tarde").delete().eq("id", id)); },

    // ---- Notificaciones (envío real mediante la función de servidor)
    async notificaciones(f = {}) {
      return todo(() => {
        let q = sb.from("notificaciones").select("*").order("enviado_en", { ascending: false }).order("id");
        if (f.periodoId) q = q.eq("periodo_id", f.periodoId);
        if (f.estudianteId) q = q.eq("estudiante_id", f.estudianteId);
        return q;
      });
    },
    async notificar(estudianteId, periodoId, { modo = "previsualizar", forzar = false } = {}) {
      return invocar("notificar-acudiente", { estudiante_id: estudianteId, periodo_id: periodoId, modo, forzar });
    },

    // ---- Usuarios y auditoría
    async usuarios() { return chequear(await sb.from("perfiles").select("*").order("nombre")); },
    async crearUsuario(d) { return invocar("gestionar-usuarios", { accion: "crear", ...d }); },
    async actualizarUsuario(id, cambios) { return invocar("gestionar-usuarios", { accion: "actualizar", id, ...cambios }); },
    async restablecerClave(id, password) { return invocar("gestionar-usuarios", { accion: "restablecer", id, password }); },
    async eliminarUsuario(id) { return invocar("gestionar-usuarios", { accion: "eliminar", id }); },
    async auditoria() { return chequear(await sb.from("auditoria").select("*").order("fecha", { ascending: false }).limit(300)); },
  };
})();
