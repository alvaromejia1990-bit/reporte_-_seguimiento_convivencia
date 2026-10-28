import { api, enSesionExpirada } from './api.js';
import { $, $$, esc, toast } from './ui.js';
import * as registro from './views/registro.js';
import * as reportes from './views/reportes.js';
import * as seguimiento from './views/seguimiento.js';
import * as informes from './views/informes.js';
import * as configuracion from './views/configuracion.js';

const VISTAS = { registro, reportes, seguimiento, informes, configuracion };
const TITULOS = { registro: 'Registro', reportes: 'Reportes', seguimiento: 'Seguimiento', informes: 'Informes', configuracion: 'Configuración' };

const ctx = {
  usuario: null,
  config: null,
  get esAdmin() { return this.usuario?.rol === 'admin'; },
  async recargarConfig() {
    this.config = await api.get('/api/configuracion');
    $$('.js-inst-nombre').forEach((el) => { el.textContent = this.config.institucion.nombre; });
    document.title = `Llegadas tarde · ${this.config.institucion.nombre}`;
    return this.config;
  },
};

let limpiarVista = null;

function mostrarIngreso() {
  ctx.usuario = null;
  $('#aplicacion').hidden = true;
  $('#pantalla-ingreso').hidden = false;
  $('#modales').innerHTML = '';
  document.body.style.overflow = '';
  if (limpiarVista) { limpiarVista(); limpiarVista = null; }
  setTimeout(() => $('#ing-email').focus(), 50);
  api.get('/api/publico').then((p) => {
    $$('.js-inst-nombre').forEach((el) => { el.textContent = p.nombre; });
    document.title = `Ingreso · ${p.nombre}`;
  }).catch(() => {});
}

async function mostrarAplicacion() {
  await ctx.recargarConfig();
  $('#pantalla-ingreso').hidden = true;
  $('#aplicacion').hidden = false;
  const u = ctx.usuario;
  const iniciales = u.nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  $('#usuario-iniciales').textContent = iniciales;
  $('#usuario-nombre').textContent = u.nombre;
  $('#menu-nombre').textContent = u.nombre;
  $('#menu-rol').textContent = `${u.rol === 'admin' ? 'Administrador' : 'Docente'} · ${u.email}`;
  $('#menu-config').hidden = !ctx.esAdmin;
  if (!location.hash) location.hash = '#/reportes';
  else navegar();
}

async function navegar() {
  if (!ctx.usuario) return;
  const [, ruta = 'reportes', ...resto] = location.hash.replace(/^#/, '').split('/');
  const nombre = VISTAS[ruta] ? ruta : 'reportes';
  $$('[data-ruta]').forEach((a) => (a.dataset.ruta === nombre ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#menu-usuario').hidden = true;
  if (limpiarVista) { limpiarVista(); limpiarVista = null; }
  const cont = $('#vista');
  cont.innerHTML = '';
  document.title = `${TITULOS[nombre]} · ${ctx.config?.institucion.nombre || 'Llegadas tarde'}`;
  try {
    const r = await VISTAS[nombre].render(cont, ctx, resto);
    if (typeof r === 'function') limpiarVista = r;
  } catch (e) {
    console.error(e);
    cont.innerHTML = `<div class="aviso aviso--peligro">${esc(e.message || 'No se pudo cargar la sección.')}</div>`;
  }
  window.scrollTo(0, 0);
}

/* ---------- Eventos globales ---------- */
$('#form-ingreso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#ingreso-error');
  err.hidden = true;
  const boton = e.submitter || $('#form-ingreso button');
  boton.disabled = true;
  try {
    const { usuario } = await api.post('/api/auth/login', { email: $('#ing-email').value, password: $('#ing-clave').value });
    ctx.usuario = usuario;
    $('#ing-clave').value = '';
    await mostrarAplicacion();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    boton.disabled = false;
  }
});

$('#btn-usuario').addEventListener('click', (e) => {
  e.stopPropagation();
  const m = $('#menu-usuario');
  m.hidden = !m.hidden;
  $('#btn-usuario').setAttribute('aria-expanded', String(!m.hidden));
});
document.addEventListener('click', (e) => { if (!e.target.closest('.usuario')) $('#menu-usuario').hidden = true; });

$('#btn-salir').addEventListener('click', async () => {
  await api.post('/api/auth/logout').catch(() => {});
  location.hash = '';
  mostrarIngreso();
});

enSesionExpirada(() => {
  if (!ctx.usuario) return;
  toast('Su sesión expiró. Ingrese nuevamente.', 'error');
  mostrarIngreso();
});

window.addEventListener('hashchange', navegar);

/* ---------- Inicio ---------- */
(async () => {
  try {
    const { usuario } = await api.get('/api/auth/yo');
    if (!usuario) throw new Error('sin sesión');
    ctx.usuario = usuario;
    await mostrarAplicacion();
  } catch {
    mostrarIngreso();
  }
})();
