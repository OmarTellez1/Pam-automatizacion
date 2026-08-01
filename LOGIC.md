# Lógica y contexto de la automatización

## Propósito

Este proyecto automatiza un flujo interno de BeyondInsight Password Safe alojado en `https://10.30.17.117`:

1. Iniciar sesión con usuario, contraseña y TOTP.
2. Abrir `Accounts > Browse By Category > Favorites` y detectar dinámicamente todas las cuentas visibles.
3. Preguntar la fecha `dd/mm`, la hora `HH:mm` y si se desea enviar el correo; validar las respuestas y crear una solicitud de acceso para cada cuenta.
4. Consultar exclusivamente `Requests > Pending`.
5. Extraer y guardar un `Request ID` pendiente por cada cuenta encontrada en `Favorites`.

El flujo dispone de una interfaz web local para configurar credenciales, solicitud, correo, resultado final e iniciar la ejecución. `BOTON_PRUEBA=TRUE` habilita un botón adicional que recorre y descarta todos los formularios sin enviar solicitudes. `INICIAR_AUTOMATIZACION.cmd` y el botón real incluyen `-Execute`, por lo que sí crean solicitudes. El resultado final se obtiene del toggle persistente: correo mediante Outlook clásico o un diálogo web con los IDs.

Este documento no contiene credenciales, contraseñas, semillas TOTP ni códigos temporales. Un nuevo hilo de Codex debe preservar esa regla.

## Estado actual

- El inicio de sesión desatendido funciona.
- El TOTP se genera localmente a partir de la semilla Base32 guardada en `.env`.
- El TOTP usa RFC 6238 con HMAC-SHA1, seis dígitos, periodo de 30 segundos y `T0 = 0`. Los espacios, guiones y padding de la representación Base32 se normalizan. La pertenencia de una semilla al enrolamiento vigente solo puede confirmarse mediante la prueba real de login.
- El formulario de solicitud y la extracción de IDs usan como cantidad esperada el número actual de cuentas en `Favorites`; no existe un límite fijo de 14.
- El flujo fue validado de forma visible con Playwright/Chrome.
- La prueba real del 1 de agosto de 2026 creó 14 solicitudes pendientes con IDs del `140131` al `140144`.
- Una segunda ejecución reconoció las 14 solicitudes pendientes y no generó duplicados.
- Solo se consulta el estado `Pending`; `Approved` no se abre ni se utiliza.
- La interfaz de terminal solicita día/mes y hora de 24 horas; el resultado final se configura antes desde la portada web.
- Una validación visible confirmó que `01/08` y `14:00` llegan al formulario como 1 de agosto del año vigente y `02:00 PM`, y que el modo de simulación descarta el formulario sin enviarlo.
- Una regresión observada con `12/08` hacía que el selector conservara el día actual. Se corrigió vinculando el clic al calendario Flatpickr de `Start Date`, abriéndolo antes de cambiar de mes y verificando inmediatamente el valor seleccionado. Una prueba visible confirmó `12/08/2026` y `03:00 PM` sin enviar la solicitud.
- Las pruebas unitarias actuales cubren validación y conversión de fechas y horas, normalización de aplicaciones y generación TOTP.
- Después de obtener un ID único por cuenta favorita, el flujo genera el HTML definitivo usando exclusivamente el contenido guardado en la interfaz.
- Los ID `140131` a `140144` pertenecen únicamente a la ejecución de prueba del 1 de agosto de 2026. No están incorporados como constantes del correo.
- Outlook clásico se controla mediante COM. Cada instalación selecciona la cuenta iniciada cuyo `SmtpAddress` coincide con `PAM_MAIL_SENDER`.
- La primera prueba COM creó y mostró un borrador guardado con los 14 ID; la verificación posterior confirmó `Sent = False` y cero ID ausentes.
- Después de la confirmación explícita del usuario, ese mismo borrador se envió mediante COM el 31 de julio de 2026. La verificación encontró el mensaje en `Elementos enviados` con `Sent = True`, un destinatario y los 14 ID completos. `last-email.json` impide repetir accidentalmente el mismo conjunto.
- El lanzador final `INICIAR_AUTOMATIZACION.cmd` está implementado y ejecuta el navegador de forma desatendida con `-Execute`.
- `.env.mail` persiste remitente, destinatarios, copias, asunto y HTML enriquecido. Las listas usan `;` como separador y las imágenes pegadas se incorporan al mensaje como adjuntos inline CID.
- Al iniciar la interfaz, `.env` y `.env.mail` se crean automáticamente si faltan. La creación usa exclusividad de archivo y nunca sobrescribe una configuración existente.
- La interfaz web local guarda únicamente `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET` en `.env`; prueba inmediatamente el inicio de sesión PAM sin crear solicitudes. El remitente de Outlook pertenece a `.env.mail`.
- La interfaz solo escucha en `127.0.0.1`, valida Host y Origin, bloquea scripts y conexiones externas mediante CSP, permite estilos inline necesarios para el editor enriquecido, no precarga secretos y bloquea comprobaciones simultáneas.
- La portada conserva el encabezado y muestra controles centrados para credenciales, solicitud, envío de correo, resultado final y ejecución. `Iniciar prueba` solo aparece con `BOTON_PRUEBA=TRUE`; `Iniciar automatización` siempre corresponde al modo real y exige confirmación. Durante cualquier ejecución todos esos controles se bloquean; se restauran al recibir un estado `completed` o `failed`. Si la acción final envió correo, el estado completado abre un diálogo de confirmación una sola vez.
- En modo edición, cada campo vacío conserva el valor ya guardado. La prueba de login clasifica los fallos según ocurran antes del desafío TOTP, durante el desafío o después de la confirmación.
- La configuración de solicitud muestra hora `hh:mm` con un selector `AM/PM`, la convierte de forma validada y persiste `PAM_START_TIME` como `HH:mm` de 24 horas para el portal. Sus valores no secretos regresan al formulario para poder editarlos.
- El remitente, `Para`, `CC` y el editor de correo comienzan vacíos. Después del primer guardado vuelven a cargar únicamente los valores configurados por el usuario; el HTML conserva formato seguro y sustituye los IDs y la razón con los datos de la ejecución actual.
- La configuración de correo avisa que el envío requiere Outlook clásico instalado y una sesión iniciada; el nuevo Outlook no es compatible con COM.
- La suite actual contiene 58 pruebas aprobadas.

