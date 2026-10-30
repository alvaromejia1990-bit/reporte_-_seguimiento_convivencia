/* Sección 3 · Seguimiento y notificaciones */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const A = new Proxy({}, { get: (_, k) => LT.app[k] }); // LT.app se define en app.js (se carga después)

  const f = { pestana: "seguimiento", periodo: null, grado: "", curso: "", estadoNotif: "", q: "" };
  let raiz = null, datos = { estudiantes: [], llegadas: [], notificaciones: [] }, filasSeg = [], seleccion = new Set();

  LT.vistas.seguimiento = {
    async render(el) {
      raiz = el;
      const cat = LT.estado.cat;
      if (!f.periodo || !A.periodo(f.periodo)) f.periodo = (U.periodoActual(cat.periodos) || {}).id || "";
      el.innerHTML = `
        <div class="titular"><div><h1>Seguimiento y notificaciones</h1>
          <p>Estudiantes con <strong>más de ${A.umbral()} llegadas tarde</strong> en el período. Notifique al acudiente por correo institucional y consulte el historial.</p></div></div>
        <div class="pestanas" role="tablist">
          <button data-pest="seguimiento" class="${f.pestana === "seguimiento" ? "activo" : ""}">Estudiantes en seguimiento</button>
          <button data-pest="historial" class="${f.pestana === "historial" ? "activo" : ""}">Historial de notificaciones</button>
        </div>
        <div class="filtros">
          <label class="campo"><span>Período académico</span><select class="control" id="s-periodo">${U.opciones(cat.periodos, f.periodo, { vacio: "Todo el año", texto: U.nombrePeriodo })}</select></label>
          <label class="campo"><span>Grado</span><select class="control" id="s-grado">${U.opciones(cat.grados, f.grado, { vacio: "Todos los grados" })}</select></label>
          <label class="campo"><span>Curso</span><select class="control" id="s-curso"><option value="${U.esc(f.curso)}"></option></select></label>
          <label class="campo" id="s-estado-campo" ${f.pestana === "historial" ? "" : "hidden"}><span>Estado</span><select class="control" id="s-estado">
            <option value="">Todos</option>${["enviado", "entregado", "abierto", "rebotado", "fallido", "pendiente"].map((x) => `<option value="${x}" ${f.estadoNotif === x ? "selected" : ""}>${U.textoEstado(x)}</option>`).join("")}</select></label>
          <label class="campo campo--busqueda"><span>Buscar</span><div class="buscador">${U.ico("buscar")}<input class="control" type="search" id="s-q" placeholder="Nombre o documento" value="${U.esc(f.q)}"></div></label>
        </div>
        <div id="s-contenido"></div>`;
      U.$$("[data-pest]", el).forEach((b) => b.addEventListener("click", () => {
        f.pestana = b.dataset.pest;
        U.$$("[data-pest]", el).forEach((x) => x.classList.toggle("activo", x === b));
        U.$("#s-estado-campo", el).hidden = f.pestana !== "historial";
        pintar();
      }));
      U.$("#s-periodo", el).addEventListener("change", (e) => { f.periodo = e.target.value; seleccion.clear(); cargar(); });
      A.enlazarGradoCurso(U.$("#s-grado", el), U.$("#s-curso", el), { alCambiar: () => { f.grado = U.$("#s-grado", el).value; f.curso = U.$("#s-curso", el).value; pintar(); } });
      U.$("#s-estado", el).addEventListener("change", (e) => { f.estadoNotif = e.target.value; pintar(); });
      U.$("#s-q", el).addEventListener("input", U.debounce((e) => { f.q = e.target.value; pintar(); }, 200));
      U.$("#s-contenido", el).addEventListener("click", alClic);
      U.$("#s-contenido", el).addEventListener("change", alCheck);
      await cargar();
    },
    destruir() { raiz = null; },
    alCambio() { if (raiz) cargar(); },
  };

  async function cargar() {
    const b = LT.estado.backend;
    const [est, ll, ns] = await Promise.all([A.estudiantes(), b.llegadas(f.periodo ? { periodoId: f.periodo } : {}), b.notificaciones(f.periodo ? { periodoId: f.periodo } : {})]);
    datos = { estudiantes: est, llegadas: ll, notificaciones: ns };
    if (raiz) pintar();
  }

  const coincide = (e) => {
    const q = U.norm(f.q);
    return e && (!f.grado || e.grado_id === f.grado) && (!f.curso || e.curso_id === f.curso) && (!q || U.norm(`${U.nombre(e)} ${e.nombres} ${e.documento}`).includes(q));
  };

  function pintar() {
    if (!raiz) return;
    f.pestana === "historial" ? pintarHistorial() : pintarSeguimiento();
    U.pintarIconos(raiz);
  }

  function calcularSeguimiento() {
    const estMap = new Map(datos.estudiantes.map((e) => [e.id, e]));
    const umbral = A.umbral();
    // Sin período: se evalúa cada período por separado (un estudiante puede aparecer en varios)
    const periodos = f.periodo ? [f.periodo] : [...new Set(datos.llegadas.map((l) => l.periodo_id))];
    const filas = [];
    periodos.forEach((pid) => {
      LT.estadisticas.seguimiento(datos.llegadas.filter((l) => l.periodo_id === pid), estMap, umbral).forEach((s) => {
        const ns = datos.notificaciones.filter((n) => n.estudiante_id === s.estudiante.id && n.periodo_id === pid);
        filas.push({ ...s, periodoId: pid, clave: s.estudiante.id + "|" + pid, ultimaNotif: ns[0] || null,
          pendiente: !ns.some((n) => ["enviado", "entregado", "abierto"].includes(n.estado) && n.cantidad_reportes >= s.cantidad) });
      });
    });
    return filas.filter((x) => coincide(x.estudiante));
  }

  function pintarSeguimiento() {
    const cont = U.$("#s-contenido", raiz);
    filasSeg = calcularSeguimiento();
    const notificados = filasSeg.filter((x) => !x.pendiente).length;
    [...seleccion].forEach((k) => { if (!filasSeg.some((x) => x.clave === k)) seleccion.delete(k); });
    cont.innerHTML = `
      <div class="kpis">
        <div class="kpi kpi--peligro"><div class="kpi__etq">Estudiantes en seguimiento</div><div class="kpi__val">${filasSeg.length}</div><div class="kpi__det">Más de ${A.umbral()} llegadas tarde</div></div>
        <div class="kpi kpi--oro"><div class="kpi__etq">Pendientes por notificar</div><div class="kpi__val">${filasSeg.length - notificados}</div><div class="kpi__det">Sin notificación con el conteo actual</div></div>
        <div class="kpi kpi--exito"><div class="kpi__etq">Acudientes notificados</div><div class="kpi__val">${notificados}</div><div class="kpi__det">${f.periodo ? U.nombrePeriodo(A.periodo(f.periodo)) : "Todo el año"}</div></div>
      </div>
      <div class="tarjeta">
        <div class="tarjeta__cab"><h3>Estudiantes con más de ${A.umbral()} llegadas tarde</h3>
          <div class="titular__acciones">
            <button class="btn btn--sm" data-accion="exportar-seg">${U.ico("excel")}Exportar</button>
            <button class="btn btn--sm btn--acento" data-accion="notificar-sel" ${seleccion.size ? "" : "disabled"}>${U.ico("correo")}Notificar seleccionados (${seleccion.size})</button>
          </div></div>
        ${filasSeg.length ? `<div class="tabla-cont"><table class="tabla tabla--responsiva"><thead><tr>
          <th class="chk"><input type="checkbox" id="s-todos" aria-label="Seleccionar pendientes"></th>
          <th>Estudiante</th><th>Grado / curso</th>${f.periodo ? "" : "<th>Período</th>"}<th class="centro">Llegadas</th><th>Fechas recientes</th><th>Última notificación</th><th class="derecha">Acciones</th></tr></thead>
          <tbody>${filasSeg.map((s) => {
            const e = s.estudiante, n = s.ultimaNotif;
            const sinCorreo = e.acudiente_correo === null || e.tiene_correo_acudiente === false || (A.esAdmin() && !e.acudiente_correo);
            return `<tr class="${seleccion.has(s.clave) ? "seleccionada" : ""}">
              <td class="chk">${sinCorreo ? "" : `<input type="checkbox" data-sel="${s.clave}" ${seleccion.has(s.clave) ? "checked" : ""} aria-label="Seleccionar">`}</td>
              <td class="principal" data-etq="Estudiante"><div class="estudiante-celda"><strong>${U.esc(U.nombre(e))}</strong><small>${U.esc(e.tipo_documento || "")} ${U.esc(e.documento || "")}</small></div></td>
              <td data-etq="Grado / curso">${U.esc(A.grado(e.grado_id))} · ${U.esc(A.curso(e.curso_id))}</td>
              ${f.periodo ? "" : `<td data-etq="Período">${U.esc(U.nombrePeriodo(A.periodo(s.periodoId)))}</td>`}
              <td data-etq="Llegadas" class="centro">${U.contador(s.cantidad, A.umbral())}</td>
              <td data-etq="Fechas recientes" class="peq">${s.llegadas.slice(-3).reverse().map((l) => U.fmtFecha(l.fecha, "dm")).join(", ")}${s.llegadas.length > 3 ? "…" : ""}</td>
              <td data-etq="Última notificación">${n ? `<div class="estudiante-celda">${U.chipEstado(n.estado)}<small>${U.fmtFechaHora(n.enviado_en)} · ${n.cantidad_reportes} rep.</small></div>` : '<span class="chip chip--alerta">Sin notificar</span>'}</td>
              <td class="acciones-celda"><div class="acciones">
                <button class="btn btn--sm" data-accion="reporte" data-est="${e.id}" data-per="${s.periodoId}">${U.ico("archivo")}Reporte</button>
                ${sinCorreo ? '<span class="chip chip--peligro" title="Registre el correo del acudiente en Registro">Sin correo</span>'
                  : `<button class="btn btn--sm ${s.pendiente ? "btn--primario" : "btn--suave"}" data-accion="notificar" data-est="${e.id}" data-per="${s.periodoId}">${U.ico("correo")}Notificar acudiente</button>`}
              </div></td></tr>`;
          }).join("")}</tbody></table></div>`
        : `<div class="vacio">${U.ico("ok")}<h3>Ningún estudiante supera el límite</h3><p>No hay estudiantes con más de ${A.umbral()} llegadas tarde con los filtros seleccionados.</p></div>`}
      </div>`;
  }

  function pintarHistorial() {
    const cont = U.$("#s-contenido", raiz);
    const estMap = new Map(datos.estudiantes.map((e) => [e.id, e]));
    const lista = datos.notificaciones.filter((n) => coincide(estMap.get(n.estudiante_id)) && (!f.estadoNotif || n.estado === f.estadoNotif));
    const cuenta = (est) => lista.filter((n) => est.includes(n.estado)).length;
    cont.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="kpi__etq">Notificaciones</div><div class="kpi__val">${lista.length}</div></div>
        <div class="kpi kpi--exito"><div class="kpi__etq">Entregadas / leídas</div><div class="kpi__val">${cuenta(["entregado", "abierto"])}</div></div>
        <div class="kpi kpi--oro"><div class="kpi__etq">Enviadas (sin confirmar)</div><div class="kpi__val">${cuenta(["enviado", "pendiente"])}</div></div>
        <div class="kpi kpi--peligro"><div class="kpi__etq">Rebotadas / fallidas</div><div class="kpi__val">${cuenta(["rebotado", "fallido"])}</div></div>
      </div>
      <div class="tarjeta">
        <div class="tarjeta__cab"><h3>Historial de notificaciones</h3><button class="btn btn--sm" data-accion="exportar-hist">${U.ico("excel")}Exportar</button></div>
        ${lista.length ? `<div class="tabla-cont"><table class="tabla tabla--responsiva"><thead><tr><th>Fecha de envío</th><th>Estudiante</th><th>Curso</th><th>Período</th><th>Destinatario</th><th class="centro">Reportes</th><th>Estado de entrega</th><th>Enviado por</th></tr></thead>
          <tbody>${lista.map((n) => { const e = estMap.get(n.estudiante_id) || {}; return `<tr>
            <td class="principal" data-etq="Fecha"><strong>${U.fmtFechaHora(n.enviado_en)}</strong></td>
            <td data-etq="Estudiante">${U.esc(U.nombre(e))}</td><td data-etq="Curso">${U.esc(A.curso(e.curso_id))}</td>
            <td data-etq="Período">${U.esc(U.nombrePeriodo(A.periodo(n.periodo_id)))}</td>
            <td data-etq="Destinatario" class="peq">${U.esc(A.esAdmin() ? n.destinatario : String(n.destinatario || "").replace(/^(.{2}).*(@.*)$/, "$1•••$2"))}</td>
            <td data-etq="Reportes" class="centro num">${n.cantidad_reportes}</td>
            <td data-etq="Estado">${U.chipEstado(n.estado)}${n.error ? `<br><small class="muted" title="${U.esc(n.error)}">${U.esc(String(n.error).slice(0, 60))}</small>` : ""}</td>
            <td data-etq="Enviado por" class="peq">${U.esc(n.enviado_por_nombre || "")}</td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="vacio">${U.ico("correo")}<h3>Sin notificaciones</h3><p>No se han enviado notificaciones con los filtros seleccionados.</p></div>`}
      </div>`;
  }

  async function alClic(e) {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    const acc = b.dataset.accion;
    if (acc === "notificar") { await notificar(b.dataset.est, b.dataset.per); }
    if (acc === "reporte") LT.reporteIndividual(b.dataset.est, b.dataset.per);
    if (acc === "notificar-sel") notificarVarios();
    if (acc === "exportar-seg") exportarSeguimiento();
    if (acc === "exportar-hist") exportarHistorial();
  }
  function alCheck(e) {
    if (e.target.id === "s-todos") {
      U.$$("[data-sel]", raiz).forEach((c) => { const s = filasSeg.find((x) => x.clave === c.dataset.sel); if (!e.target.checked || (s && s.pendiente)) { c.checked = e.target.checked; c.checked ? seleccion.add(c.dataset.sel) : seleccion.delete(c.dataset.sel); } });
    } else if (e.target.dataset.sel) {
      e.target.checked ? seleccion.add(e.target.dataset.sel) : seleccion.delete(e.target.dataset.sel);
    } else return;
    U.$$("[data-sel]", raiz).forEach((c) => c.closest("tr").classList.toggle("seleccionada", c.checked));
    const btn = U.$("[data-accion=notificar-sel]", raiz);
    btn.disabled = !seleccion.size; btn.innerHTML = `${U.ico("correo")}Notificar seleccionados (${seleccion.size})`;
  }

  /* Previsualiza y envía el correo al acudiente */
  async function notificar(estId, perId) {
    const b = LT.estado.backend;
    let previa;
    try { previa = await b.notificar(estId, perId, { modo: "previsualizar" }); }
    catch (err) { U.toast(LT.error(err), "error", 7000); return; }
    const enviado = await U.modal({
      titulo: "Notificar acudiente", tam: "lg",
      html: `<dl class="ficha" style="margin-bottom:12px"><div><dt>Para</dt><dd>${U.esc(previa.destinatario)}</dd></div><div><dt>Asunto</dt><dd>${U.esc(previa.asunto)}</dd></div></dl>
        ${LT.estado.backend.modo === "demo" ? `<div class="aviso aviso--alerta">${U.ico("info")}<div>Modo demostración: el envío se simula. En producción el correo sale realmente desde el Gmail institucional.</div></div>` : ""}
        ${LT.estado.backend.modo === "google" && previa.cupo != null ? `<div class="aviso aviso--info">${U.ico("info")}<div>Se enviará desde la cuenta de Gmail institucional (quedará en su carpeta «Enviados»). Correos disponibles hoy: <strong>${previa.cupo}</strong>.</div></div>` : ""}
        <iframe class="vista-correo" id="n-vista" title="Vista previa del correo" sandbox=""></iframe>`,
      alAbrir: (m) => { U.$("#n-vista", m).srcdoc = previa.html; },
      botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Enviar correo", clase: "btn--primario", icono: "correo", accion: async () => {
        try { return await b.notificar(estId, perId, { modo: "enviar" }); }
        catch (err) {
          if (!err.requiereConfirmacion) throw err;
          if (!(await U.confirmar("Notificación reciente", `${U.esc(err.message)} ¿Desea enviarla de nuevo?`, { texto: "Enviar de nuevo" }))) return false;
          return b.notificar(estId, perId, { modo: "enviar", forzar: true });
        }
      } }],
    });
    if (enviado && enviado.ok) U.toast(`Correo enviado a ${enviado.destinatario}`);
    else if (enviado && enviado.ok === false) U.toast(`No se pudo enviar: ${enviado.error || "error del proveedor"}`, "error", 8000);
    if (enviado) await cargar();
  }

  async function notificarVarios() {
    const sel = filasSeg.filter((x) => seleccion.has(x.clave));
    if (!sel.length) return;
    const ok = await U.confirmar("Notificar acudientes", `Se enviará el correo institucional a <strong>${U.plural(sel.length, "acudiente")}</strong>. Los acudientes ya notificados hoy se omitirán.`, { texto: "Enviar correos" });
    if (!ok) return;
    const btn = U.$("[data-accion=notificar-sel]", raiz);
    U.ocupado(btn, true);
    let enviados = 0, omitidos = 0; const fallos = [];
    for (const s of sel) {
      try { const r = await LT.estado.backend.notificar(s.estudiante.id, s.periodoId, { modo: "enviar" }); r.ok ? enviados++ : fallos.push(`${U.nombre(s.estudiante)}: ${r.error}`); }
      catch (err) { err.requiereConfirmacion ? omitidos++ : fallos.push(`${U.nombre(s.estudiante)}: ${LT.error(err)}`); }
    }
    seleccion.clear();
    U.toast(`${U.plural(enviados, "correo enviado", "correos enviados")}${omitidos ? ` · ${omitidos} omitidos (ya notificados hoy)` : ""}${fallos.length ? ` · ${fallos.length} con error` : ""}`, fallos.length ? "aviso" : "ok", 7000);
    if (fallos.length) U.toast(fallos[0], "error", 9000);
    await cargar();
  }

  function filtrosTexto() {
    return [["Período", f.periodo ? U.nombrePeriodo(A.periodo(f.periodo)) : "Todo el año"], ["Grado", f.grado ? A.grado(f.grado) : "Todos"], ["Curso", f.curso ? A.curso(f.curso) : "Todos"], ["Límite", `Más de ${A.umbral()} llegadas tarde`]];
  }
  function exportarSeguimiento() {
    LT.exportar.excel({ nombre: "seguimiento_llegadas_tarde", hojas: [{
      nombre: "Seguimiento", titulo: "Estudiantes en seguimiento por llegadas tarde", filtros: filtrosTexto(),
      columnas: [{ t: "Estudiante", ancho: 30 }, { t: "Documento", ancho: 14 }, { t: "Grado", ancho: 11 }, { t: "Curso", ancho: 9 }, { t: "Período", ancho: 16 }, { t: "Llegadas tarde", ancho: 12 }, { t: "Fechas", ancho: 60 }, { t: "Última notificación", ancho: 18 }, { t: "Estado", ancho: 12 }],
      filas: filasSeg.map((s) => [U.nombre(s.estudiante), s.estudiante.documento, A.grado(s.estudiante.grado_id), A.curso(s.estudiante.curso_id), U.nombrePeriodo(A.periodo(s.periodoId)), s.cantidad,
        s.llegadas.map((l) => U.fmtFecha(l.fecha)).join(", "), s.ultimaNotif ? U.fmtFechaHora(s.ultimaNotif.enviado_en) : "Sin notificar", s.ultimaNotif ? U.textoEstado(s.ultimaNotif.estado) : ""]),
    }] });
  }
  function exportarHistorial() {
    const estMap = new Map(datos.estudiantes.map((e) => [e.id, e]));
    const lista = datos.notificaciones.filter((n) => coincide(estMap.get(n.estudiante_id)) && (!f.estadoNotif || n.estado === f.estadoNotif));
    LT.exportar.excel({ nombre: "historial_notificaciones", hojas: [{
      nombre: "Notificaciones", titulo: "Historial de notificaciones a acudientes", filtros: filtrosTexto(),
      columnas: [{ t: "Fecha de envío", ancho: 18 }, { t: "Estudiante", ancho: 30 }, { t: "Grado", ancho: 11 }, { t: "Curso", ancho: 9 }, { t: "Período", ancho: 16 }, { t: "Destinatario", ancho: 30 }, { t: "Reportes", ancho: 10 }, { t: "Estado", ancho: 12 }, { t: "Detalle", ancho: 30 }, { t: "Enviado por", ancho: 24 }],
      filas: lista.map((n) => { const e = estMap.get(n.estudiante_id) || {}; return [U.fmtFechaHora(n.enviado_en), U.nombre(e), A.grado(e.grado_id), A.curso(e.curso_id), U.nombrePeriodo(A.periodo(n.periodo_id)),
        A.esAdmin() ? n.destinatario : String(n.destinatario || "").replace(/^(.{2}).*(@.*)$/, "$1•••$2"), n.cantidad_reportes, U.textoEstado(n.estado), n.error || "", n.enviado_por_nombre || ""]; }),
    }] });
  }

  /* ---------------- Reporte individual del estudiante ---------------- */
  LT.reporteIndividual = async function (estId, periodoId) {
    const b = LT.estado.backend;
    const est = (await A.estudiantes()).find((x) => x.id === estId);
    if (!est) { U.toast("Estudiante no encontrado", "error"); return; }
    const [todas, notifs] = await Promise.all([b.llegadas({ estudianteId: estId }), b.notificaciones({ estudianteId: estId })]);
    let per = periodoId || "";
    const admin = A.esAdmin();

    const construir = () => {
      const ll = todas.filter((l) => !per || l.periodo_id === per).sort((a, c) => a.fecha.localeCompare(c.fecha));
      const ns = notifs.filter((n) => !per || n.periodo_id === per);
      const resumen = LT.estado.cat.periodos.map((p) => ({ p, n: todas.filter((l) => l.periodo_id === p.id).length })).filter((x) => x.n);
      return { ll, ns, resumen };
    };
    const html = () => {
      const { ll, ns, resumen } = construir();
      const dato = (k, v) => `<div><dt>${k}</dt><dd>${U.esc(v ?? "—") || "—"}</dd></div>`;
      return `
        <div class="filtros" style="box-shadow:none;margin-bottom:14px"><label class="campo"><span>Período</span><select class="control" id="ri-per">${U.opciones(LT.estado.cat.periodos, per, { vacio: "Todo el año", texto: U.nombrePeriodo })}</select></label></div>
        <div class="bloque-titulo">Estudiante</div>
        <dl class="ficha">${dato("Nombre", U.nombre(est))}${dato("Documento", `${est.tipo_documento} ${est.documento}`)}${dato("Edad", est.edad)}${dato("Grado", A.grado(est.grado_id))}${dato("Curso", A.curso(est.curso_id))}${dato("Llegadas en la selección", ll.length)}</dl>
        <div class="bloque-titulo">Acudiente</div>
        ${admin ? `<dl class="ficha">${dato("Nombre", est.acudiente_nombre)}${dato("Parentesco", est.acudiente_parentesco)}${dato("Correo", est.acudiente_correo)}${dato("Teléfono", est.acudiente_telefono)}${dato("Dirección", est.direccion)}</dl>`
          : `<p class="muted peq">Datos de contacto protegidos (solo administradores).</p>`}
        <div class="bloque-titulo">Resumen por período</div>
        <div class="resumen-import">${resumen.length ? resumen.map((x) => `<span class="chip ${x.n > A.umbral() ? "chip--peligro" : ""}">${U.esc(U.nombrePeriodo(x.p))}: ${x.n}</span>`).join("") : '<span class="muted">Sin registros</span>'}</div>
        <div class="bloque-titulo">Llegadas tarde (${ll.length})</div>
        ${ll.length ? `<div class="tabla-import"><table class="tabla"><thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Período</th><th>Registró</th><th>Observación</th></tr></thead><tbody>
          ${ll.map((l, i) => `<tr><td>${i + 1}</td><td>${U.fmtFecha(l.fecha, "larga")}</td><td class="num">${U.fmtHora(l.hora)}</td><td>${U.esc(U.nombrePeriodo(A.periodo(l.periodo_id)))}</td><td>${U.esc(l.registrado_por_nombre || "")}</td><td>${U.esc(l.observacion || "")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Sin llegadas tarde en la selección.</p>'}
        <div class="bloque-titulo">Notificaciones (${ns.length})</div>
        ${ns.length ? ns.map((n) => `<div class="peq" style="padding:3px 0">${U.fmtFechaHora(n.enviado_en)} · ${U.esc(U.nombrePeriodo(A.periodo(n.periodo_id)))} · ${n.cantidad_reportes} reportes · ${U.chipEstado(n.estado)}</div>`).join("") : '<p class="muted">Sin notificaciones.</p>'}`;
    };
    await U.modal({
      titulo: "Reporte individual", tam: "lg", html: html(),
      alAbrir: (m) => {
        const enlazar = () => U.$("#ri-per", m).addEventListener("change", (e) => { per = e.target.value; U.$(".modal__cuerpo", m).innerHTML = html(); enlazar(); });
        enlazar();
      },
      botones: [
        { texto: "Excel", icono: "excel", accion: async () => { await excelIndividual(); return false; } },
        { texto: "Descargar PDF", clase: "btn--primario", icono: "pdf", accion: async () => { await pdfIndividual(); return false; } },
      ],
    });

    function pares() {
      const { ll } = construir();
      const p = [["Estudiante", U.nombre(est)], ["Documento", `${est.tipo_documento} ${est.documento}`], ["Edad", est.edad ?? "—"], ["Grado", A.grado(est.grado_id)], ["Curso", A.curso(est.curso_id)],
        ["Período", per ? U.nombrePeriodo(A.periodo(per)) : "Todo el año"], ["Cantidad de llegadas tarde", ll.length], ["Límite institucional", `Más de ${A.umbral()}`]];
      if (admin) p.push(["Acudiente", est.acudiente_nombre || "—"], ["Parentesco", est.acudiente_parentesco || "—"], ["Correo del acudiente", est.acudiente_correo || "—"], ["Teléfono", est.acudiente_telefono || "—"], ["Dirección", est.direccion || "—"]);
      return p;
    }
    async function pdfIndividual() {
      const { ll, ns, resumen } = construir();
      await LT.exportar.pdf({
        titulo: "Reporte individual de llegadas tarde", nombre: `reporte_${U.nombre(est)}`,
        subtitulo: `${U.nombre(est)} · ${A.grado(est.grado_id)} · Curso ${A.curso(est.curso_id)}`,
        bloques: [
          { tipo: "titulo", texto: "Datos del estudiante y acudiente" }, { tipo: "ficha", pares: pares() },
          { tipo: "tabla", titulo: "Resumen por período", columnas: ["Período", "Llegadas tarde", "Situación"], filas: resumen.map((x) => [U.nombrePeriodo(x.p), x.n, x.n > A.umbral() ? "En seguimiento" : "Dentro del límite"]) },
          { tipo: "tabla", titulo: "Detalle de llegadas tarde", columnas: ["#", "Fecha", "Hora", "Período", "Registró", "Observación"],
            filas: ll.map((l, i) => [i + 1, U.fmtFecha(l.fecha, "larga"), U.fmtHora(l.hora), U.nombrePeriodo(A.periodo(l.periodo_id)), l.registrado_por_nombre || "", l.observacion || ""]) },
          { tipo: "tabla", titulo: "Notificaciones al acudiente", columnas: ["Fecha de envío", "Período", "Reportes", "Estado"],
            filas: ns.map((n) => [U.fmtFechaHora(n.enviado_en), U.nombrePeriodo(A.periodo(n.periodo_id)), n.cantidad_reportes, U.textoEstado(n.estado)]) },
          { tipo: "texto", texto: `\n\n______________________________                ______________________________\n${LT.estado.cat.config.responsable_cargo || "Coordinación"}                                          Acudiente` },
        ],
      });
    }
    async function excelIndividual() {
      const { ll, ns } = construir();
      await LT.exportar.excel({ nombre: `reporte_${U.nombre(est)}`, hojas: [
        { nombre: "Estudiante", titulo: "Reporte individual de llegadas tarde", pares: pares() },
        { nombre: "Llegadas tarde", titulo: `Llegadas tarde · ${U.nombre(est)}`, columnas: [{ t: "#", ancho: 5 }, { t: "Fecha", ancho: 14 }, { t: "Día", ancho: 12 }, { t: "Hora", ancho: 8 }, { t: "Período", ancho: 16 }, { t: "Registró", ancho: 26 }, { t: "Observación", ancho: 34 }],
          filas: ll.map((l, i) => [i + 1, U.fmtFecha(l.fecha), U.DIAS[U.diaSemana(l.fecha)], U.fmtHora(l.hora), U.nombrePeriodo(A.periodo(l.periodo_id)), l.registrado_por_nombre || "", l.observacion || ""]) },
        { nombre: "Notificaciones", titulo: "Notificaciones al acudiente", columnas: [{ t: "Fecha de envío", ancho: 18 }, { t: "Período", ancho: 16 }, { t: "Reportes", ancho: 10 }, { t: "Estado", ancho: 12 }, { t: "Enviado por", ancho: 26 }],
          filas: ns.map((n) => [U.fmtFechaHora(n.enviado_en), U.nombrePeriodo(A.periodo(n.periodo_id)), n.cantidad_reportes, U.textoEstado(n.estado), n.enviado_por_nombre || ""]) },
      ] });
    }
  };
})();
