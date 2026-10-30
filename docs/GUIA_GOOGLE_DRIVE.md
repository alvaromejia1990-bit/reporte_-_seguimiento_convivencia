# Guía de instalación: datos en Google Drive y correos reales con Gmail

Esta guía deja la plataforma funcionando con:

- **Datos guardados en Google Drive**, en una hoja de cálculo de su cuenta («BD Control de Llegadas Tarde»).
- **Correos reales a los acudientes**, enviados desde su Gmail institucional (quedan en su carpeta *Enviados*).
- **Sitio web publicado gratis en GitHub Pages**, accesible desde computador, tableta o celular.

No necesita servidores, tarjetas de crédito ni conocimientos de programación. Tiempo estimado: **30 a 40 minutos**.

---

## Cómo funciona

```
 Docentes y directivos            Servidor (Google Apps Script)          Su cuenta de Google
 ┌────────────────────┐  HTTPS   ┌──────────────────────────────┐       ┌──────────────────────────┐
 │ Sitio web           │ ───────▶ │ Codigo.gs                     │ ────▶ │ Drive: hoja de cálculo   │
 │ (GitHub Pages)      │ ◀─────── │ · valida usuario y permisos   │       │ «BD Control de Llegadas  │
 │ Registro · Reportes │          │ · aplica las reglas           │       │  Tarde» (datos)          │
 │ Seguimiento·Informes│          │ · envía correos               │ ────▶ │ Gmail: envía y guarda en │
 └────────────────────┘          └──────────────────────────────┘       │ «Enviados»               │
                                                                         └──────────────────────────┘
```

El sitio web no guarda datos: todo pasa por el servidor de Apps Script, que **se ejecuta con su cuenta** y es el único que abre la hoja de cálculo. Por eso **no hay que compartir la hoja con nadie**. Los docentes entran con el usuario y la contraseña que usted les crea dentro de la plataforma.

---

## Antes de empezar

| Necesita | Recomendación |
|---|---|
| Una cuenta de Google que será la «dueña» de los datos y la remitente de los correos | Use una **cuenta institucional** (por ejemplo `convivencia@su-institucion.edu.co` en Google Workspace for Education). Si usa una cuenta personal de Gmail, todo funciona igual, con menos correos diarios. |
| Una cuenta de GitHub | Gratis en <https://github.com>. |
| El archivo `llegadas-tarde.zip` descomprimido | Contiene el sitio y la carpeta `google-apps-script/`. |

**Cupo diario de correos (fijado por Google):**

| Tipo de cuenta | Correos por día |
|---|---|
| Gmail personal (@gmail.com) | 100 |
| Google Workspace (cuentas institucionales) | 1.500 |

La plataforma muestra en cada envío cuántos correos quedan disponibles ese día.

---

## Paso 1 · Crear el servidor en Google Apps Script

1. Inicie sesión en Google con la cuenta elegida y abra <https://script.google.com>.
2. Pulse **Nuevo proyecto**. Arriba a la izquierda, cambie «Proyecto sin título» por **Servidor Llegadas Tarde**.
3. En el editor verá el archivo `Código.gs` con unas líneas de ejemplo. **Borre todo su contenido.**
4. Abra en su computador el archivo `google-apps-script/Codigo.gs` (con el Bloc de notas o cualquier editor), **copie todo** y péguelo en el editor de Apps Script.
5. En el menú izquierdo, entre a **⚙ Configuración del proyecto** y en **Zona horaria** elija **(GMT-05:00) Bogotá**.
6. *(Opcional)* En esa misma pantalla, active **Mostrar el archivo de manifiesto «appsscript.json» en el editor**, vuelva al editor, abra `appsscript.json` y reemplace su contenido por el del archivo `google-apps-script/appsscript.json`.

## Paso 2 · Escribir sus datos

Al comienzo del código está el bloque **AJUSTES**. Cambie los tres primeros valores, conservando las comillas:

```js
const AJUSTES = {
  ADMIN_CORREO: 'coordinacion@su-institucion.edu.co',  // ← correo real del primer administrador
  ADMIN_NOMBRE: 'Coordinación de Convivencia',          // ← su nombre o cargo
  NOMBRE_INSTITUCION: 'Institución Educativa ...',      // ← nombre de la institución
  ...
```