## Parámetros de negocio

Los valores se encuentran en `src/request-config.mjs`:

| Campo | Valor |
| --- | --- |
| Cantidad esperada | Número dinámico de filas de `Accounts > Browse By Category > Favorites` |
| Start Date | `PAM_START_DATE`, entrada persistente `dd/mm`; el año vigente de Ecuador se añade automáticamente |
| Start Time | La web recibe `hh:mm` + `AM/PM`; `PAM_START_TIME` persiste `HH:mm` en formato de 24 horas para BeyondInsight |
| Acción final | `PAM_FINAL_ACTION=email`: enviar por Outlook clásico; `web`: mostrar los IDs en la interfaz local |
| Days | Siempre `0` |
| Hours | `PAM_SESSION_HOURS`; entero permitido de 1 a 8 horas |
| Minutes | `0` |
| Tipo de acceso | `Application Session`, ya seleccionado por el portal |
| Reason | `PAM_REQUEST_REASON`; conserva el texto anterior como valor inicial del formulario |
| Estado consultado | Únicamente `Pending` |

La zona horaria del contexto del navegador y del cálculo de la fecha es `America/Guayaquil`.

## Arquitectura de archivos

### Entradas principales

- `src/session.mjs`: crea el navegador, aplica las restricciones de red e inicia sesión.
- `src/env-config.mjs`: interpreta, valida y guarda las credenciales de `.env` sin dependencias adicionales.
- `src/email-address.mjs`: valida el remitente y los destinatarios del correo.
- `src/configuration-bootstrap.mjs`: define los valores iniciales y coordina la creación no destructiva de `.env` y `.env.mail`.
- `src/request-settings.mjs`: valida y persiste fecha, hora, duración y razón; limita la sesión a 1–8 horas.
- `src/final-action.mjs`: valida y persiste la acción final segura en `.env`.
- `src/automation-result.mjs`: valida el último resultado y expone todos los IDs cuando la acción final fue web.
- `src/mail-settings.mjs`: valida listas de destinatarios, sanitiza HTML y persiste la configuración en `.env.mail`.
- `src/local-server.mjs`: sirve la interfaz en loopback, expone solo el estado de configuración y coordina el guardado con la prueba de login.
- `web/`: HTML, CSS y JavaScript de la interfaz local; no contiene reglas de autenticación ni secretos.
- `src/login.mjs`: ejecutable sencillo para comprobar solamente el inicio de sesión.
- `src/request-access.mjs`: abre `Favorites`, orquesta una solicitud por cada fila, evita duplicados pendientes y extrae los IDs.
- `src/request-config.mjs`: constantes y funciones puras de fechas, normalización y claves de solicitud.
- `src/totp.mjs`: decodifica Base32 y genera códigos TOTP RFC 6238 con HMAC-SHA1.
- `src/email-content.mjs`: valida que exista un ID único y `Pending` por cada favorito, actualiza el HTML configurado y materializa imágenes inline.
- `src/prepare-access-email.mjs`: combina `last-run.json` con toda la configuración de `.env.mail`, genera el HTML definitivo y prepara el manifiesto para Outlook clásico.

