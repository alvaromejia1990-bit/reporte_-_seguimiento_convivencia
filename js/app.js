/* Aplicación principal: sesión, navegación y estado compartido */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const cfg = window.LT_CONFIG || {};
  const usarSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  const estado = (LT.estado = { backend: usarSupabase ? LT.backendSupabase : LT.backendDemo, usuario: null, cat: null, cacheEst: null, vista: null });
  const esAdmin = () => estado.usuario && estado.usuario.rol === "admin";

  LT.app = {
    esAdmin,
    get b() { return estado.backend; },
    umbral: () => Number((estado.cat && estado.cat.config.umbral_seguimiento) || 4),
    async recargarCatalogos() {
      estado.cat = await estado.backend.catalogos();
      pintarInstitucion();
      return estado.cat;
    },
    async estudiantes(forzar = false) {
      if (!estado.cacheEst || forzar) estado.cacheEst = await estado.backend.estudiantes();
      return estado.cacheEst;
    },
    invalidarEstudiantes() { estado.cacheEst = null; },
    grado: (id) => (estado.cat.grados.find((g) => g.id === id) || {}).nombre || "",
    curso: (id) => (estado.cat.cursos.find((c) => c.id === id) || {}).nombre || "",
    periodo: (id) => estado.cat.periodos.find((p) => p.id === id) || null,

    /** Enlaza un <select> de grado con uno de curso (el curso se filtra por grado). */
    enlazarGradoCurso(selGrado, selCurso, { vacioCurso = "Todos los cursos", alCambiar } = {}) {
      const pintar = () => {
        const g = selGrado.value, actual = selCurso.value;
        const lista = estado.cat.cursos.filter((c) => !g || c.grado_id === g);
        selCurso.innerHTML = U.opciones(lista, actual, { vacio: vacioCurso, texto: (c) => (g ? c.nombre : `${c.nombre} · ${LT.app.grado(c.grado_id)}`) });
        if (!lista.some((c) => c.id === actual)) selCurso.value = "";
      };
      selGrado.addEventListener("change", () => { pintar(); alCambiar && alCambiar(); });
      selCurso.addEventListener("change", () => {
        if (selCurso.value && !selGrado.value) { selGrado.value = (estado.cat.cursos.find((c) => c.id === selCurso.value) || {}).grado_id || ""; pintar(); }
        alCambiar && alCambiar();
      });
      pintar();
    },
    navegar(vista) { if (location.hash !== "#" + vista) location.hash = vista; else enrutar(); },
  };

  /* ---------------- Arranque ---------------- */
  async function iniciar() {
    U.pintarIconos();
    try {
      await estado.backend.init();
    } catch (e) {
      U.$("#arranque").hidden = true;
      document.body.insertAdjacentHTML("afterbegin", `<div class="aviso aviso--peligro" style="margin:20px">${U.ico("alerta")}<div><strong>No fue posible conectar con la base de datos.</strong><br>${U.esc(LT.error(e))}<br>Revise js/config.js.</div></div>`);
      return;
    }
    estado.backend.alRecuperarClave && estado.backend.alRecuperarClave(() => cambiarClave(true));
    estado.usuario = estado.backend.usuarioActual();
    U.$("#arranque").hidden = true;
    if (estado.usuario) await entrar(); else mostrarLogin();
  }

  function mostrarLogin() {
    U.$("#app").hidden = true;
    U.$("#pantalla-login").hidden = false;
    U.$("#login-demo").hidden = estado.backend.modo !== "demo";
    U.$("#btn-olvido").hidden = estado.backend.modo === "demo";
    setTimeout(() => { const i = U.$("#form-login [name=correo]"); i && i.focus(); }, 50);
  }

  async function entrar() {
    try {
      await LT.app.recargarCatalogos();
    } catch (e) {
      U.toast(LT.error(e), "error", 8000);
      await estado.backend.logout(); estado.usuario = null; mostrarLogin(); return;
    }
    const u = estado.usuario;
    U.$("#pantalla-login").hidden = true;
    U.$("#app").hidden = false;
    U.$("#aviso-demo").hidden = estado.backend.modo !== "demo";
    U.$("#usuario-nombre").textContent = u.nombre;
    U.$("#usuario-rol").textContent = u.rol === "admin" ? "Administrador" : "Docente";
    U.$("#usuario-iniciales").textContent = U.iniciales(u.nombre);
    U.$$(".solo-admin").forEach((el) => (el.hidden = !esAdmin()));
    if (!estado.suscrito) {
      estado.suscrito = true;
      estado.backend.suscribir((tipo) => {
        if (tipo === "externo") LT.app.invalidarEstudiantes();
        if (tipo === "llegadas") LT.app.invalidarEstudiantes();
        const v = LT.vistas[estado.vista];
        if (v && v.alCambio) v.alCambio(tipo);
      });
    }
    if (!location.hash) location.hash = esAdmin() ? "registro" : "reportes";
    else enrutar();
  }

  function pintarInstitucion() {
    const c = (estado.cat && estado.cat.config) || {};
    U.$$(".js-institucion").forEach((el) => (el.textContent = c.nombre_institucion || "Institución Educativa"));
    if (c.logo_url) U.$$(".js-logo").forEach((el) => { el.src = c.logo_url; el.onerror = () => { el.src = "img/escudo.svg"; }; });
    document.title = `Control de Llegadas Tarde · ${c.sigla || c.nombre_institucion || ""}`;
  }

  /* ---------------- Enrutador ---------------- */
  const VISTAS = ["registro", "reportes", "seguimiento", "informes", "configuracion"];
  async function enrutar() {
    if (!estado.usuario) return;
    let nombre = location.hash.replace("#", "").split("/")[0] || "reportes";
    if (!VISTAS.includes(nombre)) nombre = "reportes";
    if (nombre === "configuracion" && !esAdmin()) { history.replaceState(null, "", "#reportes"); nombre = "reportes"; }
    const previa = LT.vistas[estado.vista];
    if (previa && previa.destruir) previa.destruir();
    estado.vista = nombre;
    U.$$("[data-vista]").forEach((a) => a.classList.toggle("activo", a.dataset.vista === nombre));
    const cont = U.$("#vista");
    cont.innerHTML = `<div class="vacio"><div class="arranque__barra" style="margin:30px auto"><span></span></div></div>`;
    try {
      await LT.vistas[nombre].render(cont);
      U.pintarIconos(cont);
    } catch (e) {
      console.error(e);
      cont.innerHTML = `<div class="aviso aviso--peligro">${U.ico("alerta")}<div><strong>No fue posible cargar la sección.</strong><br>${U.esc(LT.error(e))}</div></div>`;
    }
    cont.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", enrutar);

  /* ---------------- Login ---------------- */
  U.$("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget, btn = f.querySelector("[type=submit]"), err = U.$("#login-error");
    err.hidden = true;
    const correo = f.correo.value.trim(), clave = f.password.value;
    if (!U.validarCorreo(correo) || !clave) { err.textContent = "Escriba su correo y contraseña."; err.hidden = false; return; }
    U.ocupado(btn, true);
    try {
      estado.usuario = await estado.backend.login(correo, clave);
      f.reset();
      await entrar();
    } catch (e) { err.textContent = LT.error(e); err.hidden = false; }
    finally { U.ocupado(btn, false); }
  });
  U.$$("[data-demo]").forEach((b) => b.addEventListener("click", () => {
    const [c, p] = LT.backendDemo.cuentasDemo[b.dataset.demo];
    const f = U.$("#form-login"); f.correo.value = c; f.password.value = p; f.requestSubmit();
  }));
  U.$("#btn-olvido").addEventListener("click", async () => {
    const correo = await U.modal({
      titulo: "Recuperar contraseña",
      html: `<p class="muted" style="margin-top:0">Le enviaremos un enlace para restablecer su contraseña.</p>
             <label class="campo"><span>Correo</span><input type="email" id="rec-correo" value="${U.esc(U.$("#form-login [name=correo]").value)}"></label>`,
      botones: [{ texto: "Cancelar", clase: "btn--fantasma", valor: null }, { texto: "Enviar enlace", clase: "btn--primario",
        accion: async (m) => { const c = U.$("#rec-correo", m.el).value.trim(); if (!U.validarCorreo(c)) throw new Error("Correo inválido"); await estado.backend.recuperarClave(c); return c; } }],
    });
    if (correo) U.toast("Si el correo está registrado, recibirá un enlace en unos minutos.");
  });

  /* ---------------- Menú de usuario ---------------- */
  const menu = U.$("#menu-usuario"), btnU = U.$("#btn-usuario");
  btnU.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btnU.setAttribute("aria-expanded", String(!menu.hidden)); });
  document.addEventListener("click", () => { menu.hidden = true; btnU.setAttribute("aria-expanded", "false"); });
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    if (b.dataset.accion === "salir") {
      await estado.backend.logout();
      estado.usuario = null; estado.cacheEst = null;
      const v = LT.vistas[estado.vista]; if (v && v.destruir) v.destruir();
      estado.vista = null;
      history.replaceState(null, "", location.pathname);
      mostrarLogin();
    } else if (b.dataset.accion === "clave") cambiarClave(false);
  });

  async function cambiarClave(recuperacion) {
    await U.modal({
      titulo: recuperacion ? "Defina su nueva contraseña" : "Cambiar contraseña",
      html: `<div class="rejilla" style="grid-template-columns:1fr">
        <label class="campo"><span>Nueva contraseña</span><input type="password" id="clave1" autocomplete="new-password" minlength="8"><small class="ayuda">Mínimo 8 caracteres, combine letras y números.</small></label>
        <label class="campo"><span>Confirmar contraseña</span><input type="password" id="clave2" autocomplete="new-password"></label></div>`,
      botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Guardar", clase: "btn--primario", accion: async (m) => {
        const a = U.$("#clave1", m.el).value, b = U.$("#clave2", m.el).value;
        if (a.length < 8 || !/\d/.test(a) || !/[a-zA-Z]/.test(a)) throw new Error("La contraseña debe tener al menos 8 caracteres, con letras y números");
        if (a !== b) throw new Error("Las contraseñas no coinciden");
        await estado.backend.cambiarClave(a);
        U.toast("Contraseña actualizada");
      } }],
    });
    if (recuperacion && !estado.usuario) {
      estado.usuario = estado.backend.usuarioActual();
      if (estado.usuario) entrar();
    }
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