Guarde con **Ctrl + S** (o el ícono de disquete).

## Paso 3 · Instalar (crea la base de datos en Drive)

1. En la barra superior del editor, en la lista de funciones, elija **`instalar`** y pulse **▶ Ejecutar**.
2. Google pedirá autorización: **Revisar permisos** → elija su cuenta.
3. Como el script es suyo y no está publicado en una tienda, Google mostrará **«Google no verificó esta app»**. Pulse **Configuración avanzada** → **Ir a Servidor Llegadas Tarde (no seguro)** → **Permitir**.
   Los permisos que se solicitan son:
   - *Ver, editar y crear hojas de cálculo*: para guardar los datos.
   - *Leer, redactar y enviar correos de Gmail*: para enviar las notificaciones y detectar los correos rebotados.
   - *Ejecutar cuando usted no esté presente*: para revisar cada hora el estado de entrega.
4. Al terminar, el **Registro de ejecución** (parte inferior) muestra:
   - El enlace a la hoja de cálculo creada en su Drive.
   - **El correo del administrador y su contraseña temporal**, que también llega por correo a esa cuenta.
5. *(Opcional, recomendado)* Elija la función **`cargarCatalogoBase`** y ejecútela: crea los grados Sexto a Once (cursos 601, 602… 1102) y los cuatro períodos del año. Luego puede ajustarlos desde la plataforma.

> Puede volver a ejecutar `instalar` cuando quiera: no borra datos, solo completa lo que falte.

## Paso 4 · Publicar el servidor como aplicación web

1. Arriba a la derecha pulse **Implementar** → **Nueva implementación**.
2. Junto a «Seleccionar tipo», pulse el engranaje ⚙ y elija **Aplicación web**.
3. Complete:
   - **Descripción:** `Versión 1`
   - **Ejecutar como:** **Yo** (su correo)
   - **Quién tiene acceso:** **Cualquier usuario**
4. Pulse **Implementar** y copie la **URL de la aplicación web**. Tiene esta forma:
   `https://script.google.com/macros/s/AKfycb…/exec`

> **¿Por qué «Cualquier usuario»?** Porque el sitio web debe poder comunicarse con el servidor. Eso **no** expone los datos: cada solicitud exige un usuario y una contraseña de la plataforma, y los datos solo se entregan según el rol (administrador o docente).
>
> Si en una cuenta institucional no aparece la opción «Cualquier usuario», el administrador de Google Workspace de la institución la tiene restringida. Pídale que la habilite para Apps Script o haga la instalación con otra cuenta.

Para comprobar que funciona, abra esa URL en el navegador: debe decir *«Servidor de Control de Llegadas Tarde activo»*.

## Paso 5 · Subir el sitio a GitHub y conectarlo

1. En GitHub pulse **New repository**, póngale un nombre (por ejemplo `llegadas-tarde`) y créelo.
   Puede ser **público**: el repositorio no contiene datos personales (esos viven en su Drive).
2. En el repositorio vacío, pulse **uploading an existing file**, arrastre **todo el contenido** de la carpeta `llegadas-tarde` (no la carpeta, sino lo que hay dentro, incluidas `.github` y `.nojekyll`) y pulse **Commit changes**.
   > Si el explorador de archivos no muestra `.github` o `.nojekyll`, active «Mostrar archivos ocultos», o súbalos con GitHub Desktop.
3. Conecte el servidor (elija **una** opción):
   - **A · Variable del repositorio (recomendada):** *Settings → Secrets and variables → Actions → pestaña Variables → New repository variable*. Nombre: `GOOGLE_SCRIPT_URL`; valor: la URL `/exec` del Paso 4.
   - **B · Editar el archivo:** abra `js/config.js` en GitHub, pulse el lápiz ✏️, pegue la URL entre las comillas de `GOOGLE_SCRIPT_URL: ""` y pulse **Commit changes**.