### Scripts de PowerShell

- `scripts/setup-secrets.ps1`: compatibilidad con el nombre anterior; ahora inicia la interfaz local de credenciales.
- `scripts/run-local-interface.ps1`: resuelve Node.js 20 o posterior e inicia el servidor local.
- `scripts/runtime.ps1`: localiza un `node.exe` compatible (versión 20 o posterior). Prioriza `BI_NODE_EXE`, luego el runtime incluido con Codex y finalmente las instalaciones encontradas en `PATH`.
- `scripts/run-login.ps1`: descifra temporalmente los secretos para el proceso y ejecuta `src/login.mjs`.
- `scripts/run-access-requests.ps1`: ejecuta `src/request-access.mjs`; acepta fecha, hora, modo visible y autorización para crear solicitudes. Tras una ejecución real, envía por Outlook clásico o abre los IDs según `PAM_FINAL_ACTION`. `-Email S|N` permanece como sobrescritura técnica opcional.
- `scripts/run-outlook-classic.ps1`: crea un mensaje nuevo mediante COM; por defecto lo guarda como borrador, `-Display` lo muestra y `-Send` lo envía. Nunca reutiliza un borrador anterior. Antes de enviar valida el hash del HTML, la sustitución del marcador, la presencia de todos los IDs y la lista fija completa cuando `testMode` es verdadero.

### Lanzador de prueba

- `INICIAR_PRUEBA.cmd`: ejecuta `run-access-requests.ps1 -TestRun -Headed`, recorre todas las cuentas de `Favorites`, arma y descarta cada formulario sin presionar `Submit Request`, y después aplica el resultado final con IDs simulados.

### Lanzador de interfaz

- `INICIAR_INTERFAZ.cmd`: crea los archivos de configuración que falten, inicia el servidor en `http://127.0.0.1:4317` y abre automáticamente el navegador predeterminado. Las rutas `/credenciales`, `/solicitud` y `/correo` gestionan sus respectivas configuraciones; `/api/automation/start` inicia un solo proceso de prueba o real y `/api/automation/status` expone su estado sin incluir secretos.

### Lanzador final

- `INICIAR_AUTOMATIZACION.cmd`: lanzador de producción. Ejecuta `run-access-requests.ps1 -Execute` sin `-Headed`, crea o recupera una solicitud `Pending` por cada cuenta actual de `Favorites` y aplica el toggle persistente. `email` invoca Outlook clásico con `-Send`; `web` deja los IDs disponibles para el diálogo de la portada. No debe ejecutarse como prueba.

La resolución explícita del runtime es necesaria porque este equipo también tiene Node.js 14.21.3 en `C:\Program Files\nodejs`. Una terminal abierta fuera de Codex puede encontrar esa versión primero. Los scripts no deben invocar `node` directamente: deben usar `Resolve-ProjectNode` para seleccionar Node 20 o posterior y evitar incompatibilidades de sintaxis o de Playwright.

### Estado y resultados

