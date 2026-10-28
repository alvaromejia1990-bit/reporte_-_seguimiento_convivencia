// Utilidades de interfaz compartidas por todas las vistas.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icono = (nombre, extra = '') => `<svg ${extra} aria-hidden="true"><use href="#i-${nombre}"/></svg>`;

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaCorta(f) {
  if (!f) return '—';
  const [y, m, d] = String(f).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fechaLarga(f) {
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
export function fechaHora(f) {
  if (!f) return '—';
  return `${fechaCorta(f)} ${String(f).slice(11, 16)}`;
}
export const diaSemanaCorto = (f) => DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()].slice(0, 3);
export const numero = (n) => new Intl.NumberFormat('es-CO').format(n ?? 0);

/* ---------------- Notificaciones flotantes ---------------- */
export function toast(mensaje, tipo = 'info', ms = 4200) {
  const t = document.createElement('div');
  t.className = `toast toast--${tipo}`;
  t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  t.textContent = mensaje;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------------- Ventanas modales ---------------- */
export function modal({ titulo, cuerpo, pie = '', ancho = false, alCerrar }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal ${ancho ? 'modal--ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div class="modal__cab"><h2 id="modal-titulo">${esc(titulo)}</h2><button class="cerrar" type="button" data-cerrar aria-label="Cerrar">×</button></div>
      <div class="modal__cuerpo">${cuerpo}</div>
      ${pie ? `<div class="modal__pie">${pie}</div>` : ''}
    </div>`;
  const anterior = document.activeElement;
  const cerrar = () => {
    fondo.remove();
    document.removeEventListener('keydown', teclado);
    if (!$('.modal-fondo')) document.body.style.overflow = '';
    anterior?.focus?.();
    alCerrar?.();
  };
  const teclado = (e) => { if (e.key === 'Escape' && fondo === $$('.modal-fondo').pop()) cerrar(); };
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  fondo.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
  document.addEventListener('keydown', teclado);
  $('#modales').appendChild(fondo);
  document.body.style.overflow = 'hidden';
  setTimeout(() => (fondo.querySelector('[autofocus], input, select, textarea, .modal__pie .btn') || fondo.querySelector('.cerrar'))?.focus(), 30);
  return { el: fondo.querySelector('.modal'), cerrar };
}

export function confirmar({ titulo = 'Confirmar', mensaje, aceptar = 'Aceptar', peligro = false }) {
  return new Promise((ok) => {
    let decidido = false;
    const m = modal({
      titulo,
      cuerpo: `<p style="margin:0">${mensaje}</p>`,
      pie: `<button class="btn btn-secundario" data-cerrar>Cancelar</button><button class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-ok>${esc(aceptar)}</button>`,
      alCerrar: () => { if (!decidido) ok(false); },
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { decidido = true; m.cerrar(); ok(true); });
  });
}

/** Pone un botón en estado de carga mientras se ejecuta la promesa. */
export async function conCarga(boton, fn) {
  const html = boton?.innerHTML;
  if (boton) { boton.disabled = true; boton.innerHTML = `<span class="spinner"></span> ${esc(boton.textContent.trim())}`; }
  try { return await fn(); } finally { if (boton) { boton.disabled = false; boton.innerHTML = html; } }
}

export const cargando = () => '<div class="cargando"><div class="spinner" role="status" aria-label="Cargando"></div></div>';
export const vacio = (texto) => `<div class="vacio">${icono('vacio')}<div>${esc(texto)}</div></div>`;

/** Descarga un Blob con un nombre de archivo. */
export function guardarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------------- Selectores de grado y curso ---------------- */
export function opcionesGrado(config, seleccionado = '', todos = 'Todos los grados') {
  return `${todos !== null ? `<option value="">${esc(todos)}</option>` : ''}${config.grados.map((g) => `<option value="${g.id}" ${String(g.id) === String(seleccionado) ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}`;
}
export function opcionesCurso(config, gradoId, seleccionado = '', todos = 'Todos los cursos') {
  const lista = config.cursos.filter((c) => !gradoId || String(c.grado_id) === String(gradoId));
  return `${todos !== null ? `<option value="">${esc(todos)}</option>` : ''}${lista.map((c) => `<option value="${c.id}" ${String(c.id) === String(seleccionado) ? 'selected' : ''}>${esc(gradoId ? c.nombre : `${c.grado} · ${c.nombre}`)}</option>`).join('')}`;
}
export function opcionesPeriodo(config, seleccionado = '', conTodos = true) {
  return `${conTodos ? `<option value="todos" ${seleccionado === 'todos' ? 'selected' : ''}>Todos los períodos</option>` : ''}${config.periodos.map((p) => `<option value="${p.id}" ${String(p.id) === String(seleccionado) ? 'selected' : ''}>${esc(p.nombre)}${config.periodo_actual?.id === p.id ? ' (actual)' : ''}</option>`).join('')}`;
}
/** Enlaza un select de grado con uno de curso dependiente. */
export function enlazarGradoCurso(selGrado, selCurso, config, todos = 'Todos los cursos') {
  selGrado.addEventListener('change', () => {
    selCurso.innerHTML = opcionesCurso(config, selGrado.value, '', todos);
  });
}

export function insigniaEstado(estado) {
  const m = { enviado: ['exito', 'Enviado'], rechazado: ['alerta', 'Rechazado'], fallido: ['peligro', 'Fallido'] };
  const [c, t] = m[estado] || ['gris', 'Sin enviar'];
  return `<span class="insignia insignia--${c}">${t}</span>`;
}

export function claseContador(n, umbral) {
  if (n > umbral) return 'contador contador--peligro';
  if (n >= Math.max(1, umbral - 1)) return 'contador contador--alerta';
  return 'contador';
}
