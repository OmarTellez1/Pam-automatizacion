# Lógica y contexto de la automatización

## Propósito

Este proyecto automatiza un flujo interno de BeyondInsight Password Safe alojado en `https://10.30.17.117`:

1. Iniciar sesión con usuario, contraseña y TOTP.
2. Abrir las 14 cuentas favoritas de Password Safe.
3. Preguntar la fecha `dd/mm`, la hora `HH:mm` y si se desea enviar el correo; validar las respuestas y crear una solicitud de acceso para cada cuenta.
4. Consultar exclusivamente `Requests > Pending`.
5. Extraer y guardar los 14 `Request ID` pendientes.

El flujo dispone de dos lanzadores de doble clic. `INICIAR_PRUEBA.cmd` valida un formulario y lo descarta; `INICIAR_AUTOMATIZACION.cmd` incluye `-Execute` y crea las solicitudes reales. Ambos abren una interfaz de terminal con las tres preguntas. La generación del cuerpo y el envío autorizado del correo están implementados. El método activo usa Outlook clásico mediante COM porque el usuario no tiene permisos para registrar aplicaciones en Microsoft Entra. Microsoft Graph permanece implementado como alternativa futura. En el flujo integrado, solo la respuesta `S` autoriza el envío; `N` entrega los IDs mediante el Bloc de notas.

Este documento no contiene credenciales, contraseñas, semillas TOTP ni códigos temporales. Un nuevo hilo de Codex debe preservar esa regla.

## Estado actual

- El inicio de sesión desatendido funciona.
- El TOTP se genera localmente a partir de la semilla Base32 cifrada.
- El formulario de solicitud y la extracción de IDs funcionan para 14 cuentas.
- El flujo fue validado de forma visible con Playwright/Chrome.
- La prueba real del 1 de agosto de 2026 creó 14 solicitudes pendientes con IDs del `140131` al `140144`.
- Una segunda ejecución reconoció las 14 solicitudes pendientes y no generó duplicados.
- Solo se consulta el estado `Pending`; `Approved` no se abre ni se utiliza.
- La interfaz de terminal solicita día/mes, hora de 24 horas y la decisión `S/N` sobre el correo; muestra la conversión completa y solo después inicia el navegador.
- Una validación visible confirmó que `01/08` y `14:00` llegan al formulario como 1 de agosto del año vigente y `02:00 PM`, y que el modo de simulación descarta el formulario sin enviarlo.
- Una regresión observada con `12/08` hacía que el selector conservara el día actual. Se corrigió vinculando el clic al calendario Flatpickr de `Start Date`, abriéndolo antes de cambiar de mes y verificando inmediatamente el valor seleccionado. Una prueba visible confirmó `12/08/2026` y `03:00 PM` sin enviar la solicitud.
- Las pruebas unitarias actuales cubren validación y conversión de fechas y horas, normalización de aplicaciones y generación TOTP.
- Después de obtener 14 ID únicos, el flujo genera un correo Markdown completo sin construir la tabla mediante control visual de Outlook.
- La integración Graph está implementada, pero la autorización real queda pendiente hasta configurar una aplicación de Microsoft Entra de HITSS y realizar el inicio de sesión de una sola vez.
- Los ID `140131` a `140144` pertenecen únicamente a la ejecución de prueba del 1 de agosto de 2026. No están incorporados como constantes del correo.
- Outlook clásico 16.0 está instalado, el perfil `Outlook` contiene una única cuenta `tellezoe@hitss.com` y COM puede acceder a ella.
- La primera prueba COM creó y mostró un borrador guardado con los 14 ID; la verificación posterior confirmó `Sent = False` y cero ID ausentes.
- Después de la confirmación explícita del usuario, ese mismo borrador se envió mediante COM el 31 de julio de 2026. La verificación encontró el mensaje en `Elementos enviados` con `Sent = True`, un destinatario y los 14 ID completos. `last-email.json` impide repetir accidentalmente el mismo conjunto.
- El lanzador final `INICIAR_AUTOMATIZACION.cmd` está implementado y ejecuta el navegador de forma desatendida con `-Execute`.
- `mail-config.json` expone el destinatario principal y tres posiciones opcionales de CC. Actualmente el destinatario de prueba es `tellezoe@hitss.com` y las copias están vacías.