- `.env`: contiene las tres credenciales `BI_*` y los parámetros no secretos `PAM_START_DATE`, `PAM_START_TIME`, `PAM_SESSION_HOURS`, `PAM_REQUEST_REASON` y `PAM_FINAL_ACTION`. Es local y está excluido de Git.
- `.env.mail`: contiene `PAM_MAIL_SENDER`, destinatarios, copias, asunto y HTML enriquecido; al crearse, remitente, `PAM_MAIL_TO`, `PAM_MAIL_CC` y `PAM_MAIL_CONTENT_HTML` quedan vacíos hasta el primer guardado del usuario. Es local y está excluido de Git.
- `.env.example`: documenta el formato con valores ficticios y sí puede versionarse.
- `run-results/last-run.json`: resultado estructurado de la última ejecución real. Guarda `favoriteCount`, las solicitudes `pending` y sus `requestIds`; `/api/automation-result` solo los devuelve cuando las tres cantidades coinciden y los IDs son únicos.
- `run-results/CORREO_ACCESOS_PAM.html`: cuerpo HTML definitivo usado por Outlook clásico.
- `run-results/last-email.json`: auditoría local del último correo y protección contra duplicados.
- `run-results/email-manifest.json`: manifiesto validado que comparte la configuración y los ID con Outlook clásico.
- `run-results/last-draft.json`: identificador y datos del último borrador creado mediante COM.
- `run-artifacts/`: capturas e informes de fallos.
- `logs/`: salida persistente de cada ejecución. Los inicios desde localhost generan `automation-<modo>-<fecha>.log` con stdout y stderr completos; los lanzadores PowerShell generan también su registro de sesión. La carpeta está excluida de Git.
- `test/`: pruebas unitarias ejecutadas por Node.

`.env`, `.env.mail`, `state`, `run-results`, `run-artifacts`, `logs` y `.playwright-cli` están excluidos mediante `.gitignore`. `state` se mantiene ignorado para no exponer posibles datos locales creados por versiones anteriores, aunque el flujo actual ya no lo utiliza.

`startLocalInterface()` ejecuta primero `initializeLocalConfigurationFiles()`. La creación usa `writeFile(..., { flag: "wx" })`: solo tiene éxito cuando el archivo no existe. `EEXIST` se interpreta como configuración ya presente y el contenido se deja intacto. Cada archivo se evalúa por separado, por lo que puede crearse únicamente el que falte. No existen plantillas predeterminadas: los destinatarios y el contenido solo se muestran después de haber sido guardados en `.env.mail`.

## Flujo de autenticación

`openAuthenticatedSession()` en `src/session.mjs` realiza estos pasos:

1. Lee `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET` desde `.env`. Las variables ya presentes en el proceso pueden sobrescribir estos valores para usos controlados.
2. Valida que los tres valores existan y que la clave TOTP sea Base32; un código temporal de seis dígitos se rechaza.
3. Inicia Google Chrome mediante `playwright-core`.
4. Configura locale `es-EC`, zona horaria de Ecuador y la excepción HTTPS requerida por el certificado privado.
5. Bloquea cualquier solicitud de red cuyo origen sea diferente de `https://10.30.17.117`. Solo se permiten además recursos internos `about:`, `data:` y `blob:`.
6. Abre la página de login y llena `Username`, `Password` y, cuando está configurado, `Log in to`.
7. Espera el desafío de autenticación, evita usar un TOTP al final de su ventana de 30 segundos, genera un código vigente y lo envía.
8. Comprueba que se abandonó la ruta de login y que aparece `Return to dashboard`.

No se persisten cookies ni perfiles de navegador. Cada ejecución crea una sesión nueva.

## Flujo de solicitudes

`src/request-access.mjs` sigue este orden:

