/* Cálculos estadísticos compartidos (seguimiento, informes y exportaciones) */
(function () {
  "use strict";
  const LT = window.LT;
  const U = LT.util;

  const contarPor = (lista, clave) => {
    const m = new Map();
    lista.forEach((x) => { const k = typeof clave === "function" ? clave(x) : x[clave]; m.set(k, (m.get(k) || 0) + 1); });
    return m;
  };

  /** Estudiantes con más de `umbral` llegadas tarde en las llegadas dadas (normalmente de un período). */
  function seguimiento(llegadas, estMap, umbral) {
    const grupos = new Map();
    llegadas.forEach((l) => { if (!grupos.has(l.estudiante_id)) grupos.set(l.estudiante_id, []); grupos.get(l.estudiante_id).push(l); });
    return [...grupos.entries()]
      .filter(([, ls]) => ls.length > umbral)
      .map(([id, ls]) => ({ estudiante: estMap.get(id) || { id, nombres: "(estudiante eliminado)", apellidos: "" }, cantidad: ls.length,
        llegadas: ls.sort((a, b) => a.fecha.localeCompare(b.fecha)) }))
      .sort((a, b) => b.cantidad - a.cantidad || U.nombre(a.estudiante).localeCompare(U.nombre(b.estudiante)));
  }

  /** Indicadores completos para el dashboard. */
  function calcular({ llegadas, estudiantes, cat, umbral, notificaciones = [], filtros = {} }) {
    const estMap = new Map(estudiantes.map((e) => [e.id, e]));
    const gradoNombre = new Map(cat.grados.map((g) => [g.id, g.nombre]));
    const cursoNombre = new Map(cat.cursos.map((c) => [c.id, c.nombre]));
    const periodoMap = new Map(cat.periodos.map((p) => [p.id, p]));

    // Matrícula en el alcance de los filtros (estudiantes activos)
    const matriculaLista = estudiantes.filter((e) => e.estado === "activo" &&
      (!filtros.gradoId || e.grado_id === filtros.gradoId) && (!filtros.cursoId || e.curso_id === filtros.cursoId) &&
      (!filtros.estudianteId || e.id === filtros.estudianteId));
    const total = llegadas.length;
    const porEst = contarPor(llegadas, "estudiante_id");
    const estudiantesConReporte = porEst.size;

    // Reincidentes: más de `umbral` llegadas en un mismo período
    const porEstPeriodo = contarPor(llegadas, (l) => l.estudiante_id + "|" + l.periodo_id);
    const reincidentesSet = new Set([...porEstPeriodo.entries()].filter(([, n]) => n > umbral).map(([k]) => k.split("|")[0]));

    // Series temporales
    const porDia = contarPor(llegadas, "fecha");
    const fechas = [...porDia.keys()].sort();
    const serieDiaria = [];
    if (fechas.length) {
      for (let f = fechas[0]; f <= fechas[fechas.length - 1]; f = U.sumarDias(f, 1)) {
        if (U.diaSemana(f) <= 4 || porDia.has(f)) serieDiaria.push({ etiqueta: f, n: porDia.get(f) || 0 });
      }
    }
    const porSemana = contarPor(llegadas, (l) => U.lunesDe(l.fecha));
    const serieSemanal = [];
    if (fechas.length) for (let f = U.lunesDe(fechas[0]); f <= fechas[fechas.length - 1]; f = U.sumarDias(f, 7)) serieSemanal.push({ etiqueta: f, n: porSemana.get(f) || 0 });
    const porMes = contarPor(llegadas, (l) => l.fecha.slice(0, 7));
    const serieMensual = [...porMes.keys()].sort().map((k) => ({ etiqueta: k, n: porMes.get(k) }));

    // Por grado
    const porGrado = cat.grados.map((g) => {
      const ls = llegadas.filter((l) => l.grado_id === g.id);
      const ests = new Set(ls.map((l) => l.estudiante_id));
      const mat = matriculaLista.filter((e) => e.grado_id === g.id).length;
      return { id: g.id, nombre: g.nombre, n: ls.length, estudiantes: ests.size, matricula: mat,
        reincidentes: [...ests].filter((id) => reincidentesSet.has(id)).length };
    }).filter((x) => x.n > 0 || x.matricula > 0);

    // Por curso
    const porCurso = cat.cursos.map((c) => {
      const ls = llegadas.filter((l) => l.curso_id === c.id);
      const ests = new Set(ls.map((l) => l.estudiante_id));
      const mat = matriculaLista.filter((e) => e.curso_id === c.id).length;
      return { id: c.id, nombre: c.nombre, grado: gradoNombre.get(c.grado_id) || "", gradoOrden: (cat.grados.find((g) => g.id === c.grado_id) || {}).orden || 0,
        n: ls.length, estudiantes: ests.size, matricula: mat, reincidentes: [...ests].filter((id) => reincidentesSet.has(id)).length };
    }).filter((x) => x.n > 0 || x.matricula > 0).sort((a, b) => a.gradoOrden - b.gradoOrden || a.nombre.localeCompare(b.nombre, "es", { numeric: true }));

    // Por período (comparativo) con desglose por grado
    const periodosConDatos = cat.periodos.filter((p) => llegadas.some((l) => l.periodo_id === p.id));
    const porPeriodo = periodosConDatos.map((p) => {
      const ls = llegadas.filter((l) => l.periodo_id === p.id);
      const cuenta = contarPor(ls, "estudiante_id");
      const porG = {}; ls.forEach((l) => (porG[l.grado_id] = (porG[l.grado_id] || 0) + 1));
      return { id: p.id, nombre: U.nombrePeriodo(p), n: ls.length, estudiantes: cuenta.size,
        reincidentes: [...cuenta.values()].filter((n) => n > umbral).length, porGrado: porG };
    });

    // Día de la semana y franja horaria
    const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
    llegadas.forEach((l) => porDiaSemana[U.diaSemana(l.fecha)]++);
    const dias = U.DIAS.map((d, i) => ({ etiqueta: d, n: porDiaSemana[i] })).filter((d, i) => i < 5 || d.n > 0);
    const minutos = llegadas.map((l) => { const [h, m] = String(l.hora).split(":").map(Number); return h * 60 + m; });
    let franjas = [];
    if (minutos.length) {
      const ini = Math.floor(Math.min(...minutos) / 15) * 15;
      const fin = Math.max(...minutos);
      const hhmm = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
      for (let a = ini; a <= fin; a += 15) franjas.push({ desde: a, hasta: a + 14, etiqueta: `${hhmm(a)}–${hhmm(a + 14)}`, n: 0 });
      if (franjas.length > 8) { const ult = franjas[7]; franjas = franjas.slice(0, 8); ult.hasta = 24 * 60; ult.etiqueta = `${hhmm(ult.desde)} o más`; }
      minutos.forEach((x) => { const f = franjas.find((b) => x >= b.desde && x <= b.hasta) || franjas[franjas.length - 1]; f.n++; });
    }

    // Ranking de estudiantes
    const grupos = new Map();
    llegadas.forEach((l) => { if (!grupos.has(l.estudiante_id)) grupos.set(l.estudiante_id, []); grupos.get(l.estudiante_id).push(l); });
    const ranking = [...porEst.entries()].map(([id, n]) => {
      const e = estMap.get(id) || {};
      const ls = grupos.get(id);
      return { id, nombre: U.nombre(e) || "(eliminado)", documento: e.documento || "", grado: gradoNombre.get(e.grado_id) || (ls[0] && ls[0].grado_nombre) || "",
        curso: cursoNombre.get(e.curso_id) || (ls[0] && ls[0].curso_nombre) || "", n, reincidente: reincidentesSet.has(id),
        ultima: ls.map((l) => l.fecha).sort().pop() };
    }).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));

    const diaPico = dias.reduce((m, d) => (d.n > m.n ? d : m), { etiqueta: "—", n: 0 });
    const cursoCritico = porCurso.reduce((m, c) => (c.n > (m ? m.n : 0) ? c : m), null);
    const notifs = notificaciones.filter((n) => n.estado !== "fallido" && (!filtros.periodoId || n.periodo_id === filtros.periodoId) &&
      (!filtros.estudianteId || n.estudiante_id === filtros.estudianteId) &&
      (!filtros.gradoId || (estMap.get(n.estudiante_id) || {}).grado_id === filtros.gradoId) &&
      (!filtros.cursoId || (estMap.get(n.estudiante_id) || {}).curso_id === filtros.cursoId));

    return {
      total, estudiantesConReporte, matricula: matriculaLista.length, reincidentes: reincidentesSet.size,
      promedio: estudiantesConReporte ? total / estudiantesConReporte : 0,
      diasConReporte: porDia.size, promedioDiario: porDia.size ? total / porDia.size : 0,
      diaPico, cursoCritico, notificaciones: notifs.length,
      serieDiaria, serieSemanal, serieMensual, porGrado, porCurso, porPeriodo, dias, franjas, ranking,
      periodoNombre: (id) => U.nombrePeriodo(periodoMap.get(id)),
    };
  }

  LT.estadisticas = { seguimiento, calcular, contarPor };
})();
