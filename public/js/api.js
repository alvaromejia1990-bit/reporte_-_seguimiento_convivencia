// Cliente HTTP de la API institucional.

export class ErrorApi extends Error {
  constructor(mensaje, estado, datos) {
    super(mensaje);
    this.estado = estado;
    this.datos = datos;
  }
}

let alExpirarSesion = () => {};
export const enSesionExpirada = (fn) => { alExpirarSesion = fn; };

async function peticion(metodo, url, cuerpo, { blob = false } = {}) {
  const opciones = { method: metodo, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
  if (cuerpo instanceof FormData) opciones.body = cuerpo;
  else if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  let r;
  try {
    r = await fetch(url, opciones);
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Verifique su red e intente de nuevo.', 0);
  }
  if (r.status === 401 && !url.endsWith('/auth/login') && !url.endsWith('/auth/yo')) alExpirarSesion();
  if (!r.ok) {
    const datos = await r.json().catch(() => ({}));
    throw new ErrorApi(datos.error || `Error ${r.status}`, r.status, datos);
  }
  if (blob) {
    const disp = r.headers.get('Content-Disposition') || '';
    const nombre = decodeURIComponent((disp.match(/filename="?([^"]+)"?/) || [])[1] || 'archivo');
    return { blob: await r.blob(), nombre };
  }
  return r.json();
}

export const api = {
  get: (url) => peticion('GET', url),
  post: (url, cuerpo) => peticion('POST', url, cuerpo ?? {}),
  put: (url, cuerpo) => peticion('PUT', url, cuerpo ?? {}),
  patch: (url, cuerpo) => peticion('PATCH', url, cuerpo ?? {}),
  del: (url, cuerpo) => peticion('DELETE', url, cuerpo),
  archivo: (url) => peticion('GET', url, undefined, { blob: true }),
  archivoPost: (url, cuerpo) => peticion('POST', url, cuerpo, { blob: true }),
};

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};
