/* Sección 2 · Reporte de llegadas tarde */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const A = new Proxy({}, { get: (_, k) => LT.app[k] }); // LT.app se define en app.js (se carga después)

  const f = { grado: "", curso: "", q: "", otraFecha: false, fecha: "", hora: "" };
  let estudiantes = [], llegadasPeriodo = [], seleccion = new Set(), reloj = null, raiz = null;

  LT.vistas.reportes = {
    async render(el) {
      raiz = el;
      const cat = LT.estado.cat, admin = A.esAdmin();
      el.innerHTML = `
        <div class="titular"><div><h1>Reporte de llegadas tarde</h1><p>Seleccione el grado y el curso, y reporte a uno o varios estudiantes. La fecha, hora y período se registran automáticamente.</p></div></div>
        <div class="jornada">
          <div><div class="jornada__reloj" id="j-reloj">--:--</div></div>
          <div><div class="jornada__fecha" id="j-fecha"></div><div class="jornada__periodo" id="j-periodo"></div></div>
          <div class="jornada__resumen"><div><strong id="j-hoy">0</strong><span>Reportes hoy</span></div><div><strong id="j-periodo-n">0</strong><span>En el período</span></div></div>
        </div>
        <div id="aviso-periodo"></div>
        <div class="filtros">
          <label class="campo"><span>Grado</span><select class="control" id="r-grado">${U.opciones(cat.grados, f.grado, { vacio: "Todos los grados" })}</select></label>
          <label class="campo"><span>Curso</span><select class="control" id="r-curso"><option value="${U.esc(f.curso)}"></option></select></label>
          <label class="campo campo--busqueda"><span>Buscar estudiante</span><div class="buscador">${U.ico("buscar")}<input class="control" type="search" id="r-q" placeholder="Nombre o documento" value="${U.esc(f.q)}"></div></label>
          ${admin ? `<div class="filtros__acciones" style="align-items:center"><label class="check" title="Solo administradores: registrar correcciones de días anteriores"><input type="checkbox" id="r-otra" ${f.otraFecha ? "checked" : ""}> Registrar con otra fecha</label></div>
          <div id="r-fechahora" class="filtros__acciones" ${f.otraFecha ? "" : "hidden"} style="margin-left:0">
            <label class="campo" style="min-width:150px"><span>Fecha</span><input class="control" type="date" id="r-fecha" value="${f.fecha || U.hoy()}" max="${U.hoy()}"></label>
            <label class="campo" style="min-width:120px"><span>Hora</span><input class="control" type="time" id="r-hora" value="${f.hora || "07:00"}"></label></div>` : ""}
        </div>
        <div class="dos-columnas">
          <div>
            <div class="tarjeta"><div id="r-lista"></div></div>
            <div class="barra-seleccion" id="r-barra" hidden>
              <strong id="r-nsel">0 seleccionados</strong>
              <button class="btn btn--fantasma btn--sm" id="r-limpiar">Quitar selección</button>
              <span class="espacio"></span>
              <button class="btn btn--acento" id="r-reportar-sel">${U.ico("reloj")}Reportar llegada tarde</button>
            </div>
          </div>
          <div class="tarjeta">
            <div class="tarjeta__cab"><h3>Reportes de la jornada</h3><span class="chip" id="r-fecha-lista"></span></div>
            <ul class="lista-hoy" id="r-hoy"></ul>
          </div>
        </div>`;

      A.enlazarGradoCurso(U.$("#r-grado", el), U.$("#r-curso", el), { alCambiar: () => { f.grado = U.$("#r-grado", el).value; f.curso = U.$("#r-curso", el).value; seleccion.clear(); pintarLista(); } });
      U.$("#r-q", el).addEventListener("input", U.debounce((e) => { f.q = e.target.value; pintarLista(); }, 200));
      if (admin) {
        U.$("#r-otra", el).addEventListener("change", (e) => { f.otraFecha = e.target.checked; U.$("#r-fechahora", el).hidden = !f.otraFecha; actualizarJornada(); pintarLista(); pintarHoy(); });
        U.$("#r-fecha", el).addEventListener("change", (e) => { f.fecha = e.target.value; cargar(); });
        U.$("#r-hora", el).addEventListener("change", (e) => { f.hora = e.target.value; });
      }
      U.$("#r-lista", el).addEventListener("click", alClicLista);
      U.$("#r-lista", el).addEventListener("change", alCambioCheck);
      U.$("#r-limpiar", el).addEventListener("click", () => { seleccion.clear(); pintarLista(); });
      U.$("#r-reportar-sel", el).addEventListener("click", () => reportar([...seleccion]));
      U.$("#r-hoy", el).addEventListener("click", anular);

      reloj = setInterval(actualizarJornada, 1000);
      await cargar();
    },
    destruir() { clearInterval(reloj); reloj = null; raiz = null; },
    alCambio() { if (raiz) cargar(); },
  };

  const fechaTrabajo = () => (f.otraFecha && A.esAdmin() ? f.fecha || U.hoy() : U.hoy());
  const periodoTrabajo = () => U.periodoDe(fechaTrabajo(), LT.estado.cat.periodos);

  async function cargar() {
    const p = periodoTrabajo();
    [estudiantes, llegadasPeriodo] = await Promise.all([
      A.estudiantes(true),
      p ? LT.estado.backend.llegadas({ periodoId: p.id }) : LT.estado.backend.llegadas({ desde: fechaTrabajo(), hasta: fechaTrabajo() }),
    ]);
    if (!raiz) return;
    actualizarJornada(); pintarLista(); pintarHoy();
  }

  function actualizarJornada() {
    if (!raiz) return;
    const a = U.ahora(), p = periodoTrabajo(), fecha = fechaTrabajo();
    U.$("#j-reloj", raiz).textContent = f.otraFecha && A.esAdmin() ? (f.hora || "07:00") : a.hora.slice(0, 5);
    U.$("#j-fecha", raiz).textContent = U.fmtFecha(fecha, "larga") + (fecha !== a.fecha ? " (corrección)" : "");
    U.$("#j-periodo", raiz).textContent = p ? `${U.nombrePeriodo(p)} · ${U.fmtFecha(p.fecha_inicio, "media")} – ${U.fmtFecha(p.fecha_fin, "media")}` : "Sin período académico";
    U.$("#j-hoy", raiz).textContent = llegadasPeriodo.filter((l) => l.fecha === fecha).length;
    U.$("#j-periodo-n", raiz).textContent = p ? llegadasPeriodo.length : 0;
    U.$("#aviso-periodo", raiz).innerHTML = p ? "" : `<div class="aviso aviso--alerta">${U.ico("alerta")}<div><strong>No hay un período académico configurado para ${U.fmtFecha(fecha, "larga")}.</strong> No es posible registrar llegadas tarde. ${A.esAdmin() ? 'Configure los períodos en <a href="#configuracion">Configuración</a>.' : "Informe al administrador."}</div></div>`;
  }

  function visibles() {
    const q = U.norm(f.q);
    return estudiantes.filter((e) => e.estado === "activo" && (!f.grado || e.grado_id === f.grado) && (!f.curso || e.curso_id === f.curso) &&
      (!q || U.norm(`${e.apellidos} ${e.nombres} ${e.nombres} ${e.apellidos} ${e.documento}`).includes(q)))
      .sort((a, b) => U.nombre(a).localeCompare(U.nombre(b), "es"));
  }

  function pintarLista() {
    if (!raiz) return;
    const cont = U.$("#r-lista", raiz), cat = LT.estado.cat;
    const fecha = fechaTrabajo(), umbral = A.umbral();
    if (!f.grado && !f.curso && !f.q.trim()) {
      cont.innerHTML = `<div class="tarjeta__cab"><h3>Seleccione un curso</h3><span class="muted peq">o busque por nombre</span></div>
        <div class="tarjeta__cuerpo cursos-rapidos">${cat.grados.map((g) => {
          const cs = cat.cursos.filter((c) => c.grado_id === g.id);
          return cs.length ? `<div class="cursos-rapidos__grado"><span>${U.esc(g.nombre)}</span>${cs.map((c) => `<button class="btn btn--suave btn--sm" data-curso="${c.id}">${U.esc(c.nombre)}</button>`).join("")}</div>` : "";
        }).join("") || '<p class="muted">No hay cursos configurados.</p>'}</div>`;
      U.$("#r-barra", raiz).hidden = true;
      return;
    }
    const lista = visibles();
    const porEst = LT.estadisticas.contarPor(llegadasPeriodo, "estudiante_id");
    const hoyMap = new Map(llegadasPeriodo.filter((l) => l.fecha === fecha).map((l) => [l.estudiante_id, l]));
    const seleccionables = lista.filter((e) => !hoyMap.has(e.id));
    [...seleccion].forEach((id) => { if (!seleccionables.some((e) => e.id === id)) seleccion.delete(id); });
    const todos = seleccionables.length && seleccionables.every((e) => seleccion.has(e.id));
    const titulo = f.curso ? `Curso ${A.curso(f.curso)} · ${A.grado(f.grado)}` : f.grado ? A.grado(f.grado) : "Resultados de búsqueda";
    cont.innerHTML = `
      <div class="tarjeta__cab"><h3>${U.esc(titulo)}</h3><span class="muted peq">${U.plural(lista.length, "estudiante")} · ${hoyMap.size ? U.plural([...hoyMap.keys()].filter((id) => lista.some((e) => e.id === id)).length, "reportado") + " en la jornada" : "sin reportes en la jornada"}</span></div>
      ${lista.length ? `<div class="tabla-cont"><table class="tabla tabla--responsiva"><thead><tr>
        <th class="chk"><input type="checkbox" class="check" id="r-todos" aria-label="Seleccionar todos" ${todos ? "checked" : ""} ${seleccionables.length ? "" : "disabled"}></th>
        <th>Estudiante</th><th>Curso</th><th class="centro">En el período</th><th class="centro">Acumulado</th><th class="derecha">Jornada</th></tr></thead>
      <tbody>${lista.map((e) => {
        const rep = hoyMap.get(e.id), n = porEst.get(e.id) || 0;
        return `<tr class="${seleccion.has(e.id) ? "seleccionada" : ""}">
          <td class="chk">${rep ? "" : `<input type="checkbox" data-sel="${e.id}" aria-label="Seleccionar" ${seleccion.has(e.id) ? "checked" : ""}>`}</td>
          <td class="principal" data-etq="Estudiante"><div class="estudiante-celda"><strong>${U.esc(U.nombre(e))}</strong><small>${U.esc(e.tipo_documento)} ${U.esc(e.documento)}</small></div></td>
          <td data-etq="Curso">${U.esc(A.curso(e.curso_id))}</td>
          <td data-etq="En el período" class="centro">${U.contador(n, umbral)}</td>
          <td data-etq="Acumulado" class="centro num">${e.total_llegadas || 0}</td>
          <td class="acciones-celda derecha">${rep ? `<span class="reportado">${U.ico("ok")}Reportado ${U.fmtHora(rep.hora)}</span>` :
            `<div class="acciones"><button class="btn btn--sm btn--primario" data-reportar="${e.id}">${U.ico("reloj")}Reportar llegada tarde</button></div>`}</td></tr>`;
      }).join("")}</tbody></table></div>` : `<div class="vacio">${U.ico("buscar")}<h3>Sin estudiantes</h3><p>No hay estudiantes activos con esos filtros.</p></div>`}`;
    U.$("#r-barra", raiz).hidden = seleccion.size === 0;
    U.$("#r-nsel", raiz).textContent = `${U.plural(seleccion.size, "seleccionado")}`;
  }

  function alClicLista(e) {
    const c = e.target.closest("[data-curso]");
    if (c) {
      const curso = LT.estado.cat.cursos.find((x) => x.id === c.dataset.curso);
      U.$("#r-grado", raiz).value = curso.grado_id; U.$("#r-grado", raiz).dispatchEvent(new Event("change"));
      U.$("#r-curso", raiz).value = curso.id; U.$("#r-curso", raiz).dispatchEvent(new Event("change"));
      return;
    }
    const b = e.target.closest("[data-reportar]");
    if (b) reportar([b.dataset.reportar]);
  }
  function alCambioCheck(e) {
    if (e.target.id === "r-todos") {
      const fecha = fechaTrabajo();
      const ya = new Set(llegadasPeriodo.filter((l) => l.fecha === fecha).map((l) => l.estudiante_id));
      visibles().filter((x) => !ya.has(x.id)).forEach((x) => (e.target.checked ? seleccion.add(x.id) : seleccion.delete(x.id)));
      pintarLista(); return;
    }
    const id = e.target.dataset.sel;
    if (!id) return;
    e.target.checked ? seleccion.add(id) : seleccion.delete(id);
    e.target.closest("tr").classList.toggle("seleccionada", e.target.checked);
    U.$("#r-barra", raiz).hidden = seleccion.size === 0;
    U.$("#r-nsel", raiz).textContent = `${U.plural(seleccion.size, "seleccionado")}`;
    const todos = U.$("#r-todos", raiz);
    if (todos) todos.checked = U.$$("[data-sel]", raiz).every((x) => x.checked);
  }

  async function reportar(ids) {
    if (!ids.length) return;
    const p = periodoTrabajo();
    if (!p) { U.toast("No hay período académico para la fecha seleccionada", "error"); return; }
    const correccion = f.otraFecha && A.esAdmin();
    const fecha = fechaTrabajo(), hora = correccion ? (f.hora || "07:00") : U.ahora().hora.slice(0, 5);
    const nombres = ids.map((id) => estudiantes.find((e) => e.id === id)).filter(Boolean);
    const r = await U.modal({
      titulo: ids.length === 1 ? "Reportar llegada tarde" : `Reportar ${ids.length} llegadas tarde`,
      html: `<dl class="ficha" style="margin-bottom:14px">
          <div><dt>Fecha</dt><dd>${U.fmtFecha(fecha, "larga")}</dd></div>
          <div><dt>Hora</dt><dd>${hora}${correccion ? "" : " (hora del servidor al guardar)"}</dd></div>
          <div><dt>Período</dt><dd>${U.esc(U.nombrePeriodo(p))}</dd></div></dl>
        <div class="tabla-import" style="max-height:220px;margin-bottom:14px"><table class="tabla"><tbody>${nombres.map((e) => `<tr><td><strong>${U.esc(U.nombre(e))}</strong></td><td>${U.esc(A.grado(e.grado_id))}</td><td>${U.esc(A.curso(e.curso_id))}</td></tr>`).join("")}</tbody></table></div>
        <label class="campo"><span>Observación (opcional)</span><input id="r-obs" maxlength="200" placeholder="Ej.: llegó con acudiente, transporte escolar…"></label>`,
      botones: [{ texto: "Cancelar", clase: "btn--fantasma" }, { texto: "Confirmar reporte", clase: "btn--acento", icono: "reloj", accion: async (m) => {
        const obs = U.$("#r-obs", m.el).value;
        return LT.estado.backend.reportarLlegadas(ids, obs, correccion ? fecha : null, correccion ? hora + ":00" : null);
      } }],
    });
    if (!Array.isArray(r)) return;
    const ok = r.filter((x) => x.estado === "registrado").length, dup = r.filter((x) => x.estado === "duplicado").length, err = r.filter((x) => x.estado === "error");
    if (ok) U.toast(`${U.plural(ok, "llegada tarde registrada", "llegadas tarde registradas")}${dup ? ` · ${dup} ya estaban reportadas hoy` : ""}`);
    else if (dup) U.toast(`${dup === 1 ? "El estudiante ya tenía" : "Los estudiantes ya tenían"} reporte en esta jornada. No se duplicó.`, "aviso");
    if (err.length) U.toast(err[0].mensaje, "error", 7000);
    seleccion.clear();
    A.invalidarEstudiantes();
    await cargar();
    // Aviso de seguimiento
    const umbral = A.umbral();
    const cuenta = LT.estadisticas.contarPor(llegadasPeriodo, "estudiante_id");
    const superan = r.filter((x) => x.estado === "registrado" && cuenta.get(x.estudiante_id) === umbral + 1);
    if (superan.length) U.toast(`${U.plural(superan.length, "estudiante superó", "estudiantes superaron")} el límite de ${umbral} llegadas tarde y ${superan.length === 1 ? "pasa" : "pasan"} a Seguimiento.`, "aviso", 7000);
  }

  function pintarHoy() {
    if (!raiz) return;
    const fecha = fechaTrabajo();
    U.$("#r-fecha-lista", raiz).textContent = U.fmtFecha(fecha, "media");
    const estMap = new Map(estudiantes.map((e) => [e.id, e]));
    const hoy = llegadasPeriodo.filter((l) => l.fecha === fecha).sort((a, b) => b.hora.localeCompare(a.hora));
    U.$("#r-hoy", raiz).innerHTML = hoy.length ? hoy.map((l) => `<li>
        <span class="hora">${U.fmtHora(l.hora)}</span>
        <span class="det"><strong>${U.esc(U.nombre(estMap.get(l.estudiante_id)) || "—")}</strong><small>${U.esc(l.grado_nombre)} · ${U.esc(l.curso_nombre)} · ${U.esc(l.registrado_por_nombre || "")}${l.observacion ? " · " + U.esc(l.observacion) : ""}</small></span>
        ${A.esAdmin() ? `<button class="btn-icono" title="Anular reporte" aria-label="Anular reporte" data-anular="${l.id}">${U.ico("borrar")}</button>` : ""}</li>`).join("")
      : `<li class="muted" style="justify-content:center;padding:28px">Aún no hay reportes en esta jornada.</li>`;
  }

  async function anular(e) {
    const b = e.target.closest("[data-anular]");
    if (!b) return;
    const l = llegadasPeriodo.find((x) => x.id === b.dataset.anular);
    const est = estudiantes.find((x) => x.id === l.estudiante_id);
    if (!(await U.confirmar("Anular reporte", `¿Anular la llegada tarde de <strong>${U.esc(U.nombre(est))}</strong> del ${U.fmtFecha(l.fecha, "larga")} a las ${U.fmtHora(l.hora)}? Quedará registro en la auditoría.`, { texto: "Anular", peligro: true }))) return;
    try { await LT.estado.backend.eliminarLlegada(l.id); U.toast("Reporte anulado"); A.invalidarEstudiantes(); await cargar(); }
    catch (err) { U.toast(LT.error(err), "error"); }
  }
})();
