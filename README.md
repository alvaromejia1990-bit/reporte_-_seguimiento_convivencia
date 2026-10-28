# Control de Llegadas Tarde · Plataforma institucional

Plataforma web para **registrar estudiantes, reportar llegadas tarde, hacer seguimiento a reincidentes, notificar a los acudientes por correo y generar informes estadísticos** en PDF y Excel. Es responsiva (computador, tableta y celular), usa una **base de datos centralizada y sincronizada** con control de acceso por roles, y se publica directamente desde **GitHub Pages**.

| Capa | Tecnología | Dónde vive |
|---|---|---|
| Frontend | HTML + CSS + JavaScript (sin compilación) | Repositorio → GitHub Pages |
| Base de datos | PostgreSQL con seguridad por filas (RLS) | Supabase (plan gratuito suficiente) |
| Autenticación | Supabase Auth (correo + contraseña) | Supabase |
| Backend | Funciones de servidor (Deno) | Supabase Edge Functions |
| Correo real | Brevo (300 correos/día gratis) o Resend | API del proveedor |

> **Modo demostración:** si `js/config.js` no tiene datos de Supabase, la plataforma funciona con datos de ejemplo guardados en el navegador (cuentas `admin@demo.edu.co` / `admin123` y `docente@demo.edu.co` / `docente123`). Sirve para conocerla y capacitar; **no use datos reales en ese modo**.

---

## 1. Funcionalidades

**1 · Registro.** Base de estudiantes con tipo y número de documento, apellidos, nombres, edad, grado, curso, acudiente, parentesco, correo, teléfono y dirección. Formulario para registrar, consultar, editar, retirar/reactivar y eliminar. **Carga masiva** desde Excel (.xlsx/.xls) o CSV con vista previa, validación fila por fila, actualización de registros existentes (por documento) y opción de crear grados/cursos faltantes. Plantilla descargable y exportación del listado.
**Sin duplicados:** documento único y nombre completo único dentro de cada curso (validado en el navegador y en la base de datos).

**2 · Reportes.** Filtros por grado y curso (o búsqueda), botón **«Reportar llegada tarde»** por estudiante y **selección múltiple**. Se registran automáticamente estudiante, **fecha, hora (del servidor), grado, curso y período académico**, y el usuario que reporta. El contador acumulado se actualiza solo. **No se permite** más de un reporte por estudiante en la misma jornada (restricción `UNIQUE` en la base). Panel de reportes del día, sincronizado en tiempo real entre docentes. El administrador puede anular reportes y registrar correcciones con otra fecha.

**3 · Seguimiento.** Lista automática de estudiantes con **más de 4** llegadas tarde (límite configurable) por período, grado y curso. Botón **«Notificar acudiente»** con vista previa del correo institucional (estudiante, grado, curso, período, fechas y horas, cantidad, datos del acudiente). Envío individual o masivo, protección contra envíos repetidos el mismo día, **historial** con fecha de envío y **estado de entrega** (enviado → entregado → leído, o rebotado/fallido) actualizado por webhook del proveedor. **Reporte individual** en pantalla y descarga en PDF y Excel.

**4 · Informes.** Dashboard con indicadores (total, estudiantes con reportes, % de la matrícula, reincidentes, promedio, día pico, notificaciones), **tendencia diaria/semanal/mensual**, por grado, por curso, **comparativo por período** (por grado), día de la semana, franja horaria y ranking. Filtros por período, grado, curso, estudiante y rango de fechas. **Exportación a PDF y Excel** con tablas, gráficos y análisis narrativo.

**Configuración (administrador).** Datos institucionales y firma, límite de seguimiento, **períodos académicos** (sin solapes), **grados y cursos**, **usuarios y roles**, auditoría y respaldo completo en Excel.

### Roles y protección de datos

| Permiso | Administrador | Docente |
|---|:-:|:-:|
| Reportar llegadas tarde (hora del servidor) | ✔ | ✔ |
| Consultar estudiantes (datos básicos) | ✔ | ✔ |
| Ver datos de contacto de acudientes | ✔ | — (protegidos en la base de datos) |
| Crear, editar, importar, retirar y eliminar estudiantes | ✔ | — |
| Anular reportes / registrar con otra fecha | ✔ | — |
| Seguimiento, notificar acudientes, reporte individual | ✔ | ✔ (correo enmascarado) |
| Informes y exportaciones | ✔ | ✔ |
| Configuración, usuarios, auditoría, respaldo | ✔ | — |