## Parámetros de negocio

Los valores se encuentran en `src/request-config.mjs`:

| Campo | Valor |
| --- | --- |
| Cantidad esperada | 14 cuentas |
| Start Date | Entrada `dd/mm`; el año vigente de Ecuador se añade automáticamente |
| Start Time | Entrada `HH:mm` en formato de 24 horas |
| Acción final | `S`: enviar por Outlook clásico; `N`: abrir los IDs en el Bloc de notas |
| Days | `0` |
| Hours | `8` |
| Minutes | `0` |
| Tipo de acceso | `Application Session`, ya seleccionado por el portal |
| Reason | `Soporte y pruebas con usuario post producción - TIC PETER GOMEZ` |
| Estado consultado | Únicamente `Pending` |

La zona horaria del contexto del navegador y del cálculo de la fecha es `America/Guayaquil`.

## Arquitectura de archivos

### Entradas principales

- `src/session.mjs`: crea el navegador, aplica las restricciones de red e inicia sesión.
- `src/login.mjs`: ejecutable sencillo para comprobar solamente el inicio de sesión.
- `src/request-access.mjs`: orquesta las 14 solicitudes, evita duplicados pendientes y extrae los IDs.
- `src/request-config.mjs`: constantes y funciones puras de fechas, normalización y claves de solicitud.
- `src/totp.mjs`: decodifica Base32 y genera códigos TOTP RFC 6238 con HMAC-SHA1.
- `src/email-content.mjs`: valida los 14 ID y genera el cuerpo Markdown del correo desde una plantilla estable.
- `EMAIL_TEMPLATE.md`: cuerpo reutilizable del correo; contiene el marcador `{{REQUEST_IDS}}` y la tabla ya definida.
- `EMAIL_TEMPLATE.html`: versión HTML usada por Microsoft Graph, incluyendo tabla y firma.
- `src/outlook-email.mjs`: valida el resultado Pending, construye la solicitud Graph, detecta duplicados y ejecuta `POST /me/sendMail`.
- `src/outlook-auth.mjs`: carga la configuración, crea el cliente MSAL y obtiene tokens silenciosamente o mediante Device Code.
- `src/authorize-outlook.mjs`: inicia la autorización interactiva de una sola vez.
- `src/send-access-email.mjs`: genera la vista previa y, solo con `--send`, envía el correo y registra la auditoría.
- `src/prepare-access-email.mjs`: prepara un manifiesto común desde `last-run.json` para transportes como Outlook clásico.
- `mail-config.json`: define remitente, destinatario principal, lista `cc` y asunto sin contener secretos. Las entradas vacías de `cc` se ignoran.

### Scripts de PowerShell

- `scripts/setup-secrets.ps1`: solicita usuario, contraseña, destino de login y semilla TOTP. Guarda los secretos mediante DPAPI.
- `scripts/runtime.ps1`: localiza un `node.exe` compatible (versión 20 o posterior). Prioriza `BI_NODE_EXE`, luego el runtime incluido con Codex y finalmente las instalaciones encontradas en `PATH`.
- `scripts/run-login.ps1`: descifra temporalmente los secretos para el proceso y ejecuta `src/login.mjs`.
- `scripts/run-access-requests.ps1`: hace lo mismo y ejecuta `src/request-access.mjs`; acepta fecha, hora, decisión `S/N`, modo visible y autorización para crear las solicitudes. Tras una ejecución real, envía por Outlook clásico o abre los IDs en el Bloc de notas según la respuesta.
- `scripts/setup-outlook.ps1`: guarda tenant, aplicación, remitente, destinatario y asunto; no almacena client secrets.
- `scripts/run-outlook-auth.ps1`: ejecuta el Device Code flow y crea la caché de tokens protegida con DPAPI.
- `scripts/run-email.ps1`: genera una vista previa por defecto; `-Send` autoriza el envío y `-Force` un reenvío deliberado.
- `scripts/run-outlook-classic.ps1`: crea un borrador mediante COM por defecto; `-Display` lo muestra y `-Send` lo envía.

