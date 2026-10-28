# Plataforma institucional de control de llegadas tarde

Sistema web para **registrar estudiantes, reportar llegadas tarde, hacer seguimiento a reincidentes, notificar a los acudientes por correo y generar informes estadísticos** en PDF y Excel. Funciona en computadores, tabletas y celulares, con base de datos centralizada y acceso por roles.

---

## 1. Contenido del proyecto

```
control-tardanzas/
├── src/                      Backend (Node.js + Express)
│   ├── server.js             Servidor, seguridad, rutas
│   ├── db.js                 Esquema de la base de datos (SQLite) y configuración
│   ├── utils.js              Fechas (zona horaria), validaciones, enmascaramiento
│   ├── middleware/auth.js    Sesiones, roles y protección CSRF
│   ├── routes/               API: auth, estudiantes, tardanzas, seguimiento, informes, configuración
│   └── services/             Importación Excel/CSV, correo SMTP, PDF, estadísticas, exportación
├── public/                   Frontend (HTML, CSS y JavaScript sin compilación)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/app.js, api.js, ui.js
│   ├── js/views/             registro, reportes, seguimiento, informes, configuración
│   └── img/                  escudo.svg (por defecto) · coloque aquí logo.png
├── scripts/                  crear-admin, seed-demo (datos de prueba), respaldo
├── ejemplos/                 estudiantes_ejemplo.csv
├── .env.example              Plantilla de configuración
├── Dockerfile, docker-compose.yml
└── README.md
```

**Tecnologías:** Node.js 22.13+ (o 24 LTS), Express 5, SQLite integrado en Node (`node:sqlite`, modo WAL; sin compilar dependencias nativas), bcrypt, JWT en cookie *httpOnly*, Nodemailer (SMTP), PDFKit, ExcelJS, Chart.js.

---

## 2. Funcionalidades

| Sección | Qué hace |
|---|---|
| **Registro** | Base de estudiantes (documento, nombre, edad, grado, curso, acudiente, correo, teléfono, dirección). Formulario para crear, consultar, editar, retirar/reactivar y eliminar. **Carga masiva** desde Excel o CSV con vista previa, validación fila por fila, actualización de registros existentes y opción de crear grados/cursos faltantes. Plantilla descargable. Exportación a Excel. |
| **Reportes** | Filtro por grado y curso (o búsqueda por nombre). Botón **“Reportar llegada tarde”** por estudiante y **selección múltiple**. Fecha, hora, grado, curso y período se registran automáticamente con la hora oficial del servidor. **No permite duplicar** un reporte del mismo estudiante en la misma jornada. Contador acumulado por período y total. Lista de reportes del día, sincronizada cada 30 s entre docentes. |
| **Seguimiento** | Lista automática de estudiantes con **más de 4** llegadas tarde (límite configurable), con filtros por período, grado y curso. Botón **“Notificar acudiente”** con vista previa del correo y **PDF adjunto**. Historial con fecha de envío y **estado de entrega** (enviado / rechazado / fallido). Reporte individual en pantalla y descarga en PDF. Aviso si ya se notificó el mismo día. |
| **Informes** | Dashboard con indicadores (total, estudiantes con reportes, reincidentes, porcentajes, promedios, día pico, curso crítico), tendencia diaria/semanal/mensual, comparativos por grado, curso, período y grado×período, distribución por día de la semana y franja horaria, top 10. Filtros por período, grado, curso, estudiante y rango de fechas. **Exportación a PDF y Excel** con tablas y gráficos. |
| **Configuración** (administrador) | Datos de la institución y límite de seguimiento, períodos académicos, grados y cursos, usuarios y roles, prueba de correo, auditoría y descarga de respaldo. |

### Roles y protección de datos

| Permiso | Administrador | Docente |
|---|:-:|:-:|
| Reportar llegadas tarde | ✔ | ✔ |
| Consultar estudiantes | ✔ (datos completos) | ✔ (contacto **enmascarado**) |
| Crear, editar, importar, exportar, retirar o eliminar estudiantes | ✔ | — |
| Anular reportes | ✔ | — |
| Seguimiento, notificar acudientes, reporte individual | ✔ | ✔ (sin ver el correo completo) |
| Informes y exportaciones | ✔ | ✔ |
| Configuración, usuarios, auditoría, respaldo | ✔ | — |

Medidas de seguridad incluidas: contraseñas con bcrypt, sesión en cookie *httpOnly* + *SameSite=strict*, cierre de sesiones al cambiar contraseña o rol, límite de intentos de ingreso (10 cada 15 min), cabeceras de seguridad (Helmet/CSP), validación en servidor, consultas parametrizadas, registro de **auditoría** de todas las acciones sensibles y avisos de la **Ley 1581 de 2012** en documentos y correos. Las contraseñas del correo nunca se guardan en la base de datos (solo en `.env`).

