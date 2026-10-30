# Control de Llegadas Tarde · Plataforma institucional

Plataforma web para **registrar estudiantes, reportar llegadas tarde, hacer seguimiento a reincidentes, notificar a los acudientes por correo y generar informes estadísticos** en PDF y Excel. Es responsiva (computador, tableta y celular), tiene inicio de sesión con roles de administrador y docente, y se publica gratis en **GitHub Pages**.

## Arquitectura recomendada: Google Drive + Gmail

| Capa | Tecnología | Dónde vive |
|---|---|---|
| Sitio web | HTML + CSS + JavaScript (sin compilación) | Este repositorio → GitHub Pages |
| Servidor | Google Apps Script (`google-apps-script/Codigo.gs`) | Cuenta de Google institucional |
| Base de datos | Hoja de cálculo «BD Control de Llegadas Tarde» | Google Drive de esa cuenta (privada) |
| Correo | Gmail de la cuenta institucional (copia en «Enviados») | Google |

👉 **Instalación paso a paso: [docs/GUIA_GOOGLE_DRIVE.md](docs/GUIA_GOOGLE_DRIVE.md)** (30 a 40 minutos, sin costo).

Resumen:
1. En <https://script.google.com>, cree un proyecto y pegue `google-apps-script/Codigo.gs`. Edite `AJUSTES` y ejecute **`instalar`**: se crea la hoja en su Drive y el primer administrador.
2. **Implementar → Aplicación web** (Ejecutar como: Yo · Acceso: Cualquier usuario) y copie la URL `/exec`.
3. Suba este repositorio a GitHub, cree la variable `GOOGLE_SCRIPT_URL` con esa URL y active *Pages → Source: GitHub Actions*.

> **Modo demostración:** si `js/config.js` no tiene servidor configurado, la plataforma funciona con datos de ejemplo guardados solo en el navegador. Las cuentas son `admin@demo.edu.co` / `admin123` y `docente@demo.edu.co` / `docente123`. Sirve para conocerla y capacitar; **no use datos reales en ese modo**.
>
> **Alternativa avanzada:** también puede usar PostgreSQL en Supabase con Brevo o Resend para el correo. Vea [docs/ALTERNATIVA_SUPABASE.md](docs/ALTERNATIVA_SUPABASE.md).

---

## 1. Funcionalidades

**1 · Registro.** Base de estudiantes con tipo y número de documento, apellidos, nombres, edad, grado, curso, acudiente, parentesco, correo, teléfono y dirección. Formulario para registrar, consultar, editar, retirar o reactivar y eliminar. **Carga masiva** desde Excel (.xlsx/.xls) o CSV, con vista previa, validación fila por fila, actualización de los registros existentes (por documento) y opción de crear los grados y cursos faltantes. Plantilla descargable y exportación del listado.
**Sin duplicados:** el documento es único y el nombre completo también dentro de cada curso (validado en el navegador y en el servidor).

**2 · Reportes.** Filtros por grado y curso (o búsqueda), botón **«Reportar llegada tarde»** por estudiante y **selección múltiple**. Se registran automáticamente estudiante, **fecha y hora (del servidor), grado, curso y período académico**, y el usuario que reporta. El contador acumulado se actualiza solo. **No se permite** más de un reporte por estudiante en la misma jornada. Los reportes del día se sincronizan entre los equipos de los docentes. El administrador puede anular reportes y registrar correcciones con otra fecha.

**3 · Seguimiento.** Lista automática de estudiantes con **más de 4** llegadas tarde (límite configurable), filtrable por período, grado y curso. El botón **«Notificar acudiente»** muestra la vista previa del correo institucional (estudiante, grado, curso, período, fechas y horas, cantidad de reportes y datos del acudiente) y lo **envía de verdad por Gmail**. Permite envío individual o masivo y evita envíos repetidos el mismo día. Lleva el **historial** con la fecha de envío y el **estado de entrega**: enviado → entregado → leído (cuando el acudiente pulsa «Confirmar recepción»), o rebotado / fallido. El **reporte individual** se ve en pantalla y se descarga en PDF y Excel.