4. Active la publicación: *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
5. Vaya a la pestaña **Actions**: en uno o dos minutos el flujo «Publicar en GitHub Pages» queda en verde y muestra la dirección del sitio:
   `https://SU-USUARIO.github.io/llegadas-tarde/`
   (Si el flujo se ejecutó antes de crear la variable, pulse *Run workflow* para publicar de nuevo.)

## Paso 6 · Primer ingreso y configuración

1. Abra la dirección del sitio. Ya **no** debe aparecer el aviso «Modo demostración».
2. Ingrese con el **correo del administrador** y la **contraseña temporal** del Paso 3. La plataforma le pedirá definir una contraseña propia.
3. **Configuración (⚙) → Institución:** nombre, ciudad, teléfono, **correo institucional** (las respuestas de los acudientes llegarán ahí), nombre y cargo de quien firma, y el límite de seguimiento (por defecto 4: se notifica desde la 5.ª llegada tarde).
4. **Configuración → Períodos académicos** y **Grados y cursos:** revise fechas y cursos.
5. **Registro → Carga masiva:** descargue la plantilla, complétela (o exporte desde el SIMAT) y cárguela. Puede volver a cargar el archivo cuando haya cambios: los estudiantes se identifican por documento y se actualizan, sin duplicarse.
6. **Configuración → Usuarios y roles → Nuevo usuario:** cree las cuentas de docentes y coordinadores. **Cada persona recibe un correo** con el enlace a la plataforma y su contraseña temporal, y debe cambiarla al ingresar.

## Paso 7 · Prueba de envío real (recomendada)

1. Registre un estudiante de prueba y escriba **su propio correo** como correo del acudiente.
2. En **Reportes**, active **Registrar con otra fecha** y repórtelo en 5 fechas distintas del período.
3. En **Seguimiento** aparecerá el estudiante. Pulse **Notificar acudiente**, revise la vista previa y pulse **Enviar correo**.
4. Revise su bandeja de entrada (y la de spam la primera vez). En Gmail, el mensaje también queda en **Enviados** de la cuenta institucional.
5. Pulse **Confirmar recepción** en el correo: en **Seguimiento → Historial**, el estado cambia a **Leído**.
6. Elimine el estudiante de prueba desde **Registro**.

---

## Estados de entrega de las notificaciones

| Estado | Qué significa |
|---|---|
| **Enviado** | Gmail aceptó y envió el correo. |
| **Entregado** | Pasaron 6 horas sin que el servidor de destino devolviera el correo. |
| **Leído** | El acudiente pulsó «Confirmar recepción» en el correo. |
| **Rebotado** | El correo fue devuelto (dirección inexistente, buzón lleno…). Se muestra el motivo: corrija el correo del acudiente y notifique de nuevo. |
| **Fallido** | Gmail no pudo enviarlo (por ejemplo, se agotó el cupo diario). |

La revisión de rebotes se hace sola cada hora, con el activador que creó `instalar`. Puede verlo en Apps Script → **Activadores** (ícono de reloj).

---

## Dónde quedan los datos y cómo cuidarlos

- En **Google Drive → Mi unidad** está la hoja **«BD Control de Llegadas Tarde»**, con una pestaña por tabla: Estudiantes, Llegadas tarde, Notificaciones, Usuarios, Períodos, Grados, Cursos, Configuración y Auditoría.
- Puede abrirla para **consultar, filtrar o descargar**, y moverla a otra carpeta de Drive sin afectar el funcionamiento.
- **No cambie los nombres de las pestañas ni la primera fila (encabezados)**, ni comparta el archivo: contiene datos personales protegidos por la Ley 1581 de 2012. Haga los cambios desde la plataforma, que valida los datos y deja registro en la auditoría.
- **Respaldo:** Drive guarda el historial de cambios (*Archivo → Historial de versiones*). Además, en la plataforma, *Configuración → Respaldo* descarga todo en Excel. Se recomienda hacerlo al cierre de cada período.
- Las contraseñas no se guardan en texto: la pestaña Usuarios solo contiene una huella cifrada (hash) de cada una.

---

## Mantenimiento