### Lanzador de prueba

- `INICIAR_PRUEBA.cmd`: lanzador de doble clic para la interfaz de terminal. Ejecuta `run-access-requests.ps1 -Headed` sin `-Execute`, por lo que arma, valida y descarta el primer formulario sin enviar solicitudes. Mantiene la ventana abierta al finalizar normalmente o con error para que el usuario lea el resultado; ante la cancelación con `Ctrl+C`, devuelve el código `130`.

### Lanzador final

- `INICIAR_AUTOMATIZACION.cmd`: lanzador de producción. Ejecuta `run-access-requests.ps1 -Execute` sin `-Headed`, crea o recupera exactamente 14 solicitudes `Pending` y aplica la decisión de correo. `S` invoca Outlook clásico con `-Send`; `N` genera `run-results/REQUEST_IDS.txt` y lo abre en un Bloc de notas nuevo. No debe ejecutarse como prueba.

La resolución explícita del runtime es necesaria porque este equipo también tiene Node.js 14.21.3 en `C:\Program Files\nodejs`. Una terminal abierta fuera de Codex puede encontrar esa versión primero. Los scripts no deben invocar `node` directamente: deben usar `Resolve-ProjectNode` para seleccionar Node 20 o posterior y evitar incompatibilidades de sintaxis o de Playwright.

### Estado y resultados

- `state/config.json`: contiene el usuario y el valor opcional de `Log in to`; no contiene la contraseña ni la semilla TOTP.
- `state/password.dpapi`: contraseña cifrada para la cuenta actual de Windows.
- `state/totp.dpapi`: semilla TOTP cifrada para la cuenta actual de Windows.
- `run-results/last-run.json`: resultado estructurado de la última ejecución real, incluyendo solicitudes `pending`, `requestIds` y la decisión `sendEmail`.
- `run-results/REQUEST_IDS.txt`: salida de texto con un ID por línea; se genera y abre en el Bloc de notas cuando la respuesta es `N`.
- `run-results/CORREO_ACCESOS_PAM.md`: cuerpo del correo generado con los 14 ID de la última ejecución correcta.
- `run-results/CORREO_ACCESOS_PAM.html`: cuerpo HTML que se entrega a Microsoft Graph.
- `run-results/last-email.json`: auditoría local del último correo aceptado por Graph y protección contra duplicados.
- `run-results/email-manifest.json`: manifiesto validado que comparte la configuración y los ID con Outlook clásico.
- `run-results/last-draft.json`: identificador y datos del último borrador creado mediante COM.
- `state/outlook-config.json`: identificadores públicos de Entra y configuración del correo.
- `state/outlook-token-cache.bin`: caché MSAL cifrada para la cuenta actual de Windows.
- `run-artifacts/`: capturas e informes de fallos.
- `test/`: pruebas unitarias ejecutadas por Node.

`state`, `run-results` y `run-artifacts` están excluidos mediante `.gitignore`.

## Flujo de autenticación

`openAuthenticatedSession()` en `src/session.mjs` realiza estos pasos:

