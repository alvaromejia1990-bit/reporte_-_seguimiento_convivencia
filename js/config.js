/*
 * Configuración de conexión. Elija UNA opción:
 *
 * A) GOOGLE DRIVE + GMAIL (recomendada): pegue en GOOGLE_SCRIPT_URL la URL de la
 *    aplicación web de Apps Script (termina en /exec). Ver docs/GUIA_GOOGLE_DRIVE.md.
 * B) SUPABASE (alternativa avanzada): URL y clave pública "anon" del proyecto.
 *    Ver docs/ALTERNATIVA_SUPABASE.md.
 *
 * Si ambas quedan vacías, la plataforma funciona en MODO DEMOSTRACIÓN (datos de
 * ejemplo guardados solo en el navegador).
 * Si publica con GitHub Actions, este archivo se genera a partir de las variables
 * del repositorio GOOGLE_SCRIPT_URL (o SUPABASE_URL y SUPABASE_ANON_KEY).
 */
window.LT_CONFIG = {
  GOOGLE_SCRIPT_URL: "",
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  ZONA_HORARIA: "America/Bogota",
};
