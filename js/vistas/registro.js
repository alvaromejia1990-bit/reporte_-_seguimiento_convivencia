/* Sección 1 · Registro de estudiantes */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const A = new Proxy({}, { get: (_, k) => LT.app[k] }); // LT.app se define en app.js (se carga después)
  LT.vistas = LT.vistas || {};

  const f = { q: "", grado: "", curso: "", estado: "activo", pagina: 1 };
  let lista = [];

  LT.vistas.registro = {
    async render(el) {
      const admin = A.esAdmin();
      const cat = LT.estado.cat;
      el.innerHTML = `
        <div class="titular">
          <div><h1>Registro de estudiantes</h1>
            <p>${admin ? "Base de datos institucional: registre, consulte, edite y cargue estudiantes de forma masiva." : "Consulta de estudiantes. Los datos de contacto del acudiente son de acceso restringido."}</p></div>
          ${admin ? `<div class="titular__acciones">
            <button class="btn" id="btn-plantilla">${U.ico("bajar")}Plantilla</button>
            <button class="btn" id="btn-exportar">${U.ico("excel")}Exportar</button>
            <button class="btn btn--suave" id="btn-importar">${U.ico("subir")}Carga masiva</button>
            <button class="btn btn--primario" id="btn-nuevo">${U.ico("mas")}Nuevo estudiante</button></div>` : ""}
        </div>
        <div class="filtros">
          <label class="campo campo--busqueda"><span>Buscar</span>
            <div class="buscador">${U.ico("buscar")}<input class="control" id="f-q" type="search" placeholder="Nombre, documento${admin ? " o acudiente" : ""}" value="${U.esc(f.q)}"></div></label>
          <label class="campo"><span>Grado</span><select class="control" id="f-grado">${U.opciones(cat.grados, f.grado, { vacio: "Todos los grados" })}</select></label>
          <label class="campo"><span>Curso</span><select class="control" id="f-curso"></select></label>
          <label class="campo"><span>Estado</span><select class="control" id="f-estado">
            <option value="activo" ${f.estado === "activo" ? "selected" : ""}>Activos</option>
            <option value="retirado" ${f.estado === "retirado" ? "selected" : ""}>Retirados</option>
            <option value="" ${f.estado === "" ? "selected" : ""}>Todos</option></select></label>
        </div>
        <div class="tarjeta">
          <div class="tabla-cont" id="tabla-est"></div>
          <div class="tarjeta__pie" id="pie-est"></div>
        </div>`;

      const selC = U.$("#f-curso", el); selC.innerHTML = `<option value="${U.esc(f.curso)}"></option>`;
      A.enlazarGradoCurso(U.$("#f-grado", el), selC, { alCambiar: () => { f.grado = U.$("#f-grado", el).value; f.curso = selC.value; f.pagina = 1; pintar(el); } });
      U.$("#f-q", el).addEventListener("input", U.debounce((e) => { f.q = e.target.value; f.pagina = 1; pintar(el); }, 200));
      U.$("#f-estado", el).addEventListener("change", (e) => { f.estado = e.target.value; f.pagina = 1; pintar(el); });
      if (admin) {
        U.$("#btn-nuevo", el).addEventListener("click", () => formulario(null, el));
        U.$("#btn-importar", el).addEventListener("click", () => cargaMasiva(el));
        U.$("#btn-plantilla", el).addEventListener("click", () => LT.exportar.plantillaEstudiantes());
        U.$("#btn-exportar", el).addEventListener("click", () => exportar());
      }
      U.$("#tabla-est", el).addEventListener("click", (e) => {
        const b = e.target.closest("[data-accion]");
        if (!b) return;
        const est = lista.find((x) => x.id === b.dataset.id);
        if (b.dataset.accion === "ver") ficha(est, el);
        if (b.dataset.accion === "editar") formulario(est, el);
      });
      U.$("#pie-est", el).addEventListener("click", (e) => { const b = e.target.closest("[data-pag]"); if (b) { f.pagina = Number(b.dataset.pag); pintar(el); } });
      lista = await A.estudiantes(true);
      pintar(el);
    },
  };

  function filtrar() {
    const q = U.norm(f.q);
    return lista.filter((e) =>
      (!f.estado || e.estado === f.estado) && (!f.grado || e.grado_id === f.grado) && (!f.curso || e.curso_id === f.curso) &&
      (!q || U.norm(`${e.apellidos} ${e.nombres} ${e.nombres} ${e.apellidos} ${e.documento} ${e.acudiente_nombre || ""}`).includes(q)))
      .sort((a, b) => U.nombre(a).localeCompare(U.nombre(b), "es"));
  }

  function pintar(el) {
    const admin = A.esAdmin(), umbral = A.umbral();
    const filas = filtrar();
    const pg = U.paginar(filas, f.pagina, 50);
    f.pagina = pg.pagina;
    const cont = U.$("#tabla-est", el);
    if (!lista.length) {
      cont.innerHTML = `<div class="vacio">${U.ico("usuarios")}<h3>Aún no hay estudiantes registrados</h3><p>${admin ? "Registre estudiantes uno a uno o use la carga masiva desde Excel o CSV." : "El administrador debe registrar los estudiantes."}</p></div>`;
    } else if (!filas.length) {
      cont.innerHTML = `<div class="vacio">${U.ico("buscar")}<h3>Sin resultados</h3><p>Ajuste los filtros de búsqueda.</p></div>`;
    } else {
      cont.innerHTML = `<table class="tabla tabla--responsiva"><thead><tr>
          <th>Estudiante</th><th>Documento</th><th class="centro">Edad</th><th>Grado</th><th>Curso</th>
          ${admin ? "<th>Acudiente</th><th>Contacto</th>" : ""}<th class="centro">Llegadas tarde</th><th class="derecha">Acciones</th></tr></thead>
        <tbody>${pg.filas.map((e) => `<tr>
          <td class="principal" data-etq="Estudiante"><div class="estudiante-celda"><strong>${U.esc(U.nombre(e))}</strong>${e.estado === "retirado" ? '<small><span class="chip">Retirado</span></small>' : ""}</div></td>
          <td data-etq="Documento" class="num" style="white-space:nowrap">${U.esc(e.tipo_documento)} ${U.esc(e.documento)}</td>
          <td data-etq="Edad" class="centro">${e.edad ?? "—"}</td>
          <td data-etq="Grado">${U.esc(A.grado(e.grado_id))}</td>
          <td data-etq="Curso">${U.esc(A.curso(e.curso_id))}</td>
          ${admin ? `<td data-etq="Acudiente">${U.esc(e.acudiente_nombre || "—")}${e.acudiente_parentesco ? `<br><small class="muted">${U.esc(e.acudiente_parentesco)}</small>` : ""}</td>
          <td data-etq="Contacto"><div class="estudiante-celda">${e.acudiente_correo ? `<span class="peq">${U.esc(e.acudiente_correo)}</span>` : '<span class="chip chip--alerta">Sin correo</span>'}<small>${U.esc(e.acudiente_telefono || "")}</small></div></td>` : ""}
          <td data-etq="Llegadas tarde" class="centro">${U.contador(e.total_llegadas || 0, Infinity)}</td>
          <td class="acciones-celda"><div class="acciones">
            <button class="btn btn--sm" data-accion="ver" data-id="${e.id}">${U.ico("ojo")}Ver</button>
            ${admin ? `<button class="btn btn--sm btn--suave" data-accion="editar" data-id="${e.id}">${U.ico("editar")}Editar</button>` : ""}
          </div></td></tr>`).join("")}</tbody></table>`;
    }
    U.$("#pie-est", el).innerHTML = U.htmlPaginacion(pg, filas.length) + `<span class="muted peq">Total en la base: ${U.plural(lista.length, "estudiante")}</span>`;
    void umbral;
  }

  /* ---------------- Ficha (consultar) ---------------- */
  async function ficha(e, el) {
    const admin = A.esAdmin();
    const [ll, ns] = await Promise.all([LT.estado.backend.llegadas({ estudianteId: e.id }), LT.estado.backend.notificaciones({ estudianteId: e.id })]);
    ll.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const dato = (k, v) => `<div><dt>${k}</dt><dd>${U.esc(v ?? "—") || "—"}</dd></div>`;
    const accion = await U.modal({
      titulo: U.nombre(e), tam: "lg",
      html: `
        <div class="bloque-titulo">Datos del estudiante</div>
        <dl class="ficha">${dato("Documento", `${e.tipo_documento} ${e.documento}`)}${dato("Edad", e.edad)}${dato("Grado", A.grado(e.grado_id))}${dato("Curso", A.curso(e.curso_id))}${dato("Estado", e.estado === "activo" ? "Activo" : "Retirado")}${dato("Llegadas tarde acumuladas", e.total_llegadas)}</dl>
        <div class="bloque-titulo">Acudiente</div>
        ${admin ? `<dl class="ficha">${dato("Nombre", e.acudiente_nombre)}${dato("Parentesco", e.acudiente_parentesco)}${dato("Correo", e.acudiente_correo)}${dato("Teléfono", e.acudiente_telefono)}${dato("Dirección", e.direccion)}</dl>`
          : `<div class="aviso aviso--info">${U.ico("escudo")}<div>Datos de contacto protegidos. Solo el administrador puede consultarlos. ${e.tiene_correo_acudiente ? "El acudiente tiene correo registrado." : "<strong>El acudiente no tiene correo registrado.</strong>"}</div></div>`}
        <div class="bloque-titulo">Últimas llegadas tarde</div>
        ${ll.length ? `<div class="tabla-cont"><table class="tabla"><thead><tr><th>Fecha</th><th>Hora</th><th>Período</th><th>Registró</th></tr></thead><tbody>
          ${ll.slice(0, 12).map((l) => `<tr><td>${U.fmtFecha(l.fecha, "larga")}</td><td class="num">${U.fmtHora(l.hora)}</td><td>${U.esc(U.nombrePeriodo(A.periodo(l.periodo_id)))}</td><td>${U.esc(l.registrado_por_nombre || "")}</td></tr>`).join("")}
          </tbody></table></div>${ll.length > 12 ? `<p class="muted peq">… y ${ll.length - 12} más. Vea el reporte completo en Seguimiento.</p>` : ""}` : '<p class="muted">No registra llegadas tarde.</p>'}
        <div class="bloque-titulo">Notificaciones al acudiente</div>
        ${ns.length ? ns.map((n) => `<div class="peq" style="padding:4px 0">${U.fmtFechaHora(n.enviado_en)} · ${U.esc(U.nombrePeriodo(A.periodo(n.periodo_id)))} · ${n.cantidad_reportes} reportes · ${U.chipEstado(n.estado)}</div>`).join("") : '<p class="muted">Sin notificaciones enviadas.</p>'}`,
      botones: admin ? [
        { texto: "Eliminar", clase: "btn--fantasma", valor: "eliminar", icono: "borrar" },
        { texto: e.estado === "activo" ? "Marcar como retirado" : "Reactivar", clase: "", valor: "estado" },
        { texto: "Editar", clase: "btn--primario", valor: "editar", icono: "editar" },
      ] : [{ texto: "Cerrar", clase: "btn--primario" }],
    });
    if (accion === "editar") formulario(e, el);
    if (accion === "estado") {
      try { await LT.estado.backend.guardarEstudiante({ ...e, estado: e.estado === "activo" ? "retirado" : "activo" }); U.toast("Estado actualizado"); recargar(el); }
      catch (err) { U.toast(LT.error(err), "error"); }
    }
    if (accion === "eliminar") {
      const ok = await U.confirmar("Eliminar estudiante", `Se eliminará a <strong>${U.esc(U.nombre(e))}</strong> junto con <strong>todas sus llegadas tarde y notificaciones</strong>. Esta acción no se puede deshacer.<br><br>Si el estudiante se retiró, es preferible marcarlo como retirado para conservar el historial.`, { texto: "Eliminar definitivamente", peligro: true });
      if (ok) { try { await LT.estado.backend.eliminarEstudiante(e.id); U.toast("Estudiante eliminado"); recargar(el); } catch (err) { U.toast(LT.error(err), "error"); } }
    }
  }

  async function recargar(el) { lista = await A.estudiantes(true); pintar(el); }

  /* ---------------- Formulario ---------------- */
  async function formulario(e, el) {
    const cat = LT.estado.cat;
    const v = e || { tipo_documento: "TI", estado: "activo", grado_id: f.grado || "", curso_id: f.curso || "" };
    const r = (n, et, req) => `<span>${et}${req ? ' <b class="req">*</b>' : ""}</span>`;
    await U.modal({
      titulo: e ? "Editar estudiante" : "Nuevo estudiante", tam: "lg",
      html: `<form id="form-est" class="rejilla" novalidate>
        <div class="seccion-form">Estudiante</div>
        <label class="campo">${r("tipo", "Tipo de documento", true)}<select name="tipo_documento">${Object.entries(U.TIPOS_DOC).map(([k, t]) => `<option value="${k}" ${v.tipo_documento === k ? "selected" : ""}>${k} · ${t}</option>`).join("")}</select></label>
        <label class="campo">${r("doc", "Número de documento", true)}<input name="documento" value="${U.esc(v.documento || "")}" inputmode="numeric" maxlength="20" required><small class="error"></small></label>
        <label class="campo">${r("ape", "Apellidos", true)}<input name="apellidos" value="${U.esc(v.apellidos || "")}" required><small class="error"></small></label>
        <label class="campo">${r("nom", "Nombres", true)}<input name="nombres" value="${U.esc(v.nombres || "")}" required><small class="error"></small></label>
        <label class="campo">${r("edad", "Edad", true)}<input name="edad" type="number" min="3" max="30" value="${v.edad ?? ""}"><small class="error"></small></label>
        <label class="campo">${r("g", "Grado", true)}<select name="grado_id">${U.opciones(cat.grados, v.grado_id, { vacio: "Seleccione…" })}</select><small class="error"></small></label>
        <label class="campo">${r("c", "Curso", true)}<select name="curso_id"><option value="${U.esc(v.curso_id || "")}"></option></select><small class="error"></small></label>
        <label class="campo"><span>Estado</span><select name="estado"><option value="activo" ${v.estado === "activo" ? "selected" : ""}>Activo</option><option value="retirado" ${v.estado === "retirado" ? "selected" : ""}>Retirado</option></select></label>
        <div class="seccion-form">Acudiente</div>
        <label class="campo">${r("an", "Nombre del acudiente", true)}<input name="acudiente_nombre" value="${U.esc(v.acudiente_nombre || "")}"><small class="error"></small></label>
        <label class="campo"><span>Parentesco</span><input name="acudiente_parentesco" list="lista-parentesco" value="${U.esc(v.acudiente_parentesco || "")}">
          <datalist id="lista-parentesco"><option>Madre</option><option>Padre</option><option>Abuela</option><option>Abuelo</option><option>Tía</option><option>Tío</option><option>Hermana</option><option>Hermano</option><option>Tutor legal</option></datalist></label>
        <label class="campo">${r("ac", "Correo electrónico del acudiente", false)}<input name="acudiente_correo" type="email" value="${U.esc(v.acudiente_correo || "")}"><small class="ayuda">Necesario para enviar notificaciones.</small><small class="error"></small></label>
        <label class="campo">${r("at", "Teléfono", true)}<input name="acudiente_telefono" type="tel" value="${U.esc(v.acudiente_telefono || "")}"><small class="error"></small></label>
        <label class="campo ancho-total"><span>Dirección</span><input name="direccion" value="${U.esc(v.direccion || "")}"></label>
      </form>`,
      alAbrir: (m) => A.enlazarGradoCurso(U.$("[name=grado_id]", m), U.$("[name=curso_id]", m), { vacioCurso: "Seleccione…" }),
      botones: [
        { texto: "Cancelar", clase: "btn--fantasma" },
        { texto: e ? "Guardar cambios" : "Registrar estudiante", clase: "btn--primario", accion: async (m) => {
          const form = U.$("#form-est", m.el);
          const d = Object.fromEntries(new FormData(form).entries());
          const errores = validar(d, e);
          U.$$(".campo", form).forEach((c) => { c.classList.remove("invalido"); const s = c.querySelector(".error"); if (s) s.textContent = ""; });
          Object.entries(errores).forEach(([k, msg]) => { const inp = form.querySelector(`[name=${k}]`); const c = inp.closest(".campo"); c.classList.add("invalido"); c.querySelector(".error").textContent = msg; });
          if (Object.keys(errores).length) { form.querySelector(".invalido input, .invalido select").focus(); return false; }
          await LT.estado.backend.guardarEstudiante({ ...(e || {}), ...d, id: e ? e.id : undefined });
          U.toast(e ? "Estudiante actualizado" : "Estudiante registrado");
          await recargar(el);
        } },
      ],
    });
  }

  function validar(d, e) {
    const err = {};
    const doc = U.limpiarDocumento(d.documento);
    if (!U.validarDocumento(doc)) err.documento = "Documento inválido (3 a 20 letras o números)";
    else if (lista.some((x) => x.documento === doc && (!e || x.id !== e.id))) err.documento = "Ya existe un estudiante con este documento";
    if (!d.apellidos.trim()) err.apellidos = "Obligatorio";
    if (!d.nombres.trim()) err.nombres = "Obligatorio";
    if (d.edad === "" || !(Number(d.edad) >= 3 && Number(d.edad) <= 30)) err.edad = "Edad entre 3 y 30";
    if (!d.grado_id) err.grado_id = "Seleccione el grado";
    if (!d.curso_id) err.curso_id = "Seleccione el curso";
    if (!err.nombres && d.curso_id && lista.some((x) => x.curso_id === d.curso_id && U.norm(x.nombres) === U.norm(d.nombres) && U.norm(x.apellidos) === U.norm(d.apellidos) && (!e || x.id !== e.id)))
      err.nombres = "Ya existe un estudiante con este nombre en el curso";
    if (!d.acudiente_nombre.trim()) err.acudiente_nombre = "Obligatorio";
    if (d.acudiente_correo && !U.validarCorreo(d.acudiente_correo)) err.acudiente_correo = "Correo inválido";
    if (!d.acudiente_telefono.trim()) err.acudiente_telefono = "Obligatorio";
    else if (!U.validarTelefono(d.acudiente_telefono)) err.acudiente_telefono = "Teléfono inválido";
    return err;
  }

  /* ---------------- Carga masiva (Excel / CSV) ---------------- */
  const ENCABEZADOS = {
    tipo_documento: ["tipo documento", "tipo de documento", "tipo doc", "tipo", "tipo_documento"],
    documento: ["documento", "numero de documento", "no documento", "nro documento", "n documento", "numero documento", "identificacion", "numero de identificacion", "doc", "id"],
    apellidos: ["apellidos", "apellido", "apellidos del estudiante"],
    nombres: ["nombres", "nombre", "nombres del estudiante", "nombre del estudiante", "estudiante", "nombre completo", "nombres y apellidos", "apellidos y nombres"],
    edad: ["edad"],
    grado: ["grado"],
    curso: ["curso", "grupo", "salon"],
    acudiente_nombre: ["acudiente", "nombre acudiente", "nombre del acudiente", "acudiente nombre", "acudiente_nombre"],
    acudiente_parentesco: ["parentesco", "acudiente parentesco", "acudiente_parentesco"],
    acudiente_correo: ["correo", "correo acudiente", "correo del acudiente", "correo electronico", "correo electronico del acudiente", "email", "e mail", "acudiente correo", "acudiente_correo"],
    acudiente_telefono: ["telefono", "celular", "telefono acudiente", "telefono del acudiente", "movil", "acudiente telefono", "acudiente_telefono"],
    direccion: ["direccion", "direccion residencia", "direccion de residencia"],
  };
  function mapearEncabezado(h) {
    const n = U.norm(h).replace(/[_\-.#:]/g, " ").replace(/\s+/g, " ").trim();
    for (const [k, lst] of Object.entries(ENCABEZADOS)) if (lst.map((x) => x.replace(/_/g, " ")).includes(n)) return k;
    if (/correo|email/.test(n)) return "acudiente_correo";
    if (/telefono|celular/.test(n)) return "acudiente_telefono";
    if (/parentesco/.test(n)) return "acudiente_parentesco";
    if (/acudiente/.test(n)) return "acudiente_nombre";
    if (/tipo/.test(n)) return "tipo_documento";
    if (/documento|identificacion/.test(n)) return "documento";
    if (/apellido/.test(n)) return "apellidos";
    if (/nombre/.test(n)) return "nombres";
    if (/direccion/.test(n)) return "direccion";
    return null;
  }

  async function leerArchivo(archivo) {
    const datos = await archivo.arrayBuffer();
    const esCsv = /\.(csv|txt)$/i.test(archivo.name);
    let libro;
    if (esCsv) {
      let texto = new TextDecoder("utf-8").decode(datos);
      if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(datos);
      libro = XLSX.read(texto, { type: "string", raw: true });
    } else libro = XLSX.read(datos, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: "", blankrows: false });
    // Buscar la fila de encabezados (la primera con al menos 3 columnas reconocidas)
    let fe = matriz.findIndex((fila) => fila.filter((c) => mapearEncabezado(c)).length >= 3);
    if (fe < 0) throw new Error("No se reconocieron los encabezados. Use la plantilla (documento, apellidos, nombres, grado, curso…).");
    const mapa = matriz[fe].map(mapearEncabezado);
    if (!mapa.includes("documento") || !mapa.includes("nombres") || !mapa.includes("curso")) throw new Error("El archivo debe tener al menos las columnas documento, nombres y curso.");
    const filas = [];
    matriz.slice(fe + 1).forEach((fila, i) => {
      const o = { _fila: fe + i + 2 };
      mapa.forEach((k, j) => {
        if (!k) return;
        let v = fila[j];
        if (typeof v === "number") v = Number.isInteger(v) ? String(v) : String(v);
        v = String(v ?? "").trim();
        if (o[k] === undefined || o[k] === "") o[k] = v;
      });
      if (Object.keys(o).filter((k) => k !== "_fila" && o[k]).length) filas.push(o);
    });
    return { filas, columnas: mapa.filter(Boolean) };
  }

  function analizar(filas, crear) {
    const cat = LT.estado.cat;
    const vistos = new Map(), nombres = new Map();
    const porDoc = new Map(lista.map((e) => [e.documento, e]));
    return filas.map((o) => {
      const r = { ...o, errores: [], avisos: [] };
      r.documento = U.limpiarDocumento(o.documento);
      if (!o.apellidos && o.nombres && /,/.test(o.nombres)) { const [a, n] = o.nombres.split(","); r.apellidos = a.trim(); r.nombres = n.trim(); }
      if (o.tipo_documento) r.tipo_documento = String(o.tipo_documento).toUpperCase().replace(/\./g, "");
      if (!r.documento) r.errores.push("Documento vacío");
      else if (!U.validarDocumento(r.documento)) r.errores.push("Documento inválido");
      if (r.tipo_documento && !U.TIPOS_DOC[r.tipo_documento]) r.errores.push("Tipo de documento inválido");
      if (!String(r.nombres || "").trim()) r.errores.push("Nombre vacío");
      if (r.edad !== undefined && r.edad !== "" && !(Number(r.edad) >= 3 && Number(r.edad) <= 30)) r.errores.push("Edad inválida");
      if (r.acudiente_correo && !U.validarCorreo(r.acudiente_correo)) r.errores.push("Correo inválido");
      if (!r.acudiente_correo) r.avisos.push("Sin correo del acudiente");
      const { grado, curso } = U.resolverCurso(cat, r.grado, r.curso);
      if (curso) { r.curso_id = curso.id; r.grado_txt = grado.nombre; r.curso_txt = curso.nombre; }
      else if (crear && String(r.grado || "").trim() && String(r.curso || "").trim()) r.avisos.push(`Se creará ${grado ? "el curso" : "el grado y el curso"}`);
      else r.errores.push(`Grado/curso no existe (${r.grado || "?"} / ${r.curso || "?"})`);
      if (r.documento) {
        if (vistos.has(r.documento)) r.errores.push(`Documento repetido en el archivo (fila ${vistos.get(r.documento)})`);
        else vistos.set(r.documento, o._fila);
      }
      const clave = `${U.norm(r.grado)}|${U.norm(r.curso)}|${U.norm(r.apellidos)}|${U.norm(r.nombres)}`;
      if (nombres.has(clave)) r.errores.push(`Nombre repetido en el mismo curso (fila ${nombres.get(clave)})`); else nombres.set(clave, o._fila);
      const previo = porDoc.get(r.documento);
      if (!r.errores.length && r.curso_id && lista.some((x) => x.curso_id === r.curso_id && U.norm(x.nombres) === U.norm(r.nombres) && U.norm(x.apellidos) === U.norm(r.apellidos) && x.documento !== r.documento))
        r.errores.push("Ya existe otro estudiante con ese nombre en el curso");
      r.accion = r.errores.length ? "error" : previo ? "actualizar" : "nuevo";
      return r;
    });
  }

  async function cargaMasiva(el) {
    let analisis = null, datos = null;
    await U.modal({
      titulo: "Carga masiva de estudiantes", tam: "xl",
      html: `<div id="cm-paso1">
          <div class="aviso aviso--info">${U.ico("info")}<div>Formatos aceptados: <strong>Excel (.xlsx, .xls)</strong> y <strong>CSV</strong>. Columnas: documento, apellidos, nombres, edad, grado, curso, acudiente, parentesco, correo, teléfono y dirección.
            Si el documento ya existe, el registro <strong>se actualiza</strong> en lugar de duplicarse. <button class="btn-enlace" id="cm-plantilla" type="button">Descargar plantilla</button></div></div>
          <label class="zona-archivo" id="cm-zona">${U.ico("subir")}<div><strong>Seleccione o arrastre el archivo aquí</strong></div><div class="muted peq">Máximo 5.000 filas</div>
            <input type="file" id="cm-archivo" accept=".xlsx,.xls,.csv,.txt" hidden></label>
        </div>
        <div id="cm-paso2" hidden></div>`,
      alAbrir: (m) => {
        const zona = U.$("#cm-zona", m), inp = U.$("#cm-archivo", m);
        U.$("#cm-plantilla", m).addEventListener("click", (e) => { e.preventDefault(); LT.exportar.plantillaEstudiantes(); });
        const procesar = async (archivo) => {
          if (!archivo) return;
          try {
            datos = await leerArchivo(archivo);
            if (!datos.filas.length) throw new Error("El archivo no tiene filas con datos");
            if (datos.filas.length > 5000) throw new Error("El archivo supera las 5.000 filas. Divídalo en varios archivos.");
            mostrarAnalisis(m, archivo.name);
          } catch (e) { U.toast(LT.error(e), "error", 7000); }
        };
        inp.addEventListener("change", () => procesar(inp.files[0]));
        zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
        zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
        zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("sobre"); procesar(e.dataTransfer.files[0]); });
      },
      botones: [
        { texto: "Cerrar", clase: "btn--fantasma" },
        { texto: "Importar registros válidos", clase: "btn--primario", id: "cm-importar", accion: async (m) => {
          if (!analisis) { U.toast("Seleccione primero un archivo", "aviso"); return false; }
          const crear = U.$("#cm-crear", m.el).checked;
          const validas = analisis.filter((r) => r.accion !== "error").map((r) => ({
            _fila: r._fila, tipo_documento: r.tipo_documento || "", documento: r.documento, apellidos: r.apellidos || "", nombres: r.nombres,
            edad: r.edad || "", grado: r.grado_txt || r.grado || "", curso: r.curso_txt || r.curso || "", acudiente_nombre: r.acudiente_nombre || "",
            acudiente_parentesco: r.acudiente_parentesco || "", acudiente_correo: (r.acudiente_correo || "").toLowerCase(), acudiente_telefono: r.acudiente_telefono || "", direccion: r.direccion || "",
          }));
          if (!validas.length) { U.toast("No hay filas válidas para importar", "error"); return false; }
          const res = await LT.estado.backend.importarEstudiantes(validas, crear);
          if (crear) await A.recargarCatalogos();
          await recargar(el);
          const errores = [...analisis.filter((r) => r.accion === "error").map((r) => ({ fila: r._fila, documento: r.documento, mensaje: r.errores.join("; ") })), ...res.errores];
          U.$("#cm-paso2", m.el).innerHTML = `
            <div class="aviso aviso--exito">${U.ico("ok")}<div><strong>Importación finalizada.</strong> ${U.plural(res.insertados, "estudiante nuevo", "estudiantes nuevos")} · ${U.plural(res.actualizados, "registro actualizado", "registros actualizados")} · ${U.plural(errores.length, "fila rechazada", "filas rechazadas")}.</div></div>
            ${errores.length ? `<div class="tabla-import"><table class="tabla"><thead><tr><th>Fila</th><th>Documento</th><th>Motivo</th></tr></thead><tbody>${errores.sort((a, b) => a.fila - b.fila).map((x) => `<tr><td>${x.fila}</td><td>${U.esc(x.documento || "")}</td><td>${U.esc(x.mensaje)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
          U.$("#cm-importar", m.el).hidden = true;
          analisis = null;
          U.toast("Importación completada");
          return false;
        } },
      ],
    });

    function mostrarAnalisis(m, nombreArchivo) {
      const crearPrev = U.$("#cm-crear", m) ? U.$("#cm-crear", m).checked : false;
      analisis = analizar(datos.filas, crearPrev);
      const n = { nuevo: 0, actualizar: 0, error: 0 };
      analisis.forEach((r) => n[r.accion]++);
      const avisos = analisis.filter((r) => r.avisos.length && r.accion !== "error").length;
      U.$("#cm-paso1", m).hidden = true;
      const p2 = U.$("#cm-paso2", m); p2.hidden = false;
      p2.innerHTML = `
        <p style="margin-top:0"><strong>${U.esc(nombreArchivo)}</strong> · ${U.plural(analisis.length, "fila")} · columnas reconocidas: ${datos.columnas.map((c) => `<span class="chip">${c}</span>`).join(" ")}</p>
        <div class="resumen-import">
          <span class="chip chip--exito">${n.nuevo} nuevos</span><span class="chip chip--info">${n.actualizar} se actualizarán</span>
          <span class="chip chip--peligro">${n.error} con errores</span>${avisos ? `<span class="chip chip--alerta">${avisos} con advertencias</span>` : ""}
          <label class="check" style="margin-left:auto"><input type="checkbox" id="cm-crear" ${crearPrev ? "checked" : ""}> Crear grados y cursos que no existan</label>
          <button class="btn btn--sm" id="cm-otro" type="button">Elegir otro archivo</button>
        </div>
        <div class="tabla-import"><table class="tabla"><thead><tr><th>Fila</th><th>Estado</th><th>Documento</th><th>Estudiante</th><th>Grado / curso</th><th>Acudiente</th><th>Correo</th><th>Observaciones</th></tr></thead><tbody>
          ${analisis.slice(0, 400).map((r) => `<tr>
            <td>${r._fila}</td>
            <td>${r.accion === "error" ? '<span class="chip chip--peligro">Error</span>' : r.accion === "actualizar" ? '<span class="chip chip--info">Actualizar</span>' : '<span class="chip chip--exito">Nuevo</span>'}</td>
            <td class="num">${U.esc(r.documento)}</td><td>${U.esc(`${r.apellidos || ""} ${r.nombres || ""}`)}</td>
            <td>${U.esc(r.grado_txt || r.grado || "")} / ${U.esc(r.curso_txt || r.curso || "")}</td><td>${U.esc(r.acudiente_nombre || "")}</td><td>${U.esc(r.acudiente_correo || "")}</td>
            <td class="peq">${[...r.errores.map((x) => `<span style="color:var(--peligro)">${U.esc(x)}</span>`), ...r.avisos.map((x) => `<span style="color:var(--alerta)">${U.esc(x)}</span>`)].join("<br>")}</td></tr>`).join("")}
        </tbody></table></div>
        ${analisis.length > 400 ? `<p class="muted peq">Se muestran las primeras 400 filas.</p>` : ""}`;
      U.$("#cm-crear", p2).addEventListener("change", () => mostrarAnalisis(m, nombreArchivo));
      U.$("#cm-otro", p2).addEventListener("click", () => { analisis = null; p2.hidden = true; U.$("#cm-paso1", m).hidden = false; U.$("#cm-archivo", m).value = ""; });
    }
  }

  /* ---------------- Exportar listado ---------------- */
  async function exportar() {
    const filas = filtrar();
    await LT.exportar.excel({
      nombre: "estudiantes",
      hojas: [{
        nombre: "Estudiantes", titulo: "Listado de estudiantes",
        filtros: [["Grado", f.grado ? A.grado(f.grado) : "Todos"], ["Curso", f.curso ? A.curso(f.curso) : "Todos"], ["Estado", f.estado || "Todos"], ["Registros", filas.length]],
        columnas: [{ t: "Tipo", ancho: 7 }, { t: "Documento", ancho: 15 }, { t: "Apellidos", ancho: 22 }, { t: "Nombres", ancho: 20 }, { t: "Edad", ancho: 7 }, { t: "Grado", ancho: 11 }, { t: "Curso", ancho: 9 },
          { t: "Acudiente", ancho: 24 }, { t: "Parentesco", ancho: 12 }, { t: "Correo acudiente", ancho: 30 }, { t: "Teléfono", ancho: 14 }, { t: "Dirección", ancho: 32 }, { t: "Estado", ancho: 10 }, { t: "Llegadas tarde", ancho: 12 }],
        filas: filas.map((e) => [e.tipo_documento, e.documento, e.apellidos, e.nombres, e.edad, A.grado(e.grado_id), A.curso(e.curso_id), e.acudiente_nombre, e.acudiente_parentesco, e.acudiente_correo, e.acudiente_telefono, e.direccion, e.estado, e.total_llegadas]),
      }],
    });
  }
})();