---

## 3. Instalación rápida (prueba local)

Requisitos: **Node.js 22.13 o superior** — se recomienda la versión LTS más reciente (https://nodejs.org). No se necesitan herramientas de compilación ni un servidor de base de datos aparte.

```bash
cd control-tardanzas
npm install
cp .env.example .env          # en Windows: copy .env.example .env
```

Edite `.env` y complete como mínimo:

```ini
JWT_SECRETO=        # genere uno: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
ADMIN_EMAIL=coordinacion@suinstitucion.edu.co
ADMIN_CLAVE=UnaClaveSegura2026
INSTITUCION_NOMBRE=Institución Educativa ...
```

Opcional — cargar datos ficticios para explorar (336 estudiantes y ~1.200 reportes):

```bash
npm run demo        # crea también docente@demo.edu.co / Docente2026
```

Inicie el servidor:

```bash
npm start
```

Abra **http://localhost:3000** e ingrese con el administrador del `.env`. Cambie la contraseña en *Configuración › Mi cuenta*.

> Para usar la plataforma en la red del colegio, los equipos acceden con la IP del servidor: `http://192.168.x.x:3000`.

---

## 4. Puesta en marcha institucional (orden recomendado)

1. **Configuración › Institución:** nombre, sigla, ciudad, firma de los correos y límite de llegadas tarde (por defecto 4 → seguimiento desde la 5.ª).
2. **Configuración › Períodos académicos:** cree los períodos con sus fechas. *Un reporte solo se puede registrar si la fecha de hoy está dentro de un período.*
3. **Configuración › Grados y cursos:** cree grados (Sexto, Séptimo…) con su orden y los cursos (601, 602…). También pueden crearse automáticamente en la carga masiva.
4. **Registro › Carga masiva:** descargue la plantilla, diligénciela (o use el SIMAT exportado con esos encabezados) y cargue el archivo. Revise la vista previa y presione *Guardar cambios*.
5. **Configuración › Usuarios:** cree las cuentas de docentes y coordinadores.
6. **Configuración › Correo:** verifique la conexión SMTP y envíe un correo de prueba.
7. Escudo: copie `logo.png` (fondo transparente, cuadrado) en `public/img/`.

### Formato de la carga masiva

Columnas reconocidas (el orden no importa; se aceptan variantes como “Grupo” o “Celular”):

`Documento · Nombre completo · Edad · Grado · Curso · Acudiente · Correo acudiente · Teléfono · Dirección`

- Obligatorias: **Nombre completo, Grado, Curso**. Muy recomendado: **Documento** (es la llave que evita duplicados).
- El grado acepta “Sexto”, “6” o “6°”.
- Si el estudiante existe (por documento, o por nombre si no hay documento) se **actualiza**; las celdas vacías no borran datos.
- CSV separado por coma o punto y coma, UTF‑8 o ANSI (Excel). Ver `ejemplos/estudiantes_ejemplo.csv`.

---

## 5. Configuración del correo institucional (SMTP)

Complete en `.env` y reinicie el servidor:

**Google Workspace / Gmail** (requiere verificación en dos pasos y una *contraseña de aplicación*: Cuenta de Google › Seguridad › Contraseñas de aplicaciones):
```ini
SMTP_HOST=smtp.gmail.com
SMTP_PUERTO=465
SMTP_SEGURO=true
SMTP_USUARIO=convivencia@suinstitucion.edu.co
SMTP_CLAVE=abcdefghijklmnop
CORREO_REMITENTE="Coordinación de Convivencia <convivencia@suinstitucion.edu.co>"
```

**Microsoft 365 / Outlook** (el buzón debe tener habilitado *SMTP AUTH*):
```ini
SMTP_HOST=smtp.office365.com
SMTP_PUERTO=587
SMTP_SEGURO=false
SMTP_USUARIO=convivencia@suinstitucion.edu.co
SMTP_CLAVE=********
CORREO_REMITENTE="Coordinación de Convivencia <convivencia@suinstitucion.edu.co>"
```

**Servicios transaccionales** (recomendado para volúmenes altos): Brevo (`smtp-relay.brevo.com:587`), SendGrid (`smtp.sendgrid.net:587`, usuario `apikey`), Amazon SES, Mailgun. Verifique el dominio remitente (SPF/DKIM) para evitar que los correos lleguen a spam.

**Estado de entrega:** “Enviado” significa que el servidor de correo **aceptó** el mensaje para el destinatario; “Rechazado”, que rechazó la dirección; “Fallido”, error de conexión o autenticación. Los rebotes posteriores (buzón lleno, etc.) llegan como respuesta al remitente o a `CORREO_RESPONDER_A`.

---

## 6. Despliegue en producción

La plataforma debe publicarse con **HTTPS**. Opciones:

### A. Servidor propio (Ubuntu) con PM2 y Nginx
```bash
sudo apt install -y nodejs npm nginx
git clone … /opt/tardanzas   # o copie la carpeta
cd /opt/tardanzas && npm ci --omit=dev && cp .env.example .env && nano .env
sudo npm i -g pm2 && pm2 start src/server.js --name tardanzas && pm2 save && pm2 startup
```
Nginx como proxy (y certificado gratuito con `sudo certbot --nginx`):
```nginx
server {
  server_name llegadas.suinstitucion.edu.co;
  client_max_body_size 25m;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host;
               proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
}
```
En `.env`: `COOKIE_SEGURA=true` y `CONFIAR_PROXY=1`.

### B. Docker
```bash
cp .env.example .env && nano .env
docker compose up -d --build
```
La base de datos queda en `./data` (volumen persistente).

### C. Nube (Render, Railway, Fly.io)
Cree un servicio web Node con comando `npm start`, agregue las variables del `.env` en el panel y **monte un disco persistente** en `/app/data` (o defina `RUTA_BASE_DATOS` dentro del disco). Sin disco persistente los datos se pierden al reiniciar.

### D. Windows (servidor del colegio)
Instale Node.js LTS, ejecute `npm install` y `npm start` en la carpeta. Para que inicie con el equipo use `pm2` + `pm2-windows-startup` o el Programador de tareas.

---

## 7. Respaldo y recuperación

- Desde la plataforma: *Configuración › Auditoría y respaldo › Descargar respaldo*.
- Por consola: `npm run respaldo` (guarda en `respaldos/` y conserva los últimos 30).
- Programación diaria (Linux): `crontab -e` → `0 19 * * * cd /opt/tardanzas && npm run respaldo`.
- Restaurar: detenga el servidor y reemplace `data/tardanzas.db` por el archivo de respaldo.

Guarde los respaldos cifrados y fuera del servidor: contienen datos personales de menores.

---

## 8. Mantenimiento y soporte

| Necesidad | Acción |
|---|---|
| Olvidó la contraseña del administrador | `npm run crear-admin -- correo@inst.edu.co "Nombre"` (crea o restablece) |
| Cambiar el límite de seguimiento | *Configuración › Institución* |
| Nuevo año lectivo | Cree los nuevos períodos; actualice grados/cursos con la carga masiva (los estudiantes se identifican por documento). Retire a los egresados. |
| Estudiante que se retira | *Ver › Retirar estudiante* (conserva el historial). *Eliminar* borra todo: úselo solo ante solicitudes de supresión de datos. |
| Error al reportar “sin período” | La fecha de hoy no está en ningún período: ajuste las fechas. |
| Ver qué hizo cada usuario | *Configuración › Auditoría* |

### API (resumen)
Todas las rutas requieren sesión; las que modifican datos exigen la cabecera `X-Requested-With: fetch`.
`POST /api/auth/login` · `GET/POST/PUT/PATCH/DELETE /api/estudiantes` · `POST /api/estudiantes/importar` · `GET /api/tardanzas/estudiantes` · `POST /api/tardanzas` · `GET /api/seguimiento` · `POST /api/seguimiento/estudiante/:id/notificar` · `GET /api/seguimiento/estudiante/:id/reporte.pdf` · `GET /api/informes` · `POST /api/informes/exportar/{pdf|xlsx}` · `/api/configuracion/*`

---

## 9. Modelo de datos

- **usuarios** (nombre, email, rol admin/docente, contraseña cifrada, estado)
- **periodos** (nombre, fecha_inicio, fecha_fin — sin cruces)
- **grados** (nombre, orden) · **cursos** (grado, nombre)
- **estudiantes** (documento único, nombre, edad, grado, curso, acudiente, correo, teléfono, dirección, activo)
- **llegadas_tarde** (estudiante, fecha, hora, período, grado, curso, registrado_por, observación) — **única por estudiante y fecha**
- **notificaciones** (estudiante, período, destinatario, asunto, cantidad, fechas, estado, detalle, fecha de envío)
- **auditoria** (usuario, acción, detalle, IP, fecha) · **configuracion** (clave/valor)
