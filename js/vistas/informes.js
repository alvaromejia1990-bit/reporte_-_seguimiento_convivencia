/* Sección 4 · Informes y estadísticas (dashboard interactivo) */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;
  const A = new Proxy({}, { get: (_, k) => LT.app[k] }); // LT.app se define en app.js (se carga después)

  if (window.Chart) Chart.defaults.font.family = '"Public Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const PALETA = ["#123a6b", "#c8a24a", "#1f7a8c", "#7a5195", "#d1495b", "#4f8a3c", "#e07a1f", "#5b6475", "#2f9e9e", "#a05195"];
  const f = { periodo: "", grado: "", curso: "", estudiante: "", desde: "", hasta: "", gran: "semanal" };
  let raiz = null, graficos = {}, datos = null, est = null;

  LT.vistas.informes = {
    async render(el) {
      raiz = el;
      const cat = LT.estado.cat;
      el.innerHTML = `
        <div class="titular"><div><h1>Informes y estadísticas</h1><p>Análisis de llegadas tarde por período, grado, curso y estudiante, con consolidado institucional.</p></div>
          <div class="titular__acciones"><button class="btn" id="i-excel">${U.ico("excel")}Exportar Excel</button><button class="btn btn--primario" id="i-pdf">${U.ico("pdf")}Exportar PDF</button></div></div>
        <div class="filtros">
          <label class="campo"><span>Período</span><select class="control" id="i-periodo">${U.opciones(cat.periodos, f.periodo, { vacio: "Todos los períodos", texto: U.nombrePeriodo })}</select></label>
          <label class="campo"><span>Grado</span><select class="control" id="i-grado">${U.opciones(cat.grados, f.grado, { vacio: "Todos los grados" })}</select></label>
          <label class="campo"><span>Curso</span><select class="control" id="i-curso"><option value="${U.esc(f.curso)}"></option></select></label>
          <label class="campo"><span>Estudiante</span><input class="control" id="i-est" list="i-est-lista" placeholder="Todos (escriba para buscar)"><datalist id="i-est-lista"></datalist></label>
          <label class="campo"><span>Desde</span><input class="control" type="date" id="i-desde" value="${f.desde}"></label>
          <label class="campo"><span>Hasta</span><input class="control" type="date" id="i-hasta" value="${f.hasta}"></label>
          <div class="filtros__acciones"><button class="btn btn--fantasma" id="i-limpiar">Limpiar filtros</button></div>
        </div>
        <div id="i-contenido"></div>`;
      A.enlazarGradoCurso(U.$("#i-grado", el), U.$("#i-curso", el), { alCambiar: () => { f.grado = U.$("#i-grado", el).value; f.curso = U.$("#i-curso", el).value; pintar(); } });
      U.$("#i-periodo", el).addEventListener("change", (e) => { f.periodo = e.target.value; pintar(); });
      U.$("#i-desde", el).addEventListener("change", (e) => { f.desde = e.target.value; pintar(); });
      U.$("#i-hasta", el).addEventListener("change", (e) => { f.hasta = e.target.value; pintar(); });
      U.$("#i-est", el).addEventListener("change", (e) => {
        const v = e.target.value.trim();
        const m = datos.estudiantes.find((x) => etiquetaEst(x) === v);
        f.estudiante = m ? m.id : "";
        if (v && !m) U.toast("Seleccione un estudiante de la lista", "aviso");
        pintar();
      });
      U.$("#i-limpiar", el).addEventListener("click", () => {
        Object.assign(f, { periodo: "", grado: "", curso: "", estudiante: "", desde: "", hasta: "" });
        ["#i-periodo", "#i-grado", "#i-desde", "#i-hasta", "#i-est"].forEach((s) => (U.$(s, el).value = ""));
        U.$("#i-grado", el).dispatchEvent(new Event("change"));
      });
      U.$("#i-pdf", el).addEventListener("click", (e) => exportarPdf(e.currentTarget));
      U.$("#i-excel", el).addEventListener("click", (e) => exportarExcel(e.currentTarget));
      await cargar();
    },
    destruir() { Object.values(graficos).forEach((g) => g.destroy()); graficos = {}; raiz = null; },
    alCambio: U.debounce(() => { if (raiz) cargar(); }, 1500),
  };

  const etiquetaEst = (e) => `${U.nombre(e)} · ${A.curso(e.curso_id)} · ${e.documento}`;

  async function cargar() {
    const b = LT.estado.backend;
    const [estudiantes, llegadas, notificaciones] = await Promise.all([A.estudiantes(), b.llegadas({}), b.notificaciones({})]);
    datos = { estudiantes, llegadas, notificaciones };
    if (!raiz) return;
    U.$("#i-est-lista", raiz).innerHTML = estudiantes.filter((e) => e.total_llegadas > 0 || e.estado === "activo")
      .sort((a, c) => U.nombre(a).localeCompare(U.nombre(c))).map((e) => `<option value="${U.esc(etiquetaEst(e))}"></option>`).join("");
    if (f.estudiante) { const e = estudiantes.find((x) => x.id === f.estudiante); U.$("#i-est", raiz).value = e ? etiquetaEst(e) : ""; }
    pintar();
  }

  function filtrar() {
    return datos.llegadas.filter((l) =>
      (!f.periodo || l.periodo_id === f.periodo) && (!f.grado || l.grado_id === f.grado) && (!f.curso || l.curso_id === f.curso) &&
      (!f.estudiante || l.estudiante_id === f.estudiante) && (!f.desde || l.fecha >= f.desde) && (!f.hasta || l.fecha <= f.hasta));
  }

  function descripcionFiltros() {
    const e = f.estudiante && datos.estudiantes.find((x) => x.id === f.estudiante);
    return [
      ["Período", f.periodo ? U.nombrePeriodo(A.periodo(f.periodo)) : "Todos"], ["Grado", f.grado ? A.grado(f.grado) : "Todos"], ["Curso", f.curso ? A.curso(f.curso) : "Todos"],
      ["Estudiante", e ? U.nombre(e) : "Todos"], ["Rango de fechas", f.desde || f.hasta ? `${f.desde ? U.fmtFecha(f.desde) : "inicio"} a ${f.hasta ? U.fmtFecha(f.hasta) : "hoy"}` : "Sin restricción"],
    ];
  }

  function pintar() {
    if (!raiz || !datos) return;
    const llegadas = filtrar();
    est = LT.estadisticas.calcular({ llegadas, estudiantes: datos.estudiantes, cat: LT.estado.cat, umbral: A.umbral(), notificaciones: datos.notificaciones,
      filtros: { periodoId: f.periodo, gradoId: f.grado, cursoId: f.curso, estudianteId: f.estudiante } });
    const cont = U.$("#i-contenido", raiz);
    Object.values(graficos).forEach((g) => g.destroy()); graficos = {};
    const umbral = A.umbral();
    cont.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="kpi__etq">Total de reportes</div><div class="kpi__val">${U.fmtNum(est.total)}</div><div class="kpi__det">${U.fmtNum(est.promedioDiario, 1)} por día con reportes</div></div>
        <div class="kpi kpi--oro"><div class="kpi__etq">Estudiantes con reportes</div><div class="kpi__val">${U.fmtNum(est.estudiantesConReporte)}</div><div class="kpi__det">${U.pct(est.estudiantesConReporte, est.matricula)} de ${U.fmtNum(est.matricula)} matriculados</div></div>
        <div class="kpi kpi--peligro"><div class="kpi__etq">Estudiantes reincidentes</div><div class="kpi__val">${U.fmtNum(est.reincidentes)}</div><div class="kpi__det">Más de ${umbral} en un mismo período</div></div>
        <div class="kpi"><div class="kpi__etq">Promedio por estudiante</div><div class="kpi__val">${U.fmtNum(est.promedio, 1)}</div><div class="kpi__det">Entre quienes tienen reportes</div></div>
        <div class="kpi kpi--oro"><div class="kpi__etq">Día con más reportes</div><div class="kpi__val" style="font-size:24px">${est.diaPico.etiqueta}</div><div class="kpi__det">${U.pct(est.diaPico.n, est.total)} del total</div></div>
        <div class="kpi kpi--exito"><div class="kpi__etq">Notificaciones enviadas</div><div class="kpi__val">${U.fmtNum(est.notificaciones)}</div><div class="kpi__det">${est.cursoCritico ? `Curso con más reportes: ${U.esc(est.cursoCritico.nombre)}` : "&nbsp;"}</div></div>
      </div>
      ${est.total ? `
      <div class="graficos">
        <div class="tarjeta ancho-total"><div class="tarjeta__cab"><h3>Tendencia temporal</h3>
          <div class="segmentado" id="i-gran">${["diaria", "semanal", "mensual"].map((g) => `<button data-gran="${g}" class="${f.gran === g ? "activo" : ""}">${g[0].toUpperCase() + g.slice(1)}</button>`).join("")}</div></div>
          <div class="tarjeta__cuerpo"><div class="grafico"><canvas id="g-tendencia" aria-label="Tendencia de llegadas tarde"></canvas></div></div></div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Llegadas tarde por grado</h3></div><div class="tarjeta__cuerpo"><div class="grafico"><canvas id="g-grado"></canvas></div></div></div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Llegadas tarde por curso</h3></div><div class="tarjeta__cuerpo"><div class="grafico"><canvas id="g-curso"></canvas></div></div></div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Comparativo por período</h3><span class="muted peq">por grado</span></div><div class="tarjeta__cuerpo"><div class="grafico"><canvas id="g-periodo"></canvas></div></div></div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Día de la semana</h3></div><div class="tarjeta__cuerpo"><div class="grafico"><canvas id="g-dia"></canvas></div></div></div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Hora de llegada</h3><span class="muted peq">franjas de 15 minutos</span></div><div class="tarjeta__cuerpo"><div class="grafico"><canvas id="g-hora"></canvas></div></div></div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Estudiantes con más llegadas tarde</h3></div><div class="tarjeta__cuerpo"><div class="grafico"><canvas id="g-top"></canvas></div></div></div>
      </div>
      <div class="graficos">
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Consolidado por grado</h3></div><div class="tabla-cont">${tablaHtml(["Grado", "Matrícula", "Con reportes", "Reportes", "Reincidentes", "% estudiantes"], filasGrado(), [1, 2, 3, 4, 5], totalesGrado())}</div></div>
        <div class="tarjeta"><div class="tarjeta__cab"><h3>Comparativo por período</h3></div><div class="tabla-cont">${tablaHtml(["Período", "Reportes", "Estudiantes", "Reincidentes", "Variación"], filasPeriodo(), [1, 2, 3, 4])}</div></div>
        <div class="tarjeta ancho-total"><div class="tarjeta__cab"><h3>Consolidado por curso</h3></div><div class="tabla-cont">${tablaHtml(["Curso", "Grado", "Matrícula", "Con reportes", "Reportes", "Reincidentes", "% estudiantes", "Reportes por estudiante"], filasCurso(), [2, 3, 4, 5, 6, 7])}</div></div>
        <div class="tarjeta ancho-total"><div class="tarjeta__cab"><h3>Ranking de estudiantes</h3><span class="muted peq">${U.plural(est.ranking.length, "estudiante")} con reportes · primeros 25</span></div>
          <div class="tabla-cont">${tablaHtml(["#", "Estudiante", "Grado", "Curso", "Llegadas tarde", "Última", "Situación"], est.ranking.slice(0, 25).map((r, i) => [i + 1, r.nombre, r.grado, r.curso, r.n, U.fmtFecha(r.ultima), r.reincidente ? '<span class="chip chip--peligro">Reincidente</span>' : '<span class="chip">—</span>']), [0, 4], null, true)}</div></div>
      </div>` : `<div class="tarjeta"><div class="vacio">${U.ico("grafico")}<h3>Sin datos</h3><p>No hay llegadas tarde para los filtros seleccionados.</p></div></div>`}`;
    if (!est.total) return;
    U.$("#i-gran", cont).addEventListener("click", (e) => { const b = e.target.closest("[data-gran]"); if (b) { f.gran = b.dataset.gran; U.$$("#i-gran button", cont).forEach((x) => x.classList.toggle("activo", x === b)); graficoTendencia(); } });
    dibujar();
  }

  function tablaHtml(cab, filas, numericas = [], totales = null, html = false) {
    const celda = (v, i) => `<td class="${numericas.includes(i) ? "derecha num" : ""}">${html ? v : U.esc(v)}</td>`;
    return `<table class="tabla"><thead><tr>${cab.map((c, i) => `<th class="${numericas.includes(i) ? "derecha" : ""}">${c}</th>`).join("")}</tr></thead>
      <tbody>${filas.map((r) => `<tr>${r.map(celda).join("")}</tr>`).join("") || `<tr><td colspan="${cab.length}" class="muted">Sin datos</td></tr>`}</tbody>
      ${totales ? `<tfoot><tr>${totales.map((v, i) => `<td class="${numericas.includes(i) ? "derecha num" : ""}" style="font-weight:800;border-top:2px solid var(--borde)">${U.esc(v)}</td>`).join("")}</tr></tfoot>` : ""}</table>`;
  }
  const filasGrado = () => est.porGrado.map((g) => [g.nombre, g.matricula, g.estudiantes, g.n, g.reincidentes, U.pct(g.estudiantes, g.matricula)]);
  const totalesGrado = () => ["Total institucional", est.matricula, est.estudiantesConReporte, est.total, est.reincidentes, U.pct(est.estudiantesConReporte, est.matricula)];
  const filasCurso = () => est.porCurso.map((c) => [c.nombre, c.grado, c.matricula, c.estudiantes, c.n, c.reincidentes, U.pct(c.estudiantes, c.matricula), c.matricula ? U.fmtNum(c.n / c.matricula, 2) : "—"]);
  const filasPeriodo = () => est.porPeriodo.map((p, i, a) => [p.nombre, p.n, p.estudiantes, p.reincidentes,
    i ? `${p.n >= a[i - 1].n ? "+" : ""}${U.fmtNum(((p.n - a[i - 1].n) / Math.max(1, a[i - 1].n)) * 100, 1)} %` : "—"]);

  /* ---------------- Gráficos ---------------- */
  const base = (extra = {}) => ({
    responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
    plugins: { legend: { display: false, labels: { font: {}, boxWidth: 12 } }, tooltip: { backgroundColor: "#0a1f3d", padding: 10,  } },
    scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#5b6475" } },
      y: { beginAtZero: true, grid: { color: "#eceff5" }, ticks: { precision: 0, font: { size: 11 }, color: "#5b6475" } } },
    ...extra,
  });
  const crear = (id, config) => { const c = U.$("#" + id, raiz); if (c) graficos[id] = new Chart(c, config); };

  function graficoTendencia() {
    if (graficos["g-tendencia"]) graficos["g-tendencia"].destroy();
    const serie = f.gran === "diaria" ? est.serieDiaria : f.gran === "mensual" ? est.serieMensual : est.serieSemanal;
    const etq = serie.map((s) => f.gran === "mensual" ? `${U.MESES[Number(s.etiqueta.slice(5, 7)) - 1]} ${s.etiqueta.slice(0, 4)}` : U.fmtFecha(s.etiqueta, "dm"));
    crear("g-tendencia", { type: "line", data: { labels: etq, datasets: [{ label: "Llegadas tarde", data: serie.map((s) => s.n), borderColor: "#123a6b", backgroundColor: "rgba(31,95,168,.12)", fill: true, tension: 0.3, pointRadius: serie.length > 60 ? 0 : 3, pointBackgroundColor: "#c8a24a", borderWidth: 2 }] },
      options: base({ plugins: { ...base().plugins, tooltip: { ...base().plugins.tooltip, callbacks: { title: (i) => f.gran === "semanal" ? `Semana del ${U.fmtFecha(serie[i[0].dataIndex].etiqueta, "media")}` : f.gran === "diaria" ? U.fmtFecha(serie[i[0].dataIndex].etiqueta, "larga") : etq[i[0].dataIndex] } } } }) });
  }

  function dibujar() {
    graficoTendencia();
    crear("g-grado", { type: "bar", data: { labels: est.porGrado.map((g) => g.nombre), datasets: [
      { label: "Reportes", data: est.porGrado.map((g) => g.n), backgroundColor: "#123a6b", borderRadius: 6 },
      { label: "Estudiantes con reportes", data: est.porGrado.map((g) => g.estudiantes), backgroundColor: "#c8a24a", borderRadius: 6 }] },
      options: base({ plugins: { ...base().plugins, legend: { display: true, position: "bottom", labels: { font: {}, boxWidth: 12 } } } }) });
    crear("g-curso", { type: "bar", data: { labels: est.porCurso.map((c) => c.nombre), datasets: [{ label: "Reportes", data: est.porCurso.map((c) => c.n),
      backgroundColor: est.porCurso.map((c) => (est.cursoCritico && c.id === est.cursoCritico.id ? "#d1495b" : "#1f5fa8")), borderRadius: 5 }] }, options: base() });
    const grados = LT.estado.cat.grados.filter((g) => est.porPeriodo.some((p) => p.porGrado[g.id]));
    crear("g-periodo", { type: "bar", data: { labels: est.porPeriodo.map((p) => p.nombre), datasets: grados.map((g, i) => ({ label: g.nombre, data: est.porPeriodo.map((p) => p.porGrado[g.id] || 0), backgroundColor: PALETA[i % PALETA.length], borderRadius: 3 })) },
      options: base({ plugins: { ...base().plugins, legend: { display: true, position: "bottom", labels: { font: {}, boxWidth: 12 } } }, scales: { x: { ...base().scales.x, stacked: true }, y: { ...base().scales.y, stacked: true } } }) });
    crear("g-dia", { type: "bar", data: { labels: est.dias.map((d) => d.etiqueta), datasets: [{ label: "Reportes", data: est.dias.map((d) => d.n), backgroundColor: est.dias.map((d) => (d === est.diaPico ? "#c8a24a" : "#123a6b")), borderRadius: 6 }] }, options: base() });
    crear("g-hora", { type: "bar", data: { labels: est.franjas.map((x) => x.etiqueta), datasets: [{ label: "Reportes", data: est.franjas.map((x) => x.n), backgroundColor: "#1f7a8c", borderRadius: 6 }] }, options: base() });
    const top = est.ranking.slice(0, 10);
    crear("g-top", { type: "bar", data: { labels: top.map((r) => `${r.nombre} (${r.curso})`), datasets: [{ label: "Llegadas tarde", data: top.map((r) => r.n), backgroundColor: top.map((r) => (r.reincidente ? "#d1495b" : "#1f5fa8")), borderRadius: 4 }] },
      options: base({ indexAxis: "y", scales: { x: { beginAtZero: true, grid: { color: "#eceff5" }, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { font: { size: 10.5 }, autoSkip: false } } } }) });
  }

  /* ---------------- Exportación ---------------- */
  const lienzo = (id) => (graficos[id] ? graficos[id].canvas : null);
  async function exportarPdf(btn) {
    if (!est) return;
    U.ocupado(btn, true);
    try {
      const kpis = [["Total de reportes", U.fmtNum(est.total), `${U.fmtNum(est.promedioDiario, 1)} por día con reportes`], ["Estudiantes con reportes", U.fmtNum(est.estudiantesConReporte), `${U.pct(est.estudiantesConReporte, est.matricula)} de ${est.matricula}`],
        ["Reincidentes", U.fmtNum(est.reincidentes), `Más de ${A.umbral()} en un período`], ["Promedio por estudiante", U.fmtNum(est.promedio, 1), ""], ["Día con más reportes", est.diaPico.etiqueta, U.pct(est.diaPico.n, est.total)], ["Notificaciones", U.fmtNum(est.notificaciones), ""]];
      const g = (id, titulo) => ({ tipo: "grafico", titulo, canvas: lienzo(id) });
      await LT.exportar.pdf({
        titulo: "Informe de llegadas tarde", nombre: "informe_llegadas_tarde", filtros: descripcionFiltros(),
        bloques: [
          { tipo: "titulo", texto: "Indicadores" }, { tipo: "kpis", items: kpis },
          { tipo: "texto", texto: resumenNarrativo() },
          g("g-tendencia", `Tendencia ${f.gran}`), g("g-grado", "Llegadas tarde por grado"), g("g-curso", "Llegadas tarde por curso"), g("g-periodo", "Comparativo por período y grado"),
          g("g-dia", "Distribución por día de la semana"), g("g-hora", "Distribución por hora de llegada"), g("g-top", "Estudiantes con más llegadas tarde"),
          { tipo: "tabla", titulo: "Consolidado por grado", columnas: ["Grado", "Matrícula", "Con reportes", "Reportes", "Reincidentes", "% estudiantes"], filas: [...filasGrado(), totalesGrado()] },
          { tipo: "tabla", titulo: "Comparativo por período", columnas: ["Período", "Reportes", "Estudiantes", "Reincidentes", "Variación"], filas: filasPeriodo() },
          { tipo: "tabla", titulo: "Consolidado por curso", columnas: ["Curso", "Grado", "Matrícula", "Con reportes", "Reportes", "Reincidentes", "% estudiantes", "Rep./estudiante"], filas: filasCurso() },
          { tipo: "tabla", titulo: "Ranking de estudiantes (primeros 40)", columnas: ["#", "Estudiante", "Grado", "Curso", "Llegadas", "Última", "Reincidente"],
            filas: est.ranking.slice(0, 40).map((r, i) => [i + 1, r.nombre, r.grado, r.curso, r.n, U.fmtFecha(r.ultima), r.reincidente ? "Sí" : "No"]) },
        ],
      });
      U.toast("Informe PDF generado");
    } catch (e) { U.toast(LT.error(e), "error"); } finally { U.ocupado(btn, false); }
  }

  function resumenNarrativo() {
    const per = f.periodo ? U.nombrePeriodo(A.periodo(f.periodo)) : "el año lectivo";
    const g = est.porGrado.slice().sort((a, b) => b.n - a.n)[0];
    return `Durante ${per} se registraron ${U.fmtNum(est.total)} llegadas tarde correspondientes a ${U.fmtNum(est.estudiantesConReporte)} estudiantes ` +
      `(${U.pct(est.estudiantesConReporte, est.matricula)} de la matrícula en el alcance del informe). ${U.fmtNum(est.reincidentes)} estudiantes superaron el límite de ${A.umbral()} llegadas tarde en un mismo período. ` +
      (g ? `El grado con más reportes es ${g.nombre} (${U.fmtNum(g.n)})${est.cursoCritico ? ` y el curso con más reportes es ${est.cursoCritico.nombre} (${U.fmtNum(est.cursoCritico.n)})` : ""}. ` : "") +
      `El día de la semana con mayor incidencia es ${est.diaPico.etiqueta.toLowerCase()}.`;
  }

  async function exportarExcel(btn) {
    if (!est) return;
    U.ocupado(btn, true);
    try {
      const estMap = new Map(datos.estudiantes.map((e) => [e.id, e]));
      const det = filtrar().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
      await LT.exportar.excel({ nombre: "informe_llegadas_tarde", hojas: [
        { nombre: "Resumen", titulo: "Informe de llegadas tarde · Resumen", filtros: descripcionFiltros(),
          pares: [["Total de reportes", est.total], ["Estudiantes con reportes", est.estudiantesConReporte], ["Matrícula en el alcance", est.matricula], ["% de estudiantes con reportes", U.pct(est.estudiantesConReporte, est.matricula)],
            ["Estudiantes reincidentes", est.reincidentes], ["Promedio por estudiante", Number(est.promedio.toFixed(2))], ["Promedio por día con reportes", Number(est.promedioDiario.toFixed(2))],
            ["Día con más reportes", est.diaPico.etiqueta], ["Curso con más reportes", est.cursoCritico ? est.cursoCritico.nombre : "—"], ["Notificaciones enviadas", est.notificaciones], ["Análisis", resumenNarrativo()]] },
        { nombre: "Gráficos", titulo: "Gráficos", imagenes: [
          { titulo: `Tendencia ${f.gran}`, canvas: lienzo("g-tendencia") }, { titulo: "Por grado", canvas: lienzo("g-grado") }, { titulo: "Por curso", canvas: lienzo("g-curso") },
          { titulo: "Comparativo por período", canvas: lienzo("g-periodo") }, { titulo: "Día de la semana", canvas: lienzo("g-dia") }, { titulo: "Hora de llegada", canvas: lienzo("g-hora") }, { titulo: "Ranking", canvas: lienzo("g-top") }] },
        { nombre: "Por grado", titulo: "Consolidado por grado", columnas: [{ t: "Grado", ancho: 16 }, { t: "Matrícula", ancho: 11 }, { t: "Con reportes", ancho: 13 }, { t: "Reportes", ancho: 11 }, { t: "Reincidentes", ancho: 13 }, { t: "% estudiantes", ancho: 13 }],
          filas: filasGrado(), totales: totalesGrado() },
        { nombre: "Por curso", titulo: "Consolidado por curso", columnas: [{ t: "Curso", ancho: 10 }, { t: "Grado", ancho: 12 }, { t: "Matrícula", ancho: 11 }, { t: "Con reportes", ancho: 13 }, { t: "Reportes", ancho: 11 }, { t: "Reincidentes", ancho: 13 }, { t: "% estudiantes", ancho: 13 }, { t: "Rep./estudiante", ancho: 15 }], filas: filasCurso() },
        { nombre: "Por período", titulo: "Comparativo por período", columnas: [{ t: "Período", ancho: 18 }, { t: "Reportes", ancho: 11 }, { t: "Estudiantes", ancho: 12 }, { t: "Reincidentes", ancho: 13 }, { t: "Variación", ancho: 12 },
          ...LT.estado.cat.grados.map((g) => ({ t: g.nombre, ancho: 11 }))], filas: est.porPeriodo.map((p, i) => [...filasPeriodo()[i], ...LT.estado.cat.grados.map((g) => p.porGrado[g.id] || 0)]) },
        { nombre: "Por estudiante", titulo: "Llegadas tarde por estudiante", columnas: [{ t: "Estudiante", ancho: 32 }, { t: "Documento", ancho: 14 }, { t: "Grado", ancho: 11 }, { t: "Curso", ancho: 9 }, { t: "Llegadas", ancho: 10 }, { t: "Última", ancho: 12 }, { t: "Reincidente", ancho: 12 }],
          filas: est.ranking.map((r) => [r.nombre, r.documento, r.grado, r.curso, r.n, U.fmtFecha(r.ultima), r.reincidente ? "Sí" : "No"]) },
        { nombre: "Temporal", titulo: "Serie temporal diaria", columnas: [{ t: "Fecha", ancho: 13 }, { t: "Día", ancho: 12 }, { t: "Reportes", ancho: 10 }],
          filas: est.serieDiaria.map((s) => [U.fmtFecha(s.etiqueta), U.DIAS[U.diaSemana(s.etiqueta)], s.n]) },
        { nombre: "Detalle", titulo: "Detalle de llegadas tarde", columnas: [{ t: "Fecha", ancho: 12 }, { t: "Día", ancho: 11 }, { t: "Hora", ancho: 8 }, { t: "Estudiante", ancho: 32 }, { t: "Documento", ancho: 14 }, { t: "Grado", ancho: 11 }, { t: "Curso", ancho: 9 }, { t: "Período", ancho: 16 }, { t: "Registró", ancho: 24 }, { t: "Observación", ancho: 30 }],
          filas: det.map((l) => { const e = estMap.get(l.estudiante_id) || {}; return [U.fmtFecha(l.fecha), U.DIAS[U.diaSemana(l.fecha)], U.fmtHora(l.hora), U.nombre(e), e.documento || "", l.grado_nombre, l.curso_nombre, U.nombrePeriodo(A.periodo(l.periodo_id)), l.registrado_por_nombre || "", l.observacion || ""]; }) },
      ] });
      U.toast("Informe Excel generado");
    } catch (e) { U.toast(LT.error(e), "error"); } finally { U.ocupado(btn, false); }
  }
})();