1. Lee `state/config.json`.
2. Obtiene `BI_PASSWORD` y `BI_TOTP_SECRET` del entorno temporal creado por PowerShell.
3. Inicia Google Chrome mediante `playwright-core`.
4. Configura locale `es-EC`, zona horaria de Ecuador y la excepción HTTPS requerida por el certificado privado.
5. Bloquea cualquier solicitud de red cuyo origen sea diferente de `https://10.30.17.117`. Solo se permiten además recursos internos `about:`, `data:` y `blob:`.
6. Abre la página de login y llena `Username`, `Password` y, cuando está configurado, `Log in to`.
7. Espera el desafío de autenticación, evita usar un TOTP al final de su ventana de 30 segundos, genera un código vigente y lo envía.
8. Comprueba que se abandonó la ruta de login y que aparece `Return to dashboard`.

No se persisten cookies ni perfiles de navegador. Cada ejecución crea una sesión nueva.

## Flujo de solicitudes

`src/request-access.mjs` sigue este orden:

1. Interpreta los argumentos. Si falta la fecha, la hora o la decisión de correo, formula las preguntas en la terminal. Sin `--execute`, trabaja en modo de simulación.
2. Elimina espacios al inicio y al final de cada respuesta. Una respuesta vacía o inválida genera un mensaje y repite la misma pregunta indefinidamente.
3. Valida que la fecha use exactamente `dd/mm` y le añade el año actual calculado en `America/Guayaquil`.
4. Valida que la hora use `HH:mm` de 24 horas y muestra su equivalencia de 12 horas. Por ejemplo, `14:00` se confirma como `02:00 PM`.
5. Valida la decisión de correo: acepta exclusivamente `S/s` o `N/n`, después de eliminar espacios exteriores.
6. Permite cancelar voluntariamente con `Ctrl+C`, cierra el navegador si ya existe y devuelve el código de salida `130`.
7. Inicia una sesión autenticada.
8. Abre `Accounts` y espera exactamente `14 items`.
9. Lee las filas y construye para cada cuenta una identidad formada por sistema, cuenta y familia de aplicación.
10. Abre `Requests`, selecciona exclusivamente `Pending` y lee las solicitudes actuales.
11. Filtra las pendientes por fecha/hora exactas y por el motivo configurado.
12. Construye un mapa de solicitudes pendientes equivalentes para evitar recrearlas.
13. Regresa a `Accounts` y procesa las 14 filas en su orden visible.
14. Antes de abrir cada fila, vuelve a comprobar su identidad para evitar actuar sobre una tabla que cambió.
15. Para las solicitudes no existentes, pulsa `Access`, abre la pestaña `Submit Request`, completa el formulario y valida todos los valores antes de enviar.
16. Al terminar, vuelve a `Requests > Pending`, obtiene los IDs coincidentes y exige exactamente 14 IDs únicos.
17. Guarda el resultado y la decisión de correo en `run-results/last-run.json`, y escribe una línea `REQUEST_IDS=id1,id2,...` en la consola.
18. Si existen exactamente 14 ID únicos, sustituye `{{REQUEST_IDS}}` en `EMAIL_TEMPLATE.md` y guarda el correo listo en `run-results/CORREO_ACCESOS_PAM.md`.
19. Genera también el cuerpo HTML. Para correo, vuelve a validar que `requestIds` coincida con 14 solicitudes cuyo estado sea exactamente `Pending`.
20. Si la respuesta fue `S`, `prepare-access-email.mjs` lee `recipient` y `cc` desde `mail-config.json`, crea `email-manifest.json`; Outlook clásico verifica la cuenta esperada, evita duplicados y llama a `MailItem.Send()`.
21. Si la respuesta fue `N`, PowerShell escribe los 14 IDs en `run-results/REQUEST_IDS.txt`, uno por línea, y abre un nuevo Bloc de notas. No crea ni envía correo.
22. La ruta Graph sigue disponible como alternativa: obtiene un token MSAL y llama a `POST https://graph.microsoft.com/v1.0/me/sendMail`.

## Simulación y ejecución real

Sin `-Execute`, el script llena únicamente el primer formulario, comprueba sus valores, pulsa `Cancel` y confirma `Discard Changes`. No crea solicitudes:

```powershell
.\scripts\run-access-requests.ps1 -Headed
```