**Si modifica `Codigo.gs`** (por ejemplo, para cambiar un texto del correo), debe publicar una versión nueva **conservando la misma URL**:
*Implementar → Gestionar implementaciones → ✏️ Editar → Versión: «Nueva versión» → Implementar.*
(Si crea una «Nueva implementación», la URL cambia y tendría que actualizarla en GitHub.)

**Funciones útiles** (se ejecutan desde el editor de Apps Script):

| Función | Para qué sirve |
|---|---|
| `instalar` | Completa hojas o permisos faltantes y recrea el activador horario. No borra datos. |
| `cargarCatalogoBase` | Crea grados 6.º a 11.º, sus cursos y los períodos del año en curso, si no existen. |
| `restablecerAdministrador` | Genera una contraseña temporal nueva para el correo de `AJUSTES.ADMIN_CORREO`, por si el administrador olvida la suya y no recibe el correo de recuperación. |
| `verCupoCorreo` | Muestra cuántos correos quedan disponibles hoy. |
| `revisarEntregas` | Revisa en el momento los rebotes (normalmente se hace sola cada hora). |

**Nuevo año lectivo:** cree los períodos del nuevo año y cargue de nuevo el listado de estudiantes con sus cursos actualizados. El historial de años anteriores se conserva y los informes permiten filtrar por período.

---

## Capacidad y rendimiento

- Cada acción tarda normalmente **entre 1 y 3 segundos** (es el tiempo de respuesta de Google).
- La plataforma se mantiene ágil hasta unos **3.000 estudiantes** y **decenas de miles de reportes** por año. Una hoja de Google admite hasta 10 millones de celdas.
- Varios docentes pueden reportar al mismo tiempo: el servidor ordena las escrituras para que no se pierdan datos. Las pantallas abiertas se actualizan solas cada 20 segundos.

---

## Seguridad y protección de datos

- **Inicio de sesión propio**, con contraseñas cifradas, sesiones firmadas que vencen a las 12 horas y bloqueo de 15 minutos tras 5 intentos fallidos.
- **Roles en el servidor:** los docentes reportan, consultan y notifican, pero **no reciben** el correo, el teléfono ni la dirección de los acudientes (ven el correo enmascarado, como `lu•••@correo.com`), ni pueden modificar estudiantes, anular reportes o cambiar la configuración. Los docentes no pueden registrar reportes con otra fecha: la hora la pone el servidor.
- Cambiar o restablecer una contraseña, desactivar un usuario o cambiar su rol **cierra sus sesiones abiertas**.
- La hoja de cálculo es **privada** de la cuenta institucional; el enlace de «Confirmar recepción» de cada correo va firmado y no se puede falsificar.
- **Auditoría:** importaciones, ediciones, eliminaciones, envíos y cambios de usuarios quedan registrados con fecha y responsable.

---

## Solución de problemas

| Síntoma | Qué hacer |
|---|---|
| El sitio sigue diciendo «Modo demostración» | La URL no llegó a `js/config.js`. Revise el Paso 5.3 y que el flujo de *Actions* haya terminado en verde después de crear la variable. |
| «El servidor de Google no respondió correctamente» | En la implementación, «Quién tiene acceso» debe ser **Cualquier usuario**, y la URL debe terminar en `/exec`. |
| «El servidor no está instalado» | Ejecute la función `instalar` (Paso 3). |
| No llega la contraseña temporal | Revise spam. También aparece en el *Registro de ejecución* de `instalar`. Si hace falta, ejecute `restablecerAdministrador`. |
| «Se agotó el cupo diario de correos» | Se alcanzó el límite de Google (100 o 1.500 por día). Los envíos pendientes pueden hacerse al día siguiente. |
| «No hay un período académico configurado» | La fecha de hoy no está dentro de ningún período: créelo o ajuste sus fechas en Configuración. |
| Cambié `Codigo.gs` y no se nota | Publique una **nueva versión** de la misma implementación (ver Mantenimiento). |
| Los correos llegan a spam | Pida a los acudientes agregar el correo institucional a sus contactos. En Google Workspace, el administrador puede verificar que el dominio tenga SPF y DKIM activos. |