1. Interpreta los argumentos y carga la configuración persistente de solicitud y resultado final. `--execute` selecciona producción; `--test-run` selecciona la prueba completa; ambos son mutuamente excluyentes. Sin ninguno se conserva la vista previa técnica de un solo formulario. Antes de una ejecución real o de prueba con correo, valida toda la configuración de `.env.mail`.
2. Elimina espacios al inicio y al final de cada respuesta. Una respuesta vacía o inválida genera un mensaje y repite la misma pregunta indefinidamente.
3. Valida que la fecha use exactamente `dd/mm` y le añade el año actual calculado en `America/Guayaquil`.
4. Valida que la hora use `HH:mm` de 24 horas y muestra su equivalencia de 12 horas. Por ejemplo, `14:00` se confirma como `02:00 PM`.
5. Convierte `PAM_FINAL_ACTION` a `sendEmail`; ante ausencia usa `web` como valor seguro. El valor histórico `notepad` se migra a `web` al cargarlo.
6. Permite cancelar voluntariamente con `Ctrl+C`, cierra el navegador si ya existe y devuelve el código de salida `130`.
7. Inicia una sesión autenticada.
8. Abre `Accounts`, localiza el encabezado real `Browse by Category`, selecciona `Favorites`, espera la primera fila y cuenta dinámicamente los `tr[aria-label^="Row "]`. El texto decorativo `N items` no se usa porque la grilla no lo expone como texto localizable.
9. Lee las filas y construye para cada cuenta una identidad formada por sistema, cuenta y familia de aplicación.
10. Abre `Requests`, selecciona exclusivamente `Pending` y lee las solicitudes actuales.
11. Filtra las pendientes por fecha/hora exactas y por el motivo configurado.
12. Construye un mapa de solicitudes pendientes equivalentes para evitar recrearlas.
13. Regresa a `Accounts > Browse By Category > Favorites`, comprueba que el número no haya cambiado y procesa todas las filas en su orden visible.
14. Antes de abrir cada fila, vuelve a comprobar su identidad para evitar actuar sobre una tabla que cambió.
15. Para las solicitudes no existentes, pulsa `Access`, abre la pestaña `Submit Request`, completa fecha, hora visible `hh:mm AM/PM`, días, horas y razón desde la configuración efectiva, y valida todos los valores antes de enviar.
16. Al terminar, vuelve a `Requests > Pending`, limita los resultados a las identidades de `Favorites` y exige un ID único por cada cuenta.
17. Guarda `favoriteCount`, el resultado y la decisión de correo en `run-results/last-run.json`, y escribe una línea `REQUEST_IDS=id1,id2,...` en la consola.
18. Si la acción final es `email`, vuelve a validar que `requestIds` coincida con `favoriteCount` solicitudes cuyo estado sea exactamente `Pending`.
19. `prepare-access-email.mjs` lee remitente, destinatarios, copias, asunto y HTML desde `.env.mail`; reemplaza IDs y razón, convierte imágenes `data:` a adjuntos CID y crea `email-manifest.json`. Outlook clásico exige una sola cuenta iniciada que coincida con el remitente, evita duplicados y llama a `MailItem.Send()`.
20. Si la acción final es `web`, PowerShell no abre aplicaciones ni crea un archivo adicional. La portada consulta `/api/automation-result`, muestra la cantidad dinámica y todos los IDs en un diálogo y permite copiarlos.

## Prueba, vista previa y ejecución real

Sin `-Execute` ni `-TestRun`, el script llena únicamente el primer formulario, comprueba sus valores, pulsa `Cancel` y confirma `Discard Changes`. No publica resultados:

```powershell
.\scripts\run-access-requests.ps1 -Headed
```

Con `-TestRun`, repite ese llenado y descarte para todas las cuentas de `Favorites`. Guarda `testMode: true`, `submitted: 0`, el número de formularios validados y la lista fija de IDs simulados. El correo o diálogo web se ejecutan según `PAM_FINAL_ACTION`:

```powershell
.\scripts\run-access-requests.ps1 -TestRun -Headed
```

Con `-Execute`, puede crear solicitudes reales:

```powershell
.\scripts\run-access-requests.ps1 -Execute -Headed
```

El equivalente recomendado para el usuario final es hacer doble clic en `INICIAR_AUTOMATIZACION.cmd`. El lanzador omite `-Headed` para ejecutar el navegador sin mostrarlo y reducir el tiempo total.

Para evitar las preguntas y pasar los valores directamente:

```powershell
.\scripts\run-access-requests.ps1 -Date '01/08' -StartTime '14:00' -Headed
```

La bandera `-Headed` muestra Chrome y debe usarse para validar cambios en el portal. Sin ella, Chrome se ejecuta de forma desatendida. `-Execute` continúa siendo la única bandera que autoriza presionar `Submit Request`; `-TestRun` puede enviar un correo de prueba, pero nunca crea solicitudes PAM.