Con `-Execute`, puede crear solicitudes reales:

```powershell
.\scripts\run-access-requests.ps1 -Execute -Headed
```

El equivalente recomendado para el usuario final es hacer doble clic en `INICIAR_AUTOMATIZACION.cmd`. El lanzador omite `-Headed` para ejecutar el navegador sin mostrarlo y reducir el tiempo total.

Para evitar las preguntas y pasar los valores directamente:

```powershell
.\scripts\run-access-requests.ps1 -Date '01/08' -StartTime '14:00' -Email 'N' -Headed
```

La bandera `-Headed` muestra Chrome y debe usarse para validar cambios en la interfaz. Sin ella, Chrome se ejecuta de forma desatendida. `-Execute` continúa siendo la única bandera que autoriza envíos reales.

Las preguntas interactivas terminan en dos puntos y un espacio para que la entrada quede visualmente separada:

```text
¿En qué fecha desea solicitar los permisos? Formato dd/mm: 
¿A qué hora desea solicitar los permisos? Formato HH:mm de 24 horas: 
¿Desea que envié el correo por usted? S/N: 
```

### Reglas de conversión de entrada

- `01/08` en cualquier fecha de 2026 se convierte en `2026-08-01` internamente y se confirma como `01/08/2026`.
- Cuando el año vigente en Ecuador sea 2027, `01/08` se convertirá automáticamente en `2027-08-01`.
- No se acepta un año escrito por el usuario ni formatos abreviados como `1/8`.
- Se valida que el día exista en el mes y año calculados, incluyendo años bisiestos.
- Las respuestas compuestas únicamente por espacios se consideran vacías. Los espacios exteriores de valores válidos se eliminan antes de validarlos.
- La interfaz permanece en la pregunta actual hasta recibir una respuesta válida; `Ctrl+C` es la salida voluntaria prevista.
- La decisión de correo acepta `S`, `s`, `N` o `n`; cualquier otro valor, incluido uno vacío, repite la pregunta.
- `14:00` se escribe como `14:00` en el control HTML de hora y BeyondInsight lo representa como `02:00 PM` en formato de 12 horas.
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

Para cambiar el usuario, la contraseña o la semilla alfanumérica TOTP, ejecute nuevamente:

```powershell
.\scripts\setup-secrets.ps1
```

Esto reemplaza los archivos de `state` con valores nuevos. La semilla TOTP es la clave Base32 de enrolamiento, no un código temporal de seis dígitos.

DPAPI vincula los secretos a la cuenta de Windows que los creó. Otra cuenta o equipo no podrá descifrarlos; en ese caso se debe ejecutar nuevamente el asistente desde la identidad que realizará la automatización.

## Controles y límites de seguridad

- Nunca incluir secretos en el código, documentación, argumentos de línea de comandos, logs o mensajes de Codex.
- Los scripts exponen los secretos solo como variables de entorno del proceso hijo y las eliminan al finalizar.
- Los buffers de PowerShell usados para convertir `SecureString` se liberan y ponen a cero.
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
4. Comprobar que el resultado contiene 14 IDs únicos en `Pending`.

## Continuidad recomendada para otro hilo de Codex

Antes de continuar:

1. Leer `README.md` y este `LOGIC.md` completos.
2. No pedir ni mostrar secretos si los archivos DPAPI ya están configurados.
3. Ejecutar `npm test` antes de modificar el flujo.
4. Mantener la consulta limitada exclusivamente a `Pending`.
5. Usar Playwright y una prueba visible para cualquier cambio relacionado con la web.
6. No ejecutar `-Execute` sin que el usuario haya autorizado claramente crear solicitudes reales.
7. Preservar la detección de duplicados y el límite exacto de 14 cuentas.

La siguiente fase prevista es validar una ejecución real iniciada manualmente con `INICIAR_AUTOMATIZACION.cmd`. Después podrá configurarse la ejecución de lunes a viernes a las 09:00, hora de Ecuador.
