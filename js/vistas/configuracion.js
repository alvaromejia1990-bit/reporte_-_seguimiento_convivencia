/* Configuración (solo administradores): institución, períodos, grados y cursos, usuarios, auditoría y respaldo */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const A = new Proxy({}, { get: (_, k) => LT.app[k] }); // LT.app se define en app.js (se carga después)
  let pestana = "institucion", raiz = null;

  const PESTANAS = [["institucion", "Institución"], ["periodos", "Períodos académicos"], ["grados", "Grados y cursos"], ["usuarios", "Usuarios y roles"], ["auditoria", "Auditoría"], ["respaldo", "Respaldo"]];

  LT.vistas.configuracion = {
    async render(el) {
      raiz = el;
      el.innerHTML = `
        <div class="titular"><div><h1>Configuración</h1><p>Parámetros institucionales, calendario académico, estructura de grados y cursos, y control de acceso.</p></div></div>
        <div class="pestanas">${PESTANAS.map(([k, t]) => `<button data-pest="${k}" class="${k === pestana ? "activo" : ""}">${t}</button>`).join("")}</div>
        <div id="cf-contenido"></div>`;
      U.$$("[data-pest]", el).forEach((b) => b.addEventListener("click", () => { pestana = b.dataset.pest; U.$$("[data-pest]", el).forEach((x) => x.classList.toggle("activo", x === b)); pintar(); }));
      await pintar();
    },
    destruir() { raiz = null; },
  };

  async function pintar() {
    const c = U.$("#cf-contenido", raiz);
    try { await { institucion, periodos, grados, usuarios, auditoria, respaldo }[pestana](c); U.pintarIconos(c); }
    catch (e) { c.innerHTML = `<div class="aviso aviso--peligro">${U.ico("alerta")}<div>${U.esc(LT.error(e))}</div></div>`; }
  }
  const b = () => LT.estado.backend;
  const refrescar = async () => { await A.recargarCatalogos(); await pintar(); };

  /* ---------- Institución ---------- */
  function institucion(c) {
    const v = LT.estado.cat.config;
    const campo = (k, t, tipo = "text", extra = "") => `<label class="campo"><span>${t}</span><input name="${k}" type="${tipo}" value="${U.esc(v[k] ?? "")}" ${extra}></label>`;
    c.innerHTML = `<form class="tarjeta" id="cf-inst"><div class="tarjeta__cuerpo rejilla">
        <div class="seccion-form">Datos institucionales</div>
        <label class="campo ancho-2"><span>Nombre de la institución</span><input name="nombre_institucion" required value="${U.esc(v.nombre_institucion || "")}"></label>
        ${campo("sigla", "Sigla")}${campo("nit", "NIT / DANE")}${campo("ciudad", "Ciudad")}${campo("direccion", "Dirección")}${campo("telefono", "Teléfono")}
        ${campo("correo_institucional", "Correo institucional (respuestas)", "email")}
        <label class="campo ancho-2"><span>URL del escudo (PNG/SVG, opcional)</span><input name="logo_url" type="url" value="${U.esc(v.logo_url || "")}" placeholder="https://…/escudo.png"><small class="ayuda">Debe ser una URL pública. También puede reemplazar img/escudo.svg en el repositorio.</small></label>
        <div class="seccion-form">Firma de las notificaciones</div>
        ${campo("responsable_nombre", "Nombre del responsable")}${campo("responsable_cargo", "Cargo")}
        <div class="seccion-form">Reglas de seguimiento</div>
        <label class="campo"><span>Límite de llegadas tarde por período</span><input name="umbral_seguimiento" type="number" min="1" max="100" value="${v.umbral_seguimiento}" required>
          <small class="ayuda">Pasan a seguimiento quienes tengan <strong>más</strong> de este número.</small></label>
        ${campo("hora_limite_ingreso", "Hora de ingreso (referencia)", "time")}
      </div><div class="tarjeta__pie"><span class="muted peq">Los cambios aplican para todos los usuarios.</span><button class="btn btn--primario" type="submit">Guardar configuración</button></div></form>`;
    U.$("#cf-inst", c).addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter; U.ocupado(btn, true);
      try {
        const d = Object.fromEntries(new FormData(e.currentTarget).entries());
        if (!d.nombre_institucion.trim()) throw new Error("El nombre de la institución es obligatorio");
        if (d.correo_institucional && !U.validarCorreo(d.correo_institucional)) throw new Error("Correo institucional inválido");
        d.umbral_seguimiento = Number(d.umbral_seguimiento);
        d.hora_limite_ingreso = d.hora_limite_ingreso || null;
        await b().guardarConfig(d);
        await A.recargarCatalogos();
        U.toast("Configuración guardada");
      } catch (err) { U.toast(LT.error(err), "error"); } finally { U.ocupado(btn, false); }
    });
  }

  /* ---------- Períodos ---------- */
  function periodos(c) {
    const lista = LT.estado.cat.periodos, hoy = U.hoy();
    c.innerHTML = `<div class="tarjeta"><div class="tarjeta__cab"><h3>Períodos académicos</h3><button class="btn btn--primario btn--sm" data-nuevo>${U.ico("mas")}Nuevo período</button></div>
      ${lista.length ? `<div class="tabla-cont"><table class="tabla tabla--responsiva"><thead><tr><th>Período</th><th>Año</th><th>Inicio</th><th>Fin</th><th>Estado</th><th class="derecha">Acciones</th></tr></thead><tbody>
        ${lista.map((p) => `<tr><td class="principal" data-etq="Período"><strong>${U.esc(p.nombre)}</strong></td><td data-etq="Año">${p.anio}</td><td data-etq="Inicio">${U.fmtFecha(p.fecha_inicio, "media")}</td><td data-etq="Fin">${U.fmtFecha(p.fecha_fin, "media")}</td>
          <td data-etq="Estado">${hoy >= p.fecha_inicio && hoy <= p.fecha_fin ? '<span class="chip chip--exito">En curso</span>' : hoy > p.fecha_fin ? '<span class="chip">Finalizado</span>' : '<span class="chip chip--info">Próximo</span>'}</td>
          <td class="acciones-celda"><div class="acciones"><button class="btn btn--sm" data-editar="${p.id}">${U.ico("editar")}Editar</button><button class="btn btn--sm btn--fantasma" data-borrar="${p.id}">${U.ico("borrar")}</button></div></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="vacio">${U.ico("calendario")}<h3>Sin períodos</h3><p>Cree los períodos del año lectivo. Sin un período vigente no se pueden reportar llegadas tarde.</p></div>`}
      <div class="tarjeta__pie"><span class="muted peq">Los períodos no pueden cruzarse. Cada llegada tarde se asigna automáticamente al período de su fecha.</span></div></div>`;
    c.onclick = async (e) => {
      const n = e.target.closest("[data-nuevo]"), ed = e.target.closest("[data-editar]"), bo = e.target.closest("[data-borrar]");
      if (n || ed) {
        const p = ed ? lista.find((x) => x.id === ed.dataset.editar) : { nombre: `Período ${lista.length + 1}`, anio: Number(hoy.slice(0, 4)) };
        const r = await U.modal({ titulo: ed ? "Editar período" : "Nuevo período", html: `<form class="rejilla" id="fp">
            <label class="campo"><span>Nombre</span><input name="nombre" value="${U.esc(p.nombre)}" required></label>
            <label class="campo"><span>Año</span><input name="anio" type="number" value="${p.anio}" required></label>
            <label class="campo"><span>Fecha de inicio</span><input name="fecha_inicio" type="date" value="${p.fecha_inicio || ""}" required></label>
            <label class="campo"><span>Fecha de finalización</span><input name="fecha_fin" type="date" value="${p.fecha_fin || ""}" required></label></form>`,
          botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Guardar", clase: "btn--primario", accion: async (m) => {
            const d = Object.fromEntries(new FormData(U.$("#fp", m.el)).entries());
            if (!d.nombre || !d.fecha_inicio || !d.fecha_fin) throw new Error("Complete todos los campos");
            if (d.fecha_fin < d.fecha_inicio) throw new Error("La fecha final debe ser posterior a la inicial");
            await b().guardarPeriodo({ ...d, id: p.id });
          } }] });
        if (r) { U.toast("Período guardado"); refrescar(); }
      }
      if (bo) {
        const p = lista.find((x) => x.id === bo.dataset.borrar);
        if (await U.confirmar("Eliminar período", `¿Eliminar <strong>${U.esc(U.nombrePeriodo(p))}</strong>? Solo es posible si no tiene llegadas tarde registradas.`, { texto: "Eliminar", peligro: true })) {
          try { await b().eliminarPeriodo(p.id); U.toast("Período eliminado"); refrescar(); } catch (err) { U.toast(LT.error(err), "error", 6000); }
        }
      }
    };
  }

  /* ---------- Grados y cursos ---------- */
  async function grados(c) {
    const cat = LT.estado.cat;
    const est = await A.estudiantes(true);
    const n = (cid) => est.filter((e) => e.curso_id === cid && e.estado === "activo").length;
    c.innerHTML = `<div class="tarjeta"><div class="tarjeta__cab"><h3>Grados y cursos</h3><div class="titular__acciones">
        <button class="btn btn--sm" data-nuevo-curso ${cat.grados.length ? "" : "disabled"}>${U.ico("mas")}Nuevo curso</button><button class="btn btn--primario btn--sm" data-nuevo-grado>${U.ico("mas")}Nuevo grado</button></div></div>
      <div class="tarjeta__cuerpo">${cat.grados.length ? cat.grados.map((g) => `<div class="grado-bloque">
          <span class="grado-bloque__nombre">${U.esc(g.nombre)} <small class="muted">(${g.orden})</small></span>
          <span class="grado-bloque__cursos">${cat.cursos.filter((x) => x.grado_id === g.id).map((x) => `<span class="curso-chip" title="${n(x.id)} estudiantes activos${x.director ? " · Director: " + U.esc(x.director) : ""}">${U.esc(x.nombre)} <small class="muted">${n(x.id)}</small>
            <button data-editar-curso="${x.id}" aria-label="Editar curso">${U.icono("editar")}</button><button data-borrar-curso="${x.id}" aria-label="Eliminar curso">${U.icono("cerrar")}</button></span>`).join("") || '<span class="muted peq">Sin cursos</span>'}</span>
          <span class="acciones"><button class="btn btn--sm" data-editar-grado="${g.id}">${U.ico("editar")}</button><button class="btn btn--sm btn--fantasma" data-borrar-grado="${g.id}">${U.ico("borrar")}</button></span>
        </div>`).join("") : `<div class="vacio">${U.ico("usuarios")}<h3>Sin grados</h3><p>Cree los grados (Sexto, Séptimo…) y luego sus cursos (601, 602…).</p></div>`}</div></div>`;
    c.onclick = async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      const d = t.dataset;
      if ("nuevoGrado" in d || d.editarGrado) {
        const g = d.editarGrado ? cat.grados.find((x) => x.id === d.editarGrado) : { nombre: "", orden: (Math.max(0, ...cat.grados.map((x) => x.orden)) || 5) + 1 };
        const r = await U.modal({ titulo: g.id ? "Editar grado" : "Nuevo grado", html: `<form class="rejilla" id="fg">
            <label class="campo"><span>Nombre</span><input name="nombre" value="${U.esc(g.nombre)}" placeholder="Sexto" required></label>
            <label class="campo"><span>Número (orden)</span><input name="orden" type="number" value="${g.orden}" required><small class="ayuda">Permite reconocer "6" como Sexto en la carga masiva.</small></label></form>`,
          botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Guardar", clase: "btn--primario", accion: async (m) => { await b().guardarGrado({ ...Object.fromEntries(new FormData(U.$("#fg", m.el)).entries()), id: g.id }); } }] });
        if (r) { U.toast("Grado guardado"); refrescar(); }
      } else if ("nuevoCurso" in d || d.editarCurso) {
        const x = d.editarCurso ? cat.cursos.find((y) => y.id === d.editarCurso) : { grado_id: cat.grados[0].id, nombre: "", director: "" };
        const r = await U.modal({ titulo: x.id ? "Editar curso" : "Nuevo curso", html: `<form class="rejilla" id="fc">
            <label class="campo"><span>Grado</span><select name="grado_id">${U.opciones(cat.grados, x.grado_id)}</select></label>
            <label class="campo"><span>Nombre del curso</span><input name="nombre" value="${U.esc(x.nombre)}" placeholder="601" required></label>
            <label class="campo ancho-total"><span>Director(a) de curso (opcional)</span><input name="director" value="${U.esc(x.director || "")}"></label></form>`,
          botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Guardar", clase: "btn--primario", accion: async (m) => { await b().guardarCurso({ ...Object.fromEntries(new FormData(U.$("#fc", m.el)).entries()), id: x.id }); } }] });
        if (r) { U.toast("Curso guardado"); A.invalidarEstudiantes(); refrescar(); }
      } else if (d.borrarGrado || d.borrarCurso) {
        const esG = !!d.borrarGrado, obj = esG ? cat.grados.find((x) => x.id === d.borrarGrado) : cat.cursos.find((x) => x.id === d.borrarCurso);
        if (await U.confirmar(esG ? "Eliminar grado" : "Eliminar curso", `¿Eliminar <strong>${U.esc(obj.nombre)}</strong>? ${esG ? "El grado no debe tener cursos." : "El curso no debe tener estudiantes."}`, { texto: "Eliminar", peligro: true })) {
          try { esG ? await b().eliminarGrado(obj.id) : await b().eliminarCurso(obj.id); U.toast("Eliminado"); refrescar(); } catch (err) { U.toast(LT.error(err), "error", 6000); }
        }
      }
    };
  }

  /* ---------- Usuarios ---------- */
  async function usuarios(c) {
    const lista = await b().usuarios();
    const yo = LT.estado.usuario.id;
    c.innerHTML = `<div class="tarjeta"><div class="tarjeta__cab"><h3>Usuarios y roles</h3><button class="btn btn--primario btn--sm" data-nuevo>${U.ico("mas")}Nuevo usuario</button></div>
      <div class="tabla-cont"><table class="tabla tabla--responsiva"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th class="derecha">Acciones</th></tr></thead><tbody>
      ${lista.map((u) => `<tr><td class="principal" data-etq="Nombre"><strong>${U.esc(u.nombre)}</strong>${u.id === yo ? ' <span class="chip chip--info">Usted</span>' : ""}</td><td data-etq="Correo">${U.esc(u.correo)}</td>
        <td data-etq="Rol">${u.rol === "admin" ? '<span class="chip chip--info">Administrador</span>' : '<span class="chip">Docente</span>'}</td>
        <td data-etq="Estado">${u.activo ? '<span class="chip chip--exito">Activo</span>' : '<span class="chip chip--alerta">Inactivo</span>'}</td>
        <td class="acciones-celda"><div class="acciones">${u.id === yo ? "" : `
          <button class="btn btn--sm" data-rol="${u.id}">${u.rol === "admin" ? "Hacer docente" : "Hacer admin"}</button>
          <button class="btn btn--sm" data-activo="${u.id}">${u.activo ? "Desactivar" : "Activar"}</button>
          <button class="btn btn--sm" data-clave="${u.id}">${U.ico("llave")}Clave</button>
          <button class="btn btn--sm btn--fantasma" data-borrar="${u.id}" aria-label="Eliminar">${U.ico("borrar")}</button>`}</div></td></tr>`).join("")}
      </tbody></table></div>
      <div class="tarjeta__pie"><span class="muted peq"><strong>Administrador:</strong> acceso total, datos de acudientes, carga masiva, configuración. <strong>Docente:</strong> reporta llegadas, consulta datos básicos, seguimiento, notifica e informes.</span></div></div>`;
    c.onclick = async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      const d = t.dataset, u = lista.find((x) => x.id === (d.rol || d.activo || d.clave || d.borrar));
      try {
        if ("nuevo" in d) {
          const r = await U.modal({ titulo: "Nuevo usuario", html: `<form class="rejilla" id="fu">
              <label class="campo"><span>Nombre completo</span><input name="nombre" required></label>
              <label class="campo"><span>Correo</span><input name="correo" type="email" required></label>
              <label class="campo"><span>Rol</span><select name="rol"><option value="docente">Docente</option><option value="admin">Administrador</option></select></label>
              <label class="campo"><span>Contraseña inicial</span><input name="password" type="text" minlength="8" value="${generarClave()}" required><small class="ayuda">${b().modo === "google" ? "Se enviará al correo del usuario; deberá cambiarla al ingresar." : "Compártala de forma segura; el usuario puede cambiarla."}</small></label></form>`,
            botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Crear usuario", clase: "btn--primario", accion: async (m) => (await b().crearUsuario(Object.fromEntries(new FormData(U.$("#fu", m.el)).entries()))) || true }] });
          if (r) { U.toast(r.correo_enviado ? "Usuario creado. Se le envió un correo con sus datos de acceso." : "Usuario creado"); pintar(); }
        } else if (d.rol) { await b().actualizarUsuario(u.id, { rol: u.rol === "admin" ? "docente" : "admin" }); U.toast("Rol actualizado"); pintar(); }
        else if (d.activo) { await b().actualizarUsuario(u.id, { activo: !u.activo }); U.toast(u.activo ? "Usuario desactivado" : "Usuario activado"); pintar(); }
        else if (d.clave) {
          const r = await U.modal({ titulo: `Restablecer contraseña · ${u.nombre}`, html: `<label class="campo"><span>Nueva contraseña</span><input id="nc" type="text" value="${generarClave()}" minlength="8"></label>`,
            botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Restablecer", clase: "btn--primario", accion: async (m) => { await b().restablecerClave(u.id, U.$("#nc", m.el).value); } }] });
          if (r) U.toast("Contraseña restablecida");
        } else if (d.borrar) {
          if (await U.confirmar("Eliminar usuario", `¿Eliminar la cuenta de <strong>${U.esc(u.nombre)}</strong>? Sus reportes se conservan. Considere desactivarla en su lugar.`, { texto: "Eliminar", peligro: true })) {
            await b().eliminarUsuario(u.id); U.toast("Usuario eliminado"); pintar();
          }
        }
      } catch (err) { U.toast(LT.error(err), "error", 6000); }
    };
  }
  function generarClave() {
    const s = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const a = new Uint32Array(10); crypto.getRandomValues(a);
    return Array.from(a, (x) => s[x % s.length]).join("") + "7";
  }

  /* ---------- Auditoría ---------- */
  async function auditoria(c) {
    const lista = await b().auditoria();
    const NOMBRES = { estudiantes: "Estudiantes", llegadas_tarde: "Llegadas tarde", perfiles: "Usuarios", usuarios: "Usuarios", notificaciones: "Notificaciones", configuracion: "Configuración" };
    const ACC = { UPDATE: "Modificación", DELETE: "Eliminación", INSERT: "Creación", IMPORTACION: "Importación masiva", ENVIO: "Envío de correo", CREAR: "Creación", ACTUALIZAR: "Modificación", ELIMINAR: "Eliminación", RESTABLECER_CLAVE: "Cambio de contraseña" };
    const resumen = (a) => {
      const d = a.detalle || {};
      if (a.accion === "IMPORTACION") return `${d.filas} filas · ${d.insertados} nuevos · ${d.actualizados} actualizados · ${d.errores} errores`;
      const x = d.despues || d.antes || d;
      if (x && (x.nombres || x.apellidos)) return `${x.apellidos || ""} ${x.nombres || ""}`.trim();
      if (x && x.fecha && x.estudiante_id) return `Llegada del ${U.fmtFecha(x.fecha)} ${U.fmtHora(x.hora)}`;
      if (x && x.correo) return x.correo;
      if (x && x.rol !== undefined) return `rol: ${x.rol}`;
      if (x && x.activo !== undefined) return x.activo ? "activado" : "desactivado";
      return "";
    };
    c.innerHTML = `<div class="tarjeta"><div class="tarjeta__cab"><h3>Registro de auditoría</h3><span class="muted peq">Últimas ${lista.length} acciones sensibles</span></div>
      ${lista.length ? `<div class="tabla-cont"><table class="tabla tabla--responsiva"><thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
      ${lista.map((a) => `<tr><td class="principal" data-etq="Fecha"><strong>${U.fmtFechaHora(a.fecha)}</strong></td><td data-etq="Usuario">${U.esc(a.usuario || "")}</td><td data-etq="Módulo">${U.esc(NOMBRES[a.tabla] || a.tabla)}</td>
        <td data-etq="Acción">${U.esc(ACC[a.accion] || a.accion)}</td><td data-etq="Detalle" class="peq">${U.esc(resumen(a))}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="vacio">${U.ico("escudo")}<h3>Sin registros</h3><p>Aquí aparecerán las modificaciones, eliminaciones, importaciones y envíos.</p></div>`}</div>`;
  }

  /* ---------- Respaldo ---------- */
  function respaldo(c) {
    const demo = b().modo === "demo";
    c.innerHTML = `<div class="tarjeta"><div class="tarjeta__cuerpo">
        <h3 style="margin-bottom:6px">Respaldo de datos</h3>
        <p class="muted" style="margin-top:0">Descargue en Excel toda la información: estudiantes, llegadas tarde, notificaciones y configuración académica. Guarde el archivo en un lugar seguro: contiene datos personales.</p>
        <button class="btn btn--primario" id="cf-respaldo">${U.ico("bajar")}Descargar respaldo completo</button>
        ${demo ? `<hr style="border:0;border-top:1px solid var(--borde-2);margin:20px 0">
          <h3 style="margin-bottom:6px">Datos de demostración</h3><p class="muted" style="margin-top:0">Restaura los datos de ejemplo en este navegador.</p>
          <button class="btn btn--peligro" id="cf-reset">${U.ico("recargar")}Restablecer datos de ejemplo</button>`
        : b().modo === "google"
          ? `<p class="muted peq" style="margin-top:16px">Los datos viven en la hoja de cálculo «BD Control de Llegadas Tarde» de su Google Drive. Drive conserva el historial de versiones (Archivo › Historial de versiones) para restaurar cambios.</p>`
          : `<p class="muted peq" style="margin-top:16px">Supabase además realiza copias de seguridad automáticas diarias de la base de datos (según el plan contratado).</p>`}
      </div></div>`;
    U.$("#cf-respaldo", c).addEventListener("click", async (e) => {
      const btn = e.currentTarget; U.ocupado(btn, true);
      try {
        const cat = LT.estado.cat;
        const [est, ll, ns] = await Promise.all([A.estudiantes(true), b().llegadas({}), b().notificaciones({})]);
        const estMap = new Map(est.map((x) => [x.id, x]));
        await LT.exportar.excel({ nombre: "respaldo_llegadas_tarde", hojas: [
          { nombre: "Estudiantes", titulo: "Estudiantes", columnas: ["tipo_documento", "documento", "apellidos", "nombres", "edad", "grado", "curso", "acudiente_nombre", "acudiente_parentesco", "acudiente_correo", "acudiente_telefono", "direccion", "estado", "total_llegadas"].map((t) => ({ t, ancho: 16 })),
            filas: est.map((x) => [x.tipo_documento, x.documento, x.apellidos, x.nombres, x.edad, A.grado(x.grado_id), A.curso(x.curso_id), x.acudiente_nombre, x.acudiente_parentesco, x.acudiente_correo, x.acudiente_telefono, x.direccion, x.estado, x.total_llegadas]) },
          { nombre: "Llegadas tarde", titulo: "Llegadas tarde", columnas: ["fecha", "hora", "documento", "estudiante", "grado", "curso", "periodo", "registrado_por", "observacion"].map((t) => ({ t, ancho: 16 })),
            filas: ll.map((l) => [l.fecha, U.fmtHora(l.hora), (estMap.get(l.estudiante_id) || {}).documento || "", U.nombre(estMap.get(l.estudiante_id)), l.grado_nombre, l.curso_nombre, U.nombrePeriodo(A.periodo(l.periodo_id)), l.registrado_por_nombre || "", l.observacion || ""]) },
          { nombre: "Notificaciones", titulo: "Notificaciones", columnas: ["enviado_en", "documento", "estudiante", "periodo", "destinatario", "reportes", "estado", "proveedor", "error", "enviado_por"].map((t) => ({ t, ancho: 16 })),
            filas: ns.map((n) => [U.fmtFechaHora(n.enviado_en), (estMap.get(n.estudiante_id) || {}).documento || "", U.nombre(estMap.get(n.estudiante_id)), U.nombrePeriodo(A.periodo(n.periodo_id)), n.destinatario, n.cantidad_reportes, n.estado, n.proveedor || "", n.error || "", n.enviado_por_nombre || ""]) },
          { nombre: "Periodos", titulo: "Períodos académicos", columnas: ["nombre", "anio", "fecha_inicio", "fecha_fin"].map((t) => ({ t, ancho: 16 })), filas: cat.periodos.map((p) => [p.nombre, p.anio, p.fecha_inicio, p.fecha_fin]) },
          { nombre: "Grados y cursos", titulo: "Grados y cursos", columnas: ["grado", "orden", "curso", "director"].map((t) => ({ t, ancho: 16 })), filas: cat.cursos.map((x) => [A.grado(x.grado_id), (cat.grados.find((g) => g.id === x.grado_id) || {}).orden, x.nombre, x.director || ""]) },
        ] });
        U.toast("Respaldo descargado");
      } catch (err) { U.toast(LT.error(err), "error"); } finally { U.ocupado(btn, false); }
    });
    if (demo) U.$("#cf-reset", c).addEventListener("click", async () => {
      if (await U.confirmar("Restablecer datos", "Se borrarán los cambios hechos en este navegador y se cargarán de nuevo los datos de ejemplo.", { texto: "Restablecer", peligro: true })) {
        LT.backendDemo.reiniciar(); A.invalidarEstudiantes(); await A.recargarCatalogos(); U.toast("Datos de ejemplo restablecidos");
      }
    });
  }
})();