Las preguntas interactivas terminan en dos puntos y un espacio para que la entrada quede visualmente separada:

```text
¿En qué fecha desea solicitar los permisos? Formato dd/mm: 
¿A qué hora desea solicitar los permisos? Formato HH:mm de 24 horas: 
```

### Reglas de conversión de entrada

- `01/08` en cualquier fecha de 2026 se convierte en `2026-08-01` internamente y se confirma como `01/08/2026`.
- Cuando el año vigente en Ecuador sea 2027, `01/08` se convertirá automáticamente en `2027-08-01`.
- No se acepta un año escrito por el usuario ni formatos abreviados como `1/8`.
- Se valida que el día exista en el mes y año calculados, incluyendo años bisiestos.
- Las respuestas compuestas únicamente por espacios se consideran vacías. Los espacios exteriores de valores válidos se eliminan antes de validarlos.
- La interfaz permanece en la pregunta actual hasta recibir una respuesta válida; `Ctrl+C` es la salida voluntaria prevista.
- El toggle acepta únicamente `email` o `web`; el endpoint rechaza cualquier otro valor.
- `14:00` se conserva y se asigna como `14:00` al `input[type="time"]` de BeyondInsight. Chrome representa ese mismo valor visualmente como `02:00 PM`; intentar llenar el DOM con el texto `02:00 PM` produce `Malformed value`.
- `00:00` equivale a `12:00 AM`, `01:00` a `01:00 AM` y `12:00` a `12:00 PM`.
- Los valores también pueden pasarse sin interacción como `--date dd/mm --time HH:mm --email S|N` desde Node o con `-Date`, `-StartTime` y `-Email` desde PowerShell.

## Detección de duplicados

La clave estable de una solicitud es:

```text
sistema | cuenta | familia de aplicación
```

La familia normaliza diferencias de nombres entre las tablas `Accounts` y `Requests`, por ejemplo:

- `WinSCP - nodo1` y `WinSCP 5.21 - PGDCPAMSER01` se consideran `winscp`.
- Variantes de PuTTY se consideran `putty`.
- Variantes de PLSQL se consideran `plsql`.
- Variantes de NOSQLBOOSTER se consideran `nosqlbooster`.

Además de la clave, las solicitudes pendientes se filtran por:

- fecha y hora mostradas por BeyondInsight, con formato similar a `Aug 01, 2026, 2:00 PM`;
- motivo exacto configurado.

Por decisión explícita del usuario, la detección revisa solo `Pending`. Esto implica una limitación importante: si una solicitud deja de estar pendiente y pasa a `Approved`, una nueva ejecución para la misma fecha ya no la verá. No se debe repetir `-Execute` para esa misma fecha una vez que las solicitudes hayan dejado `Pending`, salvo que crear nuevas solicitudes sea intencional.

## Detalles relevantes de la interfaz

- Accounts: `/webconsole/ps/portal?tab=accounts`.
- Requests: `/webconsole/ps/portal?tab=requests`.
- Las filas de las tablas usan `tr[aria-label^="Row "]` y celdas con `data-column-id`.
- Columnas importantes de Accounts: `AccountName`, `SystemName`, `ApplicationName`.
- Columnas importantes de Requests: `RequestId`, `SystemName`, `AccountName`, `ReleaseDt`, `Description`, `Application`.
- La acción de cada cuenta se identifica por el texto exacto `Access`.
- El formulario se abre en la pestaña con rol `tab` y nombre exacto `Submit Request`.
- El botón final se identifica por rol `button` y nombre exacto `Submit Request`.
- El selector de fecha usa Flatpickr. El código abre específicamente la instancia asociada a `Start Date`, la identifica temporalmente, la posiciona con `jumpToDate()` y hace clic en el día dentro de esa misma instancia. Después verifica de inmediato el valor visible. Abrir el calendario antes de cambiar de mes evita que `open()` restaure el mes actual y que otro calendario coincidente reciba el clic.
- Después de seleccionar una fecha futura, el portal reajusta de forma asíncrona la hora. Por eso el código espera y vuelve a llenar la hora solicitada si fuera necesario.

Los selectores están basados en roles, etiquetas y atributos de la interfaz. Si BeyondInsight cambia, se debe repetir una validación visible antes de ejecutar solicitudes reales.

