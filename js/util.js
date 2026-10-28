/* Utilidades de interfaz, fechas y validación */
(function () {
  "use strict";
  const LT = (window.LT = window.LT || {});
  const U = (LT.util = {});
  const TZ = (window.LT_CONFIG && window.LT_CONFIG.ZONA_HORARIA) || "America/Bogota";
  U.TZ = TZ;
  LT.error = (e) => (e && (e.mensaje || e.message)) || String(e || "Error desconocido");

  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  U.esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  U.norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
  U.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.nombre = (e) => (e ? `${e.apellidos ? e.apellidos + " " : ""}${e.nombres}`.trim() : "");
  U.iniciales = (t) => String(t || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  U.plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + "s"}`;
  U.fmtNum = (n, d = 0) => Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });
  U.pct = (a, b, d = 1) => (b ? U.fmtNum((a / b) * 100, d) + " %" : "0 %");

  /* ---------------- Fechas (zona horaria institucional) ---------------- */
  const fmtPartes = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  U.ahora = (d = new Date()) => {
    const p = Object.fromEntries(fmtPartes.formatToParts(d).map((x) => [x.type, x.value]));
    return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` };
  };
  U.hoy = () => U.ahora().fecha;
  const aFecha = (f) => new Date(String(f).slice(0, 10) + "T12:00:00Z");
  U.fmtFecha = (f, estilo = "corta") => {
    if (!f) return "";
    const d = aFecha(f);
    if (estilo === "larga") { const t = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); return t.charAt(0).toUpperCase() + t.slice(1); }
    if (estilo === "media") return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
    if (estilo === "dm") return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
    const [a, m, dd] = String(f).slice(0, 10).split("-");
    return `${dd}/${m}/${a}`;
  };
  U.fmtHora = (h) => (h ? String(h).slice(0, 5) : "");
  U.fmtFechaHora = (iso) => {
    if (!iso) return "";
    const a = U.ahora(new Date(iso));
    return `${U.fmtFecha(a.fecha)} ${a.hora.slice(0, 5)}`;
  };
  U.diaSemana = (f) => (aFecha(f).getUTCDay() + 6) % 7; // 0 = lunes
  U.DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  U.MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  U.lunesDe = (f) => { const d = aFecha(f); d.setUTCDate(d.getUTCDate() - U.diaSemana(f)); return d.toISOString().slice(0, 10); };
  U.sumarDias = (f, n) => { const d = aFecha(f); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  U.periodoDe = (fecha, periodos) => periodos.find((p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin) || null;
  U.periodoActual = (periodos) => U.periodoDe(U.hoy(), periodos) ||
    [...periodos].filter((p) => p.fecha_inicio <= U.hoy()).sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))[0] || periodos[0] || null;
  U.nombrePeriodo = (p) => (p ? `${p.nombre} ${p.anio}` : "");

  /* ---------------- Validación ---------------- */
  U.validarCorreo = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c || "").trim());
  U.limpiarDocumento = (d) => String(d ?? "").replace(/[\s.]/g, "").toUpperCase();
  U.validarDocumento = (d) => /^[A-Za-z0-9-]{3,20}$/.test(U.limpiarDocumento(d));
  U.validarTelefono = (t) => !t || /^[+\d][\d\s()-]{6,19}$/.test(String(t).trim());
  U.TIPOS_DOC = { RC: "Registro civil", TI: "Tarjeta de identidad", CC: "Cédula de ciudadanía", CE: "Cédula de extranjería", PPT: "Permiso por protección temporal", PEP: "Permiso especial de permanencia", NUIP: "NUIP", PAS: "Pasaporte", OTRO: "Otro" };

  /* ---------------- Grados y cursos ---------------- */
  // Resuelve el texto de grado/curso (de un archivo) contra el catálogo.
  // Acepta "Sexto", "sexto", "6", "6°" para el grado y "601", "A" para el curso.
  U.resolverGrado = (cat, txt) => {
    const t = U.norm(txt).replace(/[°º]/g, "");
    if (!t) return null;
    return cat.grados.find((g) => U.norm(g.nombre) === t) || (/^\d+$/.test(t) ? cat.grados.find((g) => Number(g.orden) === Number(t)) : null) || null;
  };
  U.resolverCurso = (cat, gradoTxt, cursoTxt) => {
    const c = U.norm(cursoTxt);
    const g = U.resolverGrado(cat, gradoTxt);
    if (!c) return { grado: g, curso: null };
    if (g) return { grado: g, curso: cat.cursos.find((x) => x.grado_id === g.id && U.norm(x.nombre) === c) || null };
    if (U.norm(gradoTxt)) return { grado: null, curso: null };
    const posibles = cat.cursos.filter((x) => U.norm(x.nombre) === c);
    if (posibles.length === 1) return { grado: cat.grados.find((x) => x.id === posibles[0].grado_id), curso: posibles[0] };
    return { grado: null, curso: null };
  };

  /* ---------------- HTML auxiliar ---------------- */
  U.opciones = (lista, sel, { vacio = null, valor = "id", texto = "nombre" } = {}) =>
    (vacio !== null ? `<option value="">${U.esc(vacio)}</option>` : "") +
    lista.map((o) => { const v = typeof valor === "function" ? valor(o) : o[valor]; const t = typeof texto === "function" ? texto(o) : o[texto];
      return `<option value="${U.esc(v)}" ${String(v) === String(sel ?? "") ? "selected" : ""}>${U.esc(t)}</option>`; }).join("");

  U.contador = (n, umbral) => `<span class="contador ${n > umbral ? "contador--alto" : n >= Math.max(1, umbral - 1) ? "contador--medio" : ""}">${n}</span>`;

  const ESTADOS_NOTIF = {
    pendiente: ["Pendiente", ""], enviado: ["Enviado", "chip--info"], entregado: ["Entregado", "chip--exito"],
    abierto: ["Leído", "chip--exito"], rebotado: ["Rebotado", "chip--peligro"], fallido: ["Fallido", "chip--peligro"],
  };
  U.chipEstado = (e) => { const [t, c] = ESTADOS_NOTIF[e] || [e, ""]; return `<span class="chip ${c}">${U.esc(t)}</span>`; };
  U.textoEstado = (e) => (ESTADOS_NOTIF[e] || [e])[0];

  /* ---------------- Íconos ---------------- */
  const P = {
    usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    campana: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.38.37.72.68.97.31.25.7.39 1.1.39H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M17 6l3 3M15 8l2 2"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    bajar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    borrar: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    correo: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    archivo: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    ok: '<path d="M20 6 9 17l-5-5"/>',
    cerrar: '<path d="M18 6 6 18M6 6l12 12"/>',
    alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    ojo: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    recargar: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    usuario: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6"/>',
    excel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    filtro: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  };
  U.icono = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;
  U.ico = (n) => `<span class="ico">${U.icono(n)}</span>`;
  U.pintarIconos = (raiz = document) => U.$$("[data-ico]", raiz).forEach((el) => { if (!el.firstChild) el.innerHTML = U.icono(el.dataset.ico); });

  /* ---------------- Toasts ---------------- */
  U.toast = (msg, tipo = "ok", ms = 4200) => {
    const el = document.createElement("div");
    el.className = `toast toast--${tipo}`;
    el.innerHTML = `${U.ico(tipo === "error" ? "alerta" : tipo === "aviso" ? "info" : "ok")}<div>${U.esc(msg)}</div>`;
    U.$("#capa-toasts").appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, ms);
  };

  /* ---------------- Modales ---------------- */
  U.modal = ({ titulo, html, botones = [], tam = "", alAbrir, cerrable = true }) => {
    return new Promise((resolve) => {
      const fondo = document.createElement("div");
      fondo.className = "modal-fondo";
      fondo.innerHTML = `
        <div class="modal ${tam ? "modal--" + tam : ""}" role="dialog" aria-modal="true" aria-label="${U.esc(titulo)}">
          <div class="modal__cab"><h2>${U.esc(titulo)}</h2>
            ${cerrable ? `<button class="btn-icono" data-cerrar aria-label="Cerrar">${U.ico("cerrar")}</button>` : ""}</div>
          <div class="modal__cuerpo">${html}</div>
          ${botones.length ? `<div class="modal__pie">${botones.map((b, i) => `<button class="btn ${b.clase || ""}" data-btn="${i}" ${b.id ? `id="${b.id}"` : ""}>${b.icono ? U.ico(b.icono) : ""}${U.esc(b.texto)}</button>`).join("")}</div>` : ""}
        </div>`;
      const previo = document.activeElement;
      const ctl = {
        el: fondo,
        cerrar: (valor) => { fondo.remove(); document.removeEventListener("keydown", tecla); if (previo && previo.focus) previo.focus(); resolve(valor); },
      };
      const tecla = (e) => { if (e.key === "Escape" && cerrable && fondo === U.$$(".modal-fondo").pop()) ctl.cerrar(null); };
      document.addEventListener("keydown", tecla);
      fondo.addEventListener("mousedown", (e) => { if (e.target === fondo && cerrable) ctl.cerrar(null); });
      fondo.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => ctl.cerrar(null)));
      botones.forEach((b, i) => {
        fondo.querySelector(`[data-btn="${i}"]`).addEventListener("click", async (ev) => {
          if (b.accion) {
            const btn = ev.currentTarget;
            U.ocupado(btn, true);
            try { const r = await b.accion(ctl); if (r !== false) ctl.cerrar(r === undefined ? b.valor ?? true : r); }
            catch (err) { U.toast(LT.error(err), "error", 6000); }
            finally { if (btn.isConnected) U.ocupado(btn, false); }
          } else ctl.cerrar(b.valor ?? null);
        });
      });
      U.$("#capa-modales").appendChild(fondo);
      const foco = fondo.querySelector("input:not([type=hidden]):not([disabled]), select, textarea, .modal__pie .btn--primario");
      if (foco) setTimeout(() => foco.focus(), 30);
      if (alAbrir) alAbrir(fondo, ctl);
    });
  };
  U.confirmar = (titulo, mensaje, { texto = "Confirmar", peligro = false } = {}) =>
    U.modal({ titulo, html: `<p style="margin:0">${mensaje}</p>`, botones: [
      { texto: "Cancelar", clase: "btn--fantasma", valor: false },
      { texto, clase: peligro ? "btn--peligro" : "btn--primario", valor: true },
    ] }).then((v) => v === true);

  U.ocupado = (btn, si) => {
    if (!btn) return;
    if (si) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="giro"></span>${btn.textContent.trim()}`; }
    else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
  };

  U.descargar = (blob, nombre) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  U.nombreArchivo = (base) => `${U.norm(base).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${U.hoy()}`;

  /* Paginación simple en memoria */
  U.paginar = (lista, pagina, tam = 50) => {
    const total = Math.max(1, Math.ceil(lista.length / tam));
    const p = Math.min(Math.max(1, pagina), total);
    return { filas: lista.slice((p - 1) * tam, p * tam), pagina: p, total, desde: lista.length ? (p - 1) * tam + 1 : 0, hasta: Math.min(p * tam, lista.length) };
  };
  U.htmlPaginacion = (pg, n) => pg.total <= 1 ? `<span class="muted peq">${U.plural(n, "registro")}</span>` :
    `<span class="muted peq">${pg.desde}–${pg.hasta} de ${n}</span>
     <div class="paginacion">
       <button class="btn btn--sm" data-pag="${pg.pagina - 1}" ${pg.pagina <= 1 ? "disabled" : ""}>Anterior</button>
       <span class="peq num">${pg.pagina} / ${pg.total}</span>
       <button class="btn btn--sm" data-pag="${pg.pagina + 1}" ${pg.pagina >= pg.total ? "disabled" : ""}>Siguiente</button>
     </div>`;
})();