La seguridad **no depende del navegador**: las políticas RLS de PostgreSQL impiden que un docente lea la tabla `estudiantes` (solo la vista `v_estudiantes_basico`, sin datos del acudiente), que modifique o elimine reportes, o que un usuario inactivo o anónimo acceda a cualquier dato. Las cuentas que se registren por su cuenta quedan **inactivas** hasta que un administrador las habilite. Todas las acciones sensibles quedan en **auditoría**. Avisos de la Ley 1581 de 2012 en correos y documentos.

---

## 2. Estructura del repositorio

```
├── index.html                  Aplicación (una sola página)
├── css/styles.css              Sistema visual institucional y diseño responsivo
├── js/
│   ├── config.js               ← URL y clave pública de Supabase
│   ├── util.js                 Fechas (zona America/Bogota), validación, modales, íconos
│   ├── backend-supabase.js     Conexión a la base de datos real
│   ├── backend-demo.js         Modo demostración (navegador)
│   ├── estadisticas.js         Cálculos del seguimiento y del dashboard
│   ├── exportar.js             Generación de PDF y Excel
│   ├── plantilla-correo.js     Vista previa del correo (modo demostración)
│   ├── app.js                  Sesión, menú y navegación
│   └── vistas/                 registro, reportes, seguimiento, informes, configuracion
├── vendor/                     Bibliotecas incluidas (Supabase, Chart.js, SheetJS, ExcelJS, jsPDF)
├── img/escudo.svg              Escudo por defecto (reemplácelo por el de su institución)
├── supabase/
│   ├── schema.sql              Tablas, restricciones, disparadores, RLS y funciones
│   ├── datos_iniciales.sql     Períodos 2026, grados 6.º a 11.º y cursos (opcional)
│   ├── config.toml             Configuración de funciones para Supabase CLI
│   ├── .env.ejemplo            Plantilla de secretos del correo
│   └── functions/
│       ├── notificar-acudiente/  Construye y envía el correo; registra el historial
│       ├── gestionar-usuarios/   Crear, activar, cambiar rol, restablecer clave, eliminar
│       ├── webhook-correo/       Recibe estados de entrega (entregado, leído, rebotado)
│       └── _shared/              Utilidades y plantilla del correo
├── ejemplos/estudiantes_ejemplo.csv
└── .github/workflows/pages.yml  Publicación automática en GitHub Pages
```

---

## 3. Instalación paso a paso (≈ 30 minutos)

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

## 4. Operación y mantenimiento
- **Nuevo año lectivo:** cree los períodos del año; actualice grados/cursos de los estudiantes con una nueva carga masiva (el documento identifica al estudiante y se actualiza su curso). Los informes permiten filtrar por período.
- **Retiros:** marque al estudiante como *retirado* para conservar su historial.
- **Respaldo:** *Configuración → Respaldo* descarga todo en Excel. Supabase guarda copias diarias automáticas.
- **Escudo:** reemplace `img/escudo.svg` o indique una URL en *Configuración → Institución*.
- **Zona horaria:** fecha y hora de los reportes se toman del servidor en `America/Bogota` (campo `zona_horaria` de la tabla `configuracion`).
- **Plan gratuito de Supabase:** los proyectos inactivos por 7 días se pausan; con uso diario escolar no ocurre, pero durante vacaciones puede reactivarlo desde el panel.
- **Actualizar el esquema:** `schema.sql` es idempotente; puede volver a ejecutarlo tras cambios sin perder datos.

## 5. Solución de problemas
| Síntoma | Causa probable |
|---|---|
| «Su cuenta aún no está activa» | El usuario se registró por su cuenta: actívelo en *Usuarios y roles*. |
| «No hay un período académico configurado» | La fecha de hoy no cae en ningún período. |
| Error al notificar «Falta configurar el secreto…» | Revise los secretos de las funciones (Paso 4). |
| Correos en estado «Enviado» y nunca «Entregado» | Falta registrar el webhook del proveedor. |
| Error de CORS al notificar | `SITE_URL` no coincide con el origen del sitio (sin ruta ni barra final). |
| El sitio muestra «Modo demostración» | `js/config.js` no tiene la URL/clave de Supabase. |

## 6. Licencias de terceros
Supabase JS (MIT), Chart.js (MIT), SheetJS Community Edition (Apache 2.0), ExcelJS (MIT), jsPDF y jsPDF-AutoTable (MIT), fuente Public Sans (OFL).