## Gestión y rotación de credenciales

Para cambiar el usuario, la contraseña o la semilla alfanumérica TOTP, abra `INICIAR_INTERFAZ.cmd`, seleccione `Configurar credenciales del PAM` y guarde los tres datos. La semilla TOTP es la clave Base32 de enrolamiento, no un código temporal de seis dígitos.

El servidor conserva cualquier otra variable ya existente en `.env`, actualiza las credenciales proporcionadas y mantiene las anteriores para los campos vacíos. Después prueba el login en una sesión de navegador aislada. Si la prueba falla, los datos permanecen guardados para que el estado sea explícito, pero la interfaz informa que no fueron verificados. Un fallo antes de mostrar `Enter Response` se presenta como problema de usuario o contraseña; un fallo posterior se presenta como problema de la clave o código del Authenticator; los fallos anteriores al formulario se presentan como conexión o portal.

El servidor escucha exclusivamente en IPv4 loopback, rechaza Host u Origin externos y limita el tamaño de las solicitudes. Nunca expone las credenciales; el endpoint de solicitud devuelve únicamente fecha, hora, duración y razón para permitir su edición. Como `.env` es texto legible, la seguridad depende de los permisos de acceso a la carpeta del proyecto.

## Controles y límites de seguridad

- Nunca incluir secretos en el código, documentación, argumentos de línea de comandos, logs o mensajes de Codex.
- La capa web envía los datos únicamente al servidor local y limpia del formulario la contraseña y la semilla después de una comprobación correcta.
- Ningún endpoint permite leer el contenido completo de `.env` ni las credenciales. Solo los parámetros no secretos de solicitud se devuelven de forma explícita para edición.
- La excepción de certificado se limita al contexto aislado del navegador y el tráfico externo se bloquea.
- Los códigos TOTP nunca se imprimen.
- Los artefactos de error pueden contener una captura del portal; deben tratarse como información interna.
- Guardar contraseña y semilla TOTP en el mismo equipo reduce la separación real de factores. Para producción es preferible una cuenta de automatización de mínimo privilegio o una API oficial con credenciales rotables.

## Fallos y diagnóstico

Ante un error:

1. El proceso devuelve código distinto de cero.
2. `saveFailureArtifact()` intenta guardar una captura PNG y un informe TXT en `run-artifacts`.
3. El informe incluye fecha, URL y stack técnico, pero el código evita imprimir contraseña, semilla y TOTP.
4. Si hubo una interrupción después de algunos envíos, se debe comprobar visualmente `Requests > Pending` antes de reintentar.

No eliminar solicitudes ni modificar estados automáticamente. Esas acciones no forman parte del alcance autorizado.

## Pruebas y validación

Ejecute las pruebas unitarias y la validación sintáctica:

```powershell
npm test
node --check src\session.mjs
node --check src\request-access.mjs
node --check src\request-config.mjs
node --check src\totp.mjs
```

Después de cualquier cambio de selectores o lógica del formulario:

1. Ejecutar primero el modo visible sin `-Execute`.
2. Confirmar que aparece el diálogo de descarte y no se crea ninguna solicitud.
3. Solo entonces ejecutar una prueba real expresamente autorizada.
4. Comprobar que el resultado contiene `favoriteCount` IDs únicos en `Pending`.

## Continuidad recomendada para otro hilo de Codex

Antes de continuar:

1. Leer `README.md`, este `LOGIC.md` y `History.md` completos.
2. No pedir ni mostrar secretos si `.env` ya está configurado; el usuario debe gestionarlos únicamente desde la interfaz local.
3. Ejecutar `npm test` antes de modificar el flujo.
4. Mantener la consulta limitada exclusivamente a `Pending`.
5. Usar Playwright y una prueba visible para cualquier cambio relacionado con la web.
6. No ejecutar `-Execute` sin que el usuario haya autorizado claramente crear solicitudes reales.
7. Preservar la detección de duplicados y el conteo dinámico tomado exclusivamente de `Favorites`.

La siguiente fase prevista es validar una ejecución real iniciada manualmente con `INICIAR_AUTOMATIZACION.cmd`. Después podrá configurarse la ejecución de lunes a viernes a las 09:00, hora de Ecuador.
