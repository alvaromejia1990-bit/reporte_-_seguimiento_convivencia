/* =========================================================================
   Backend de PRODUCCIÓN con Google: Apps Script + Hoja de cálculo en Drive
   + envío de correos con Gmail. Toda la validación y los permisos se aplican
   en el servidor (google-apps-script/Codigo.gs); este archivo solo traduce
   las llamadas de la interfaz a solicitudes HTTPS.
   ========================================================================= */
(function () {
  "use strict";
  const LT = window.LT;
  const CLAVE_TOKEN = "lt_google_token";
  let token = null;
  let perfilActual = null;
  let alDebeCambiar = null;
  let ultimaVersion = null;

  const leerToken = () => { try { return localStorage.getItem(CLAVE_TOKEN); } catch (e) { return token; } };
  const guardarToken = (t) => { token = t; try { t ? localStorage.setItem(CLAVE_TOKEN, t) : localStorage.removeItem(CLAVE_TOKEN); } catch (e) { /* solo en memoria */ } };
  const sitio = () => location.origin + location.pathname;

  /* Llamada al servidor. Se usa text/plain para evitar la verificación previa (CORS) de Apps Script. */
  async function llamar(accion, datos = {}, { reintentos = 1 } = {}) {
    const url = window.LT_CONFIG.GOOGLE_SCRIPT_URL;
    let r;
    try {
      r = await fetch(url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ accion, token, datos }) });
    } catch (e) {
      if (reintentos > 0) { await LT.util.sleep(800); return llamar(accion, datos, { reintentos: reintentos - 1 }); }
      throw new Error("Sin conexión con el servidor de Google. Verifique su internet.");
    }
    let j;
    try { j = await r.json(); } catch (e) {
      throw new Error("El servidor de Google no respondió correctamente. Verifique la URL en js/config.js y que la implementación tenga acceso para «Cualquier usuario».");
    }
    if (!j.ok) {
      const err = new Error(j.error || "Error en el servidor");
      err.codigo = j.codigo;
      if (j.requiereConfirmacion) err.requiereConfirmacion = true;
      if (j.codigo === "SESION" && accion !== "login") { guardarToken(null); perfilActual = null; setTimeout(() => location.reload(), 2500); }
      throw err;
    }
    return j.data;
  }

  function iniciarSesion(r) {
    guardarToken(r.token);
    perfilActual = r.usuario;
    if (perfilActual.debe_cambiar && alDebeCambiar) setTimeout(alDebeCambiar, 400);
    return perfilActual;
  }

  LT.backendGoogle = {
    modo: "google",
    async init() {
      token = leerToken();
      if (!token) return;
      try { perfilActual = await llamar("sesion"); }
      catch (e) { if (e.codigo === "SESION") { guardarToken(null); perfilActual = null; } else throw e; }
    },

    // ---- Autenticación
    async login(correo, password) {
      return iniciarSesion(await llamar("login", { correo: String(correo).trim(), password }));
    },
    async logout() { guardarToken(null); perfilActual = null; },
    usuarioActual() { return perfilActual; },
    async recuperarClave(correo) { await llamar("recuperarClave", { correo: String(correo).trim(), sitio: sitio() }); },
    async cambiarClave(nueva) { const r = await llamar("cambiarClave", { password: nueva }); guardarToken(r.token); perfilActual = r.usuario; },
    // Usuarios con contraseña temporal deben definir una nueva al ingresar
    alRecuperarClave(cb) {
      alDebeCambiar = cb;
      if (perfilActual && perfilActual.debe_cambiar) setTimeout(cb, 400);
    },
    // Sincronización: consulta cada 20 s si otro usuario cambió los datos
    suscribir(cb) {
      setInterval(async () => {
        if (!perfilActual || document.hidden) return;
        try {
          const v = await llamar("version", {}, { reintentos: 0 });
          if (ultimaVersion !== null && v !== ultimaVersion) cb("externo");
          ultimaVersion = v;
        } catch (e) { /* se reintenta en el siguiente ciclo */ }
      }, 20000);
    },

    // ---- Catálogos y configuración
    catalogos: () => llamar("catalogos"),
    guardarConfig: (c) => llamar("guardarConfig", c),
    guardarPeriodo: (p) => llamar("guardarPeriodo", p),
    eliminarPeriodo: (id) => llamar("eliminarPeriodo", { id }),
    guardarGrado: (g) => llamar("guardarGrado", g),
    eliminarGrado: (id) => llamar("eliminarGrado", { id }),
    guardarCurso: (c) => llamar("guardarCurso", c),
    eliminarCurso: (id) => llamar("eliminarCurso", { id }),

    // ---- Estudiantes
    estudiantes: () => llamar("estudiantes"),
    guardarEstudiante: (e) => llamar("guardarEstudiante", e),
    eliminarEstudiante: (id) => llamar("eliminarEstudiante", { id }),
    async importarEstudiantes(filas, crearFaltantes) {
      // Lotes de 500 filas para no exceder el tiempo máximo de cada solicitud
      const total = { insertados: 0, actualizados: 0, errores: [] };
      for (let i = 0; i < filas.length; i += 500) {
        const r = await llamar("importarEstudiantes", { filas: filas.slice(i, i + 500), crearFaltantes: !!crearFaltantes });
        total.insertados += r.insertados; total.actualizados += r.actualizados; total.errores.push(...r.errores);
      }
      return total;
    },

    // ---- Llegadas tarde
    reportarLlegadas: (ids, observacion, fecha, hora) => llamar("reportarLlegadas", { ids, observacion: observacion || "", fecha: fecha || null, hora: hora || null }),
    llegadas: (f = {}) => llamar("llegadas", f),
    eliminarLlegada: (id) => llamar("eliminarLlegada", { id }),

    // ---- Notificaciones (envío real con Gmail)
    notificaciones: (f = {}) => llamar("notificaciones", f),
    notificar: (estudianteId, periodoId, { modo = "previsualizar", forzar = false } = {}) =>
      llamar("notificar", { estudianteId, periodoId, modo, forzar }),

    // ---- Usuarios y auditoría
    usuarios: () => llamar("usuarios"),
    crearUsuario: (d) => llamar("crearUsuario", { ...d, sitio: sitio() }),
    actualizarUsuario: (id, cambios) => llamar("actualizarUsuario", { id, ...cambios }),
    restablecerClave: (id, password) => llamar("restablecerClave", { id, password }),
    eliminarUsuario: (id) => llamar("eliminarUsuario", { id }),
    auditoria: () => llamar("auditoria"),
  };
})();
