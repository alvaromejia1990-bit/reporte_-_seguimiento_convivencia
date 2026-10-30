# Alternativa avanzada: base de datos en Supabase

> La instalación recomendada es la de **Google Drive + Gmail** ([GUIA_GOOGLE_DRIVE.md](GUIA_GOOGLE_DRIVE.md)).
> Use esta alternativa si la institución prefiere una base de datos PostgreSQL administrada
> (más capacidad, seguridad por filas en la base de datos) y un proveedor de correo transaccional (Brevo o Resend).

Archivos involucrados: `supabase/schema.sql`, `supabase/datos_iniciales.sql`, `supabase/functions/*`, `js/backend-supabase.js`.
En `js/config.js` deje `GOOGLE_SCRIPT_URL` vacío y complete `SUPABASE_URL` y `SUPABASE_ANON_KEY`.

## Instalación paso a paso (≈ 30 minutos)

### Paso 1 · Crear el repositorio en GitHub
1. Cree un repositorio nuevo (puede ser privado si su plan de GitHub lo permite con Pages; si no, público: **no contiene datos personales**, estos viven en Supabase).
2. Suba todo el contenido de esta carpeta a la rama `main`:
   ```bash
   git init && git add . && git commit -m "Plataforma de control de llegadas tarde"
   git branch -M main
   git remote add origin https://github.com/SU-USUARIO/llegadas-tarde.git
   git push -u origin main
   ```

### Paso 2 · Crear el proyecto en Supabase
1. Regístrese en <https://supabase.com> y cree un proyecto (región recomendada: *East US* o *São Paulo*). Guarde la contraseña de la base de datos.
2. Abra **SQL Editor → New query**, pegue el contenido de `supabase/schema.sql` y pulse **Run**.
3. (Opcional) Ejecute también `supabase/datos_iniciales.sql`, ajustando antes nombres, fechas de períodos, grados y cursos.
4. En **Authentication → Sign In / Providers → Email**: desactive **«Allow new users to sign up»** (las cuentas las crea el administrador) y, si lo desea, desactive *Confirm email*.
5. En **Authentication → URL Configuration** escriba como *Site URL* la dirección de su sitio en GitHub Pages (Paso 5), p. ej. `https://su-usuario.github.io/llegadas-tarde/`, y agréguela en *Redirect URLs* (necesario para recuperar contraseñas).

### Paso 3 · Crear el primer administrador
En **Authentication → Users → Add user → Create new user**, escriba su correo y una contraseña segura (marque *Auto Confirm User*). **El primer usuario creado queda automáticamente como administrador activo.** Los demás usuarios créelos desde la plataforma (*Configuración → Usuarios y roles*).

### Paso 4 · Configurar el correo y las funciones de servidor
1. **Proveedor de correo (elija uno):**
   - **Brevo** (recomendado si no tiene dominio propio): cree una cuenta en <https://www.brevo.com>, verifique el remitente (*Senders, Domains & Dedicated IPs → Senders*), por ejemplo `convivencia@su-institucion.edu.co` o una cuenta institucional de Gmail, y genere una clave en *SMTP & API → API Keys*.
   - **Resend**: cree una cuenta en <https://resend.com>, **verifique el dominio** de la institución y genere una API key.
2. Instale la CLI de Supabase (<https://supabase.com/docs/guides/cli>) y desde la carpeta del repositorio ejecute:
   ```bash
   supabase login
   supabase link --project-ref SU_PROJECT_REF          # aparece en la URL del proyecto
   cp supabase/.env.ejemplo supabase/.env              # edite los valores reales
   supabase secrets set --env-file supabase/.env
   supabase functions deploy notificar-acudiente
   supabase functions deploy gestionar-usuarios
   supabase functions deploy webhook-correo --no-verify-jwt
   ```
   | Secreto | Uso |
   |---|---|
   | `EMAIL_PROVIDER` | `brevo` o `resend` |
   | `BREVO_API_KEY` / `RESEND_API_KEY` | Clave del proveedor elegido |
   | `EMAIL_FROM` | Correo remitente verificado |
   | `EMAIL_FROM_NAME` | Nombre visible del remitente |
   | `WEBHOOK_TOKEN` | Cadena aleatoria larga que protege el webhook |
   | `SITE_URL` | Origen del sitio (p. ej. `https://su-usuario.github.io`) para CORS |

   *Sin CLI:* también puede crear cada función en **Edge Functions → Deploy a new function → Via Editor**, pegando el `index.ts` y los archivos de `_shared/`, y cargar los secretos en **Edge Functions → Secrets**. En `webhook-correo` desactive *Enforce JWT verification*.
3. **Estado de entrega (webhook):** registre la URL
   `https://SU_PROJECT_REF.supabase.co/functions/v1/webhook-correo?token=SU_WEBHOOK_TOKEN`
   - Brevo: *Transactional → Settings → Webhook* con los eventos *Delivered, Opened, Hard/Soft bounce, Blocked, Spam*.
   - Resend: *Webhooks → Add endpoint* con `email.delivered`, `email.opened`, `email.bounced`, `email.complained`.

### Paso 5 · Conectar el sitio y publicarlo
1. En Supabase → **Project Settings → API** copie la *Project URL* y la clave **anon public**.
2. Elija una opción:
   - **A (recomendada):** en GitHub → *Settings → Secrets and variables → Actions → Variables*, cree `SUPABASE_URL` y `SUPABASE_ANON_KEY`. El flujo `.github/workflows/pages.yml` genera `js/config.js` al publicar.
   - **B:** edite directamente `js/config.js` con esos dos valores y haga *commit*.
   > La clave *anon* es pública por diseño; la protección real son las políticas RLS. **Nunca** ponga la clave *service_role* en el repositorio.
3. En GitHub → *Settings → Pages → Build and deployment → Source*: **GitHub Actions**. Cada `push` a `main` publica el sitio en `https://SU-USUARIO.github.io/NOMBRE-REPO/`.

### Paso 6 · Primer uso
1. Ingrese con la cuenta de administrador.
2. **Configuración → Institución:** nombre, firma de las notificaciones, correo institucional y límite (por defecto 4: entran a seguimiento con 5 o más).
3. **Configuración → Períodos académicos** y **Grados y cursos** (si no ejecutó `datos_iniciales.sql`).
4. **Registro → Carga masiva:** descargue la plantilla, diligénciela (o exporte desde el SIMAT/sistema académico) y cárguela.
5. **Configuración → Usuarios y roles:** cree las cuentas de docentes y coordinadores.
6. Prueba de correo: registre un estudiante de prueba con su propio correo como acudiente, repórtelo 5 veces (puede usar *Registrar con otra fecha*) y notifíquelo desde Seguimiento.

---


## Solución de problemas
| Síntoma | Causa probable |
|---|---|
| «Su cuenta aún no está activa» | El usuario se registró por su cuenta: actívelo en *Usuarios y roles*. |
| «No hay un período académico configurado» | La fecha de hoy no cae en ningún período. |
| Error al notificar «Falta configurar el secreto…» | Revise los secretos de las funciones (Paso 4). |
| Correos en estado «Enviado» y nunca «Entregado» | Falta registrar el webhook del proveedor. |
| Error de CORS al notificar | `SITE_URL` no coincide con el origen del sitio (sin ruta ni barra final). |
| El sitio muestra «Modo demostración» | `js/config.js` no tiene la URL/clave de Supabase. |