**4 · Informes.** Dashboard con indicadores: total de reportes, estudiantes con reportes, porcentaje de la matrícula, reincidentes, promedio, día pico y notificaciones. Incluye **tendencia diaria, semanal o mensual**, distribución por grado y por curso, **comparativo por período**, día de la semana, franja horaria y ranking. Se filtra por período, grado, curso, estudiante y rango de fechas, y se **exporta a PDF y Excel** con tablas, gráficos y un análisis narrativo.

**Configuración (administrador).** Datos institucionales y firma, límite de seguimiento, **períodos académicos** (sin cruces de fechas), **grados y cursos**, **usuarios y roles** (cada usuario nuevo recibe sus datos de acceso por correo), auditoría y respaldo completo en Excel.

### Roles y protección de datos

| Permiso | Administrador | Docente |
|---|:-:|:-:|
| Reportar llegadas tarde (hora del servidor) | ✔ | ✔ |
| Consultar estudiantes (datos básicos) | ✔ | ✔ |
| Ver datos de contacto de acudientes | ✔ | — (el servidor no los entrega) |
| Crear, editar, importar, retirar y eliminar estudiantes | ✔ | — |
| Anular reportes / registrar con otra fecha | ✔ | — |
| Seguimiento, notificar acudientes, reporte individual | ✔ | ✔ (correo enmascarado) |
| Informes y exportaciones | ✔ | ✔ |
| Configuración, usuarios, auditoría, respaldo | ✔ | — |

Los permisos los aplica el **servidor**, no el navegador. Las contraseñas se guardan cifradas (hash), las sesiones vencen a las 12 horas y el acceso se bloquea tras 5 intentos fallidos. La hoja de cálculo es privada de la cuenta institucional, y las acciones sensibles quedan en **auditoría**. Correos y documentos llevan el aviso de la Ley 1581 de 2012.

---

## 2. Estructura del repositorio

```
├── index.html                    Aplicación (una sola página)
├── css/styles.css                Sistema visual institucional y diseño responsivo
├── js/
│   ├── config.js                 ← URL del servidor (GOOGLE_SCRIPT_URL)
│   ├── util.js                   Fechas (America/Bogota), validación, modales, íconos
│   ├── backend-google.js         Conexión con el servidor de Google Apps Script
│   ├── backend-supabase.js       Conexión alternativa con Supabase
│   ├── backend-demo.js           Modo demostración (navegador)
│   ├── estadisticas.js           Cálculos del seguimiento y del dashboard
│   ├── exportar.js               Generación de PDF y Excel
│   ├── plantilla-correo.js       Vista previa del correo (modo demostración)
│   ├── app.js                    Sesión, menú y navegación
│   └── vistas/                   registro, reportes, seguimiento, informes, configuracion
├── google-apps-script/
│   ├── Codigo.gs                 Servidor: base de datos en Drive, reglas, permisos y correo
│   └── appsscript.json           Manifiesto del proyecto de Apps Script
├── docs/
│   ├── GUIA_GOOGLE_DRIVE.md      Instalación paso a paso (recomendada)
│   └── ALTERNATIVA_SUPABASE.md   Instalación con Supabase + Brevo/Resend
├── supabase/                     Esquema SQL y funciones (solo para la alternativa)
├── vendor/                       Bibliotecas incluidas (Chart.js, SheetJS, ExcelJS, jsPDF, Supabase)
├── img/escudo.svg                Escudo por defecto (reemplácelo por el de su institución)
├── ejemplos/estudiantes_ejemplo.csv
└── .github/workflows/pages.yml   Publicación automática en GitHub Pages
```

---

## 3. Operación y mantenimiento

- **Nuevo año lectivo:** cree los períodos del año y actualice grados y cursos con una nueva carga masiva (el documento identifica al estudiante). Los informes permiten filtrar por período.
- **Retiros:** marque al estudiante como *retirado* para conservar su historial.
- **Respaldo:** *Configuración → Respaldo* descarga todo en Excel; Google Drive además conserva el historial de versiones de la hoja.
- **Escudo:** reemplace `img/escudo.svg` o indique la URL de una imagen en *Configuración → Institución*.
- **Cambios en el servidor:** después de editar `Codigo.gs`, publique una *nueva versión* de la misma implementación para conservar la URL (ver la guía).

## 4. Licencias de terceros
Chart.js (MIT), SheetJS Community Edition (Apache 2.0), ExcelJS (MIT), jsPDF y jsPDF-AutoTable (MIT), Supabase JS (MIT), fuente Public Sans (OFL).
