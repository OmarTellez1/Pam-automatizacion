# Historial y dirección del proyecto

## Lectura obligatoria para nuevos agentes

Antes de analizar, ejecutar o modificar este proyecto, un nuevo agente de IA debe leer completos y en este orden:

1. `README.md`: instalación, uso y operación para el usuario.
2. `LOGIC.md`: arquitectura, reglas de negocio, selectores, controles y diagnóstico técnico.
3. `History.md`: decisiones tomadas, avances comprobados y dirección futura.

El directorio vigente del proyecto es `C:\pam automatizacion`. No continuar trabajando sobre la copia anterior ubicada dentro de `Documents\Codex`, salvo que el usuario solicite expresamente recuperar algo de ese respaldo.

Este documento nunca debe contener contraseñas, semillas TOTP, códigos temporales ni otros secretos reales.

## Qué automatiza el proyecto

El proyecto automatiza un flujo interno en BeyondInsight Password Safe, disponible únicamente en la red corporativa en `https://10.30.17.117`:

1. Inicia sesión con usuario, contraseña y un código TOTP generado desde la semilla de Microsoft Authenticator.
2. Entra en `Accounts > Browse By Category > Favorites` y detecta todas las cuentas disponibles.
3. Solicita una fecha `dd/mm`; el año se obtiene automáticamente según `America/Guayaquil`.
4. Solicita una hora `HH:mm` de 24 horas y la convierte al formato visual de 12 horas usado por el portal.
5. Crea una solicitud de acceso de 1 a 8 horas para cada cuenta favorita.
6. Consulta exclusivamente `Requests > Pending`, sin abrir ni utilizar `Approved`.
7. Extrae un `Request ID` único por cada cuenta encontrada.
8. Si el toggle indica correo, construye y envía el mensaje mediante Outlook clásico.
9. Si indica interfaz web, muestra todos los IDs en un diálogo local con opción de copiarlos.

La razón configurada actualmente es:

```text
Soporte y pruebas con usuario post producción - TIC PETER GOMEZ
```

## Evolución y avances realizados

### 1. Inicio de sesión y TOTP

- Se automatizó el inicio de sesión en BeyondInsight mediante Playwright y Google Chrome.
- La excepción al certificado HTTPS privado se limita al navegador de esta automatización.
- El tráfico del navegador se restringe al origen `https://10.30.17.117` y a recursos internos necesarios.
- El TOTP se genera localmente con la semilla Base32, conforme a RFC 6238 con HMAC-SHA1.
- La contraseña y la semilla no se imprimen en consola.
- El mecanismo inicial guardaba la contraseña y la semilla cifradas con DPAPI dentro de `state/`. Fue reemplazado por `.env` durante la primera etapa de la interfaz local.

### 2. Solicitudes de acceso

- Se identificaron y procesaron las 14 filas favoritas de `Accounts`.
- La identidad estable de cada solicitud combina sistema, cuenta y familia de aplicación.
- Se normalizan variantes de aplicaciones como WinSCP, PuTTY, PLSQL y NOSQLBOOSTER.
- Antes de crear solicitudes, el flujo consulta las solicitudes equivalentes que ya están `Pending` para evitar duplicados.
- Se exige obtener exactamente 14 IDs únicos antes de generar correo o resultado.
- Se eliminó del flujo la visita a `Approved` por petición expresa del usuario. Esta decisión debe conservarse.

### 3. Fecha, hora e interfaz de terminal

- La fecha se introduce como `dd/mm`; el año actual de Ecuador se añade automáticamente.
- La hora se introduce como `HH:mm` de 24 horas y se confirma también en formato de 12 horas.
- Las respuestas eliminan espacios exteriores y se repiten hasta ser válidas.
- `Ctrl+C` cancela el proceso con código de salida `130`.
- Se añadió una tercera pregunta, insensible a mayúsculas y minúsculas:

```text
¿Desea que envié el correo por usted? S/N: 
```

Esta pregunta fue reemplazada posteriormente por el toggle persistente de la interfaz web.

- Una regresión hacía que el selector Flatpickr conservara la fecha actual al navegar a otro mes. Se corrigió abriendo primero la instancia exacta asociada a `Start Date`, posicionándola después y haciendo clic dentro de esa misma instancia.
- Se validó visiblemente que `12/08` y `15:00` producen `August 12, 2026` y `03:00 PM`, descartando el formulario sin crear la solicitud.

### 4. Extracción de IDs y correo

- Los Request ID se extraen dinámicamente de la última ejecución; nunca están fijados en el correo.
- El contenido se genera desde `EMAIL_TEMPLATE.md` y `EMAIL_TEMPLATE.html`.
- La tabla ya existe en la plantilla; el código sustituye el marcador obligatorio `{{REQUEST_IDS}}` por un ID en cada línea.
- El destinatario, las copias y el asunto se leen de `mail-config.json`.
- `recipient` contiene el destinatario principal.
- `cc` contiene tres posiciones editables; las posiciones vacías se ignoran.
- Las direcciones se validan, no pueden duplicarse y el destinatario principal no puede repetirse en CC.
- El método activo usa Outlook clásico mediante COM. No controla el mouse ni reconstruye manualmente el correo en pantalla.
- Se creó un borrador real, se verificó que contenía los 14 IDs y posteriormente se envió con autorización expresa del usuario.
- `last-email.json` impide reenviar accidentalmente el mismo conjunto de IDs al mismo grupo de destinatarios.
- Microsoft Graph quedó implementado como alternativa, pero no es el método activo porque la cuenta del usuario no tiene permisos para registrar la aplicación necesaria en Microsoft Entra.

### 5. Lanzadores

Existen dos lanzadores con responsabilidades deliberadamente separadas:

- `INICIAR_PRUEBA.cmd`: abre la terminal y Chrome visible, completa y valida solamente el primer formulario y lo descarta. No contiene `-Execute`, no crea solicitudes, no envía correo y no abre resultados.
- `INICIAR_AUTOMATIZACION.cmd`: es el lanzador real. Contiene `-Execute`, procesa todas las cuentas actuales de `Favorites` con Chrome oculto y ejecuta la acción final persistida.

Durante el desarrollo, un agente nunca debe ejecutar `INICIAR_AUTOMATIZACION.cmd` ni usar `-Execute` para verificar cambios, salvo autorización inequívoca del usuario para crear solicitudes reales.

### 6. Pruebas efectuadas

- Una ejecución real para el 1 de agosto de 2026 produjo 14 solicitudes `Pending` con IDs del `140131` al `140144`.
- Una repetición detectó las solicitudes existentes y evitó duplicarlas.
- Los IDs anteriores son únicamente evidencia histórica y no están codificados como valores constantes.
- Se verificó el envío de un correo de prueba mediante Outlook clásico.
- La última suite ejecutada antes de la migración aprobó 22 pruebas unitarias.
- También se validaron la sintaxis de Node.js y PowerShell, la configuración de destinatario/CC y la separación entre el lanzador seguro y el lanzador real.

### 8. Primera etapa de interfaz local y `.env`

- Se añadió `INICIAR_INTERFAZ.cmd`, que inicia una aplicación en `http://127.0.0.1:4317` y abre automáticamente el navegador predeterminado mediante Windows Explorer.
- La portada muestra `Configurar credenciales` y `Iniciar automatización`; el segundo botón permanece deshabilitado hasta implementar la siguiente etapa.
- Tras simplificar el diseño, fuera del encabezado la portada contiene únicamente esos dos botones centrados. La pantalla de configuración contiene solo el formulario y muestra un aviso encima cuando las tres variables de credenciales están completas.
- Cuando las credenciales ya están configuradas, el botón cambia a `Editar credenciales`. Los campos vacíos durante la edición conservan su valor previo, permitiendo actualizar únicamente la contraseña u otro dato individual.
- La verificación diferencia un rechazo de usuario/contraseña de un rechazo ocurrido después de alcanzar el desafío de Microsoft Authenticator, además de conservar un mensaje separado para problemas de red o del portal.
- El formulario solicita usuario, contraseña y clave Base32 de Microsoft Authenticator. Rechaza expresamente un código temporal de seis dígitos.
- Los valores se guardan como `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET` dentro de `.env`.
- `.env` permanece excluido de Git y `.env.example` contiene únicamente valores ficticios.
- Después del guardado se prueba el inicio de sesión en una sesión aislada y se cierra el navegador. No se crean solicitudes ni se envían correos.
- El servidor está limitado a IPv4 loopback, rechaza Host y Origin externos, no permite leer secretos y evita dos comprobaciones simultáneas.
- `run-login.ps1` y `run-access-requests.ps1` dejaron de descifrar archivos DPAPI y ahora consumen la configuración `.env` mediante la misma capa común.
- Se añadieron pruebas de lectura/escritura de `.env`, rechazo del código de seis dígitos, rutas de la interfaz, guardado, protección de origen, apertura automática, edición parcial y clasificación de errores. La suite completa aprobó 32 pruebas.

### 9. Configuración persistente de solicitudes

- La portada contiene un botón fijo para `Configurar solicitud`; esta pantalla no muestra un aviso de configuración existente, aunque sí precarga los valores guardados.
- La ruta `/solicitud` permite escribir y revisar fecha `dd/mm`, hora `HH:mm`, duración total en horas y razón.
- Los valores persisten como `PAM_START_DATE`, `PAM_START_TIME`, `PAM_SESSION_HOURS` y `PAM_REQUEST_REASON` dentro del mismo `.env` local.
- La duración admite exclusivamente enteros de 1 a 8 horas. `Days` permanece en cero y el valor se escribe directamente en `Hours`.
- `request-access.mjs` usa esta configuración cuando está completa. Los argumentos explícitos continúan reemplazando fecha y hora; la acción final se persiste por separado en `PAM_FINAL_ACTION`.
- La razón configurada también participa en la detección de solicitudes `Pending`, preservando la protección contra duplicados.
- El servidor devuelve al navegador únicamente estos cuatro valores no secretos para permitir la edición; nunca devuelve las credenciales.
- La interfaz fue validada con valores persistidos simulados sin tocar el `.env` real.

### 10. Configuración persistente del correo

- La portada incorpora `Configurar envío de correo` y la ruta `/correo`.
- `Para` y `CC` admiten múltiples direcciones separadas por `;`; se rechazan direcciones inválidas o repetidas entre ambas listas.
- El asunto y el cuerpo HTML se guardan en `.env.mail`, separado de las credenciales. Al volver al formulario se recuperan todos los valores.
- El editor conserva texto enriquecido, tablas e imágenes pegadas. El servidor sanitiza el HTML y solo conserva imágenes locales seguras.
- Antes de enviar, los IDs pegados se reemplazan por los 14 IDs de la ejecución actual y se actualiza la fila `Motivo del acceso` cuando existe.
- Las imágenes se convierten en adjuntos inline CID para Outlook clásico, evitando depender del soporte de URI `data:` del cliente de correo.
- La detección de duplicados incluye todos los destinatarios, CC, asunto, IDs y un hash del contenido definitivo.
- El aviso y el texto `Editar credenciales` dependen únicamente de `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET`; las configuraciones de solicitud y correo no influyen.
- La suite completa aprobó 48 pruebas, incluida persistencia, sanitización, destinatarios múltiples, sustitución dinámica e imágenes CID.

### 11. Marcador dinámico y resultado final

- El contenido del correo debe incluir `{{REQUEST_IDS}}` exactamente una vez. El formulario permite insertarlo en la posición del cursor y rechaza su ausencia o duplicación.
- Las configuraciones anteriores se migran reemplazando los IDs escritos en la celda `Solicitudes de PAM` por el marcador.
- La portada incorpora un toggle persistente con los estados `Se generará un bloc de notas al final` y `Se enviará un correo al final`.
- La selección se guarda como `PAM_FINAL_ACTION=notepad|email` dentro de `.env`; `notepad` es el valor predeterminado seguro.
- `request-access.mjs` deja de preguntar `S/N` y guarda `sendEmail` a partir del toggle. PowerShell conserva la bifurcación existente entre Outlook clásico y Bloc de notas.
- La suite completa aprobó 55 pruebas y la interfaz fue validada en Chrome visible, sin errores de consola.

### 12. Resultado de IDs dentro de la web

- El estado `notepad` fue reemplazado por `web`; las configuraciones existentes con `notepad` se migran automáticamente.
- El toggle ahora dice `Se mostrarán los IDs en esta interfaz al final` o `Se enviará un correo al final`.
- PowerShell dejó de crear `REQUEST_IDS.txt` y de abrir el Bloc de notas.
- El servidor valida `last-run.json` y solo expone un resultado web cuando contiene exactamente 14 IDs únicos y `sendEmail` es falso.
- La portada consulta el resultado periódicamente y abre un diálogo con los 14 IDs, la hora de finalización y acciones para copiar o cerrar.
- La interfaz local debe permanecer abierta durante la automatización para que el diálogo aparezca automáticamente.
- La suite completa aprobó 59 pruebas. La prueba visible confirmó el diálogo automático, los 14 IDs, la copia al portapapeles y cero errores de consola.

### 13. Creación automática de archivos de configuración

- `INICIAR_INTERFAZ.cmd` ya no presupone que el usuario haya creado `.env` o `.env.mail`.
- Antes de escuchar en localhost, `configuration-bootstrap.mjs` crea cualquier archivo faltante con todas sus variables esperadas.
- `.env` inicia con credenciales, fecha y hora vacías; conserva duración de 8 horas, razón predeterminada y `PAM_FINAL_ACTION=web`.
- `.env.mail` inicia con destinatarios y asunto predeterminados, pero con `PAM_MAIL_CONTENT_HTML` vacío.
- La creación utiliza el modo exclusivo `wx`. Si el archivo ya existe, no se abre para escritura, no se completa ni se sobrescribe.
- Los dos archivos son independientes: si uno existe y el otro falta, solo se crea el faltante.
- La suite completa aprobó 61 pruebas, incluidas creación inicial y preservación byte por byte de archivos existentes.

### 14. Contenido inicial del correo vacío

- Se eliminó la carga automática de `EMAIL_TEMPLATE.html` en el editor de correo.
- En una instalación nueva, el contenido comienza vacío. `{{REQUEST_IDS}}` continúa siendo obligatorio exactamente una vez al guardar una configuración.
- Después del primer guardado, el formulario recupera exclusivamente el HTML saneado que configuró el usuario.
- La suite completa aprobó 62 pruebas. Una validación visible en Chrome confirmó el estado inicial vacío, el guardado, la recarga del contenido y cero errores de consola.

### 15. Configuración multiusuario de Outlook clásico

- El formulario de credenciales incorpora `Tu correo de Outlook` y lo persiste como `OUTLOOK_EMAIL` en `.env`; los campos vacíos continúan conservando sus valores anteriores durante una edición.
- El estado de credenciales configuradas exige usuario, contraseña, clave TOTP y un correo de Outlook válido, sin devolver ninguno de esos valores al navegador.
- Outlook clásico usa la sesión ya iniciada y selecciona exactamente la cuenta cuyo `SmtpAddress` coincide con `OUTLOOK_EMAIL`; ya no existe un remitente fijo en archivos versionados.
- Una ejecución real configurada para correo valida remitente, destinatarios, asunto, contenido y marcador antes de abrir el portal, evitando crear solicitudes si el correo aún no está listo.
- `Para`, `CC` y contenido comienzan vacíos en `.env.mail`. Solo aparecen después de que el usuario guarde su configuración; el asunto conserva `ACCESOS AL PAM` como propuesta inicial.
- La página de correo advierte que el envío automático requiere Outlook clásico y que el nuevo Outlook no es compatible con COM.
- Se retiraron las plantillas predeterminadas, la configuración fija `mail-config.json`, los ejemplos obsoletos y la integración Microsoft Graph con sus scripts y dependencias Azure. El HTML definitivo nace exclusivamente del contenido configurado en la interfaz.
- La suite quedó en 58 pruebas aprobadas después de retirar cinco pruebas exclusivas de Graph y conservar la cobertura del remitente, las solicitudes `Pending` y el HTML. Chrome visible confirmó la nueva credencial, el aviso, los campos iniciales vacíos, el guardado, la recarga y cero errores de consola.

### 16. Estados independientes y hora AM/PM

- `Tu correo de Outlook` se trasladó desde credenciales PAM hasta `Configurar envío de correo`, donde se guarda como `PAM_MAIL_SENDER` junto con el resto del mensaje en `.env.mail`.
- Las credenciales PAM vuelven a depender exclusivamente de `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET`.
- La portada muestra `Configurar credenciales del PAM` o `Editar credenciales del PAM`, `Configurar solicitud` o `Editar solicitud`, y `Configurar envío de correo` o `Editar envío de correo`, según el estado independiente de cada API.
- La interfaz de solicitud recibe la hora como `hh:mm` y un selector `AM/PM`. El servidor convierte casos límite como `12:00 AM` a `00:00` y `12:00 PM` a `12:00`, manteniendo `PAM_START_TIME` en el formato de 24 horas requerido por BeyondInsight.
- Las 58 pruebas aprobaron. Chrome visible confirmó ambos estados de los tres botones, la precarga `02:15 PM`, el envío de `12:05 AM`, el remitente dentro del formulario de correo y cero mensajes de consola.

### 17. Favorites dinámico y hora de portal en 12 horas

- La automatización entra explícitamente en `Accounts > Browse By Category > Favorites` antes de leer las cuentas.
- Se eliminó la constante global de 14 elementos. El contador visible `N items` determina cuántas filas, solicitudes `Pending` e IDs deben existir en esa ejecución.
- El resultado guarda `favoriteCount`; la preparación del correo, el script PowerShell y el diálogo web vuelven a comprobar esa cantidad y la unicidad de los IDs.
- Las solicitudes `Pending` finales se limitan a las identidades de las cuentas encontradas en `Favorites`, evitando incorporar solicitudes ajenas con la misma fecha y razón.
- La interfaz local recibe `hh:mm` y `AM/PM`, y persiste la equivalencia de 24 horas. Una validación posterior contra el portal real confirmó que su DOM es `input[type="time"]`: Playwright debe asignar `14:30`, aunque Chrome lo muestre como `02:30 PM`.
- Las 59 pruebas aprobaron con cantidades dinámicas de 3, 4 y 5 favoritos y con casos de conversión de hora visible.

### 18. Botones de prueba y ejecución real

- La portada permite iniciar la automatización real y solicita confirmación antes de autorizar `Submit Request`.
- `BOTON_PRUEBA=TRUE` hace visible `Iniciar prueba`; cualquier otro valor lo oculta. Los archivos `.env` nuevos incluyen la variable deshabilitada como `FALSE`.
- El modo `--test-run` recorre todas las cuentas de `Favorites`, completa fecha, hora, duración y razón, y usa `Cancel` más `Discard Changes` en cada formulario. Guarda `submitted: 0`.
- Los resultados de prueba se marcan con `testMode: true` y aceptan únicamente la lista fija de 14 IDs simulados solicitada por el usuario. El diálogo los rotula como simulados; el correo antepone `[PRUEBA]` al asunto y usa una auditoría `last-test-email.json` separada de los envíos reales.
- La ejecución real mantiene una validación independiente: un ID único y una solicitud `Pending` por cada cuenta favorita.
- La API local impide ejecuciones simultáneas, comprueba credenciales y configuración antes de iniciar PowerShell y expone solo estado y mensajes no sensibles.
- La suite completa aprobó 65 pruebas. Chrome visible, con el inicio interceptado, confirmó la aparición del botón de prueba, su advertencia, un único POST simulado, la cancelación segura del botón real, el diálogo rotulado como `Request ID simulados` y cero errores de consola.

### 19. Corrección mediante prueba completa contra PAM y logs

- El primer fallo del botón de prueba ocurría antes de abrir Chrome: `request-access.mjs` importaba `projectDirectory` desde un módulo que no lo exportaba. Se corrigió el origen del import y se añadió una prueba que carga el módulo completo para detectar incompatibilidades ESM.
- La ejecución visible contra `https://10.30.17.117` mostró que el encabezado exacto es `Browse by Category` y que el contador visual `14 items` no es localizable. El flujo ahora selecciona `Favorites` y cuenta directamente las filas reales de la grilla.
- El calendario usa `August 1, 2026` como etiqueta accesible del día, pero conserva `August 01, 2026` en el campo. La verificación acepta correctamente esa representación visible con día de dos dígitos.
- El control `Start Time` es `input[type="time"]`: recibe `16:00` y Chrome lo muestra como `04:00 PM`. Se eliminó el intento incorrecto de llenar el DOM con `04:00 PM`.
- La prueba real y visible del 1 de agosto de 2026 autenticó correctamente, recorrió las 14 cuentas actuales de `Favorites`, llenó y descartó los 14 formularios y terminó con `submitted: 0`. No presionó `Submit Request`, no creó solicitudes y no envió correo; publicó únicamente los IDs simulados en el resultado web.
- Se añadió `logs/` en la raíz. El proceso iniciado desde localhost conserva stdout y stderr, los refleja en la terminal y muestra en la interfaz el error concreto y la ruta del log. `run-artifacts/` continúa guardando captura e informe del estado del navegador.
- La suite completa aprobó 67 pruebas, incluida la carga real de dependencias de `request-access.mjs` y la publicación del error concreto con su ruta de log.

### 20. Correo de prueba protegido y bloqueo total de la portada

- Se auditó la última prueba sin exponer destinatarios ni contenido: `last-run.json`, `email-manifest.json`, el HTML generado y `last-test-email.json` contienen exactamente `137288`, `137287`, `137286`, `137284`, `137283`, `137282`, `137281`, `137280`, `137278`, `137276`, `137275`, `137274`, `137273` y `137271`. El registro real separado `last-email.json` conserva los `140xxx` históricos del 31 de julio de 2026.
- Outlook ahora crea un mensaje nuevo en cada ejecución y no recupera borradores. Antes de enviar recalcula el hash del HTML, exige que el marcador ya se haya sustituido, comprueba la presencia de cada ID y, en prueba, contrasta orden y contenido con la lista fija autorizada.
- La portada deshabilita los tres enlaces de configuración, el toggle y los botones de prueba y producción durante cualquier ejecución. El estado explica que se reactivarán al terminar con éxito o con error.
- Una finalización exitosa cuya acción fue correo abre un diálogo pequeño de confirmación con botón `Cerrar`; una ejecución fallida no puede mostrar esa confirmación.
- Aprobaron 14 pruebas automatizadas relevantes y una validación visible en Chrome con API simulada comprobó bloqueo, restauración, diálogo de éxito y restauración después de error. No se abrió PAM ni se envió correo durante esta validación.
- Se corrigió la reapertura del diálogo de IDs al reiniciar el frontend: el resultado persistido se toma como línea base ya vista y únicamente un `resultId` posterior puede abrirlo.

### 21. Envío real único y selección por Request Start Date

- Con autorización expresa del usuario se añadió una ruta técnica `--single-submit`, incompatible con `--execute` y `--test-run`, que no admite correo y puede presionar `Submit Request` una sola vez. Su evidencia se guarda separada de `last-run.json`.
- El 1 de agosto de 2026 se realizó una única solicitud visible para `01/08/2026 07:00 PM`, duración de 8 horas, sobre `NOSQLBOOSTER / NOSQLBOOSTER`. PAM aceptó el formulario y la solicitud apareció en `Pending` con Request ID `140266` y `Request Start Date` exactamente `Aug 01, 2026, 7:00 PM`. No se intentó una segunda cuenta y no se envió correo.
- La selección de solicitudes se extrajo como regla comprobable: primero coincide `Request Start Date` completo; después se cruza la identidad estable de sistema, cuenta y familia de aplicación con `Favorites`. La razón se conserva como contenido de la solicitud, pero no participa en la identificación porque normalmente se reutiliza.
- La prueba unitaria cubre misma fecha con otra hora, otra fecha, razones distintas y espacios visuales normalizados; las razones distintas se aceptan cuando el `Request Start Date` coincide.

### 22. Continuación ante accesos aprobados superpuestos

- Por autorización expresa del usuario se consultó temporalmente `Approved` para elegir un caso controlado. NOSQLBOOSTER tenía el Request ID aprobado `140236` con inicio `Aug 03, 2026, 12:00 AM`.
- Un intento único sobre NOSQLBOOSTER para ese mismo inicio y 8 horas confirmó la respuesta real de PAM: HTTP `400`, código `PSPortal.Requests.Policies.RemoteAppAccesssAlreadyAvailable` y mensaje `This account is already available during the requested time for Application access.` No se creó una solicitud nueva.
- La automatización reconoce exclusivamente ese código como recuperable. Cierra y descarta el formulario, registra sistema, aplicación, cuenta, inicio y duración, y continúa con el siguiente favorito. Otros errores siguen abortando la ejecución.
- El resultado permite menos IDs que favoritos solo cuando la diferencia está cubierta por conflictos únicos. Terminal, estado local y diálogo web informan las omisiones. Si no existe ningún ID y la acción era correo, se evita enviar un mensaje vacío y se entrega el resultado en la web.
- Una segunda prueba real del mismo conflicto terminó correctamente con `submitted: 0`, sin Request ID y sin intentar otra cuenta. La validación visual simulada mostró un ID creado y NOSQLBOOSTER en la sección `Solicitudes omitidas por acceso aprobado` del diálogo final.
- Una ejecución real posterior configurada para `01/08/2026 10:00 AM` ocurrió después de esa hora. PAM mostró una validación local (`The time must be between 1:35 PM and 11:59 PM`) y no emitió ningún POST, lo que causaba un timeout de 30 segundos. Ahora fecha y hora pasadas se rechazan antes de iniciar PowerShell y el observador del formulario reconoce también esa validación visible. La salida de PowerShell se fuerza a UTF-8 para conservar las tildes en terminal y logs.
- La advertencia de horario pasado dejó de ser un texto transitorio: ahora se muestra en un diálogo persistente con el motivo exacto, `Editar solicitud` y `Cerrar`. El sondeo periódico conserva el error en pantalla y no vuelve a mostrar `La automatización está lista` hasta que el usuario cierre el cuadro.

### 23. Configuración y verificación independiente de Outlook

- La sección pasó a llamarse `Configurar credenciales` y presenta dos paneles: PAM a la izquierda y Outlook a la derecha. Cada uno tiene su propio estado, validación y botón; Outlook continúa siendo opcional.
- El remitente `PAM_MAIL_SENDER` se movió visualmente fuera del formulario de destinatarios. Se conserva en `.env.mail`, pero ahora solo se guarda después de comprobar mediante COM que Outlook clásico está instalado, que el perfil está disponible y que existe exactamente la cuenta indicada.
- La comprobación normal crea un mensaje temporal, asigna la cuenta con `SendUsingAccount` y lo descarta. No envía correo. El botón `Enviar correo de prueba` solicita confirmación y envía un mensaje a la misma dirección configurada.
- Antes de iniciar una automatización configurada para correo, el servidor vuelve a verificar Outlook. Si el cliente, el perfil o la cuenta no están disponibles, no abre PAM ni crea solicitudes.
- Si el usuario intenta activar el toggle de correo sin configurar Outlook, la portada muestra un diálogo específico. Al cerrarlo, persiste y presenta nuevamente el resultado seguro `Se mostrarán los IDs en esta interfaz al final`.
- La interfaz se validó en Chrome visible con APIs simuladas: distribución izquierda/derecha, guardado independiente, prueba de correo, diálogo de bloqueo, restauración del toggle y formulario de destinatarios sin remitente. No se abrió PAM ni se envió un correo real durante esta validación.
- La suite completa aprobó 83 pruebas, incluidas persistencia opcional, rechazo sin guardado, API de prueba y bloqueo de la automatización antes de ejecutar PowerShell cuando Outlook no está disponible.
- Al abrir `Editar solicitud`, una fecha guardada anterior al día actual de Ecuador se cambia automáticamente por hoy y se persiste en `.env`. La hora configurada conserva exactamente su valor anterior, al igual que la duración y la razón; la pantalla informa cuando hizo el ajuste.
- El campo `Fecha de inicio` presenta junto a su etiqueta el día de la semana y la fecha completa en español —por ejemplo, `Sábado, 1 de agosto de 2026`— y los actualiza inmediatamente mientras el usuario escribe un valor `dd/mm` válido.
- La fecha dejó de escribirse manualmente: ahora usa selectores verticales de día y mes. La cantidad de días se calcula para el mes y año actuales; los meses anteriores y los días ya transcurridos del mes actual se omiten por completo, por lo que no son visibles ni seleccionables. El valor persistido conserva el formato `dd/mm` compatible con la automatización.

### 24. Estabilización del formulario antes de Submit Request

- Una ejecución real para `03/08/2026 10:00 AM`, 8 horas, envió correctamente las primeras 12 cuentas y se detuvo al abrir la número 13 porque Flatpickr volvió de `August 03` a `August 01`. La cuenta 13 no alcanzó el llenado de duración o razón y no se presionó `Submit Request`; la cuenta 14 nunca se intentó.
- La captura de `Pending` mostraba `140281` con el horario correcto de la ejecución actual. Los IDs menores `140266` y `140267`, con otros horarios, eran solicitudes históricas anteriores y no fueron creados por esa ejecución.
- El flujo ahora espera que el formulario y `Application Session` terminen de inicializarse, reintenta el calendario hasta tres veces y exige que la fecha permanezca estable durante varias lecturas consecutivas.
- Fecha, hora, días, horas, minutos, razón y tipo de sesión se validan después del llenado y nuevamente inmediatamente antes del clic real. Si el portal cambia cualquier valor, `Submit Request` queda bloqueado y la automatización se detiene con los valores esperados y observados en el error.
- Una prueba visible y segura posterior recorrió las 14 cuentas para `03/08/2026 10:00 AM`, 8 horas. Los 14 formularios, incluidos ambos `pgdcmotorcred2`, aprobaron las dos validaciones y se cerraron con `Cancel` más `Discard Changes`. No se crearon solicitudes ni se envió correo.

### 25. Integridad del HTML del correo en Windows PowerShell 5

- Al reanudar la ejecución real, las primeras 12 solicitudes fueron reconocidas y se crearon únicamente las dos faltantes. El resultado final contiene los 14 IDs consecutivos `140270`–`140283`, sin conflictos.
- La etapa de correo se detuvo antes de Outlook porque PowerShell comparaba el hash después de leer el HTML como texto y volver a codificarlo. La protección funcionó: no se envió un mensaje cuya integridad no pudo confirmar.
- El cálculo ahora usa los bytes originales de `CORREO_ACCESOS_PAM.html`; el cuerpo se decodifica después con UTF-8 estricto. Esto elimina transformaciones dependientes de la codificación predeterminada de Windows PowerShell 5 y conserva la protección SHA-256.
- Se añadió `-ValidateOnly` para regenerar y comprobar manifiesto, HTML, marcador e IDs sin abrir Outlook, crear borradores ni enviar correo.

### 26. Lectura paginada y dinámica de Pending

- Una ejecución para `01/08/2026 7:00 PM` reconoció el ID existente `140266` y creó las 13 solicitudes faltantes, pero al final solo leyó las 10 coincidencias visibles en la página activa. La tabla contenía 29 solicitudes `Pending`, repartidas en dos páginas, por lo que el resultado no llegó a guardarse ni se envió correo.
- La extracción dejó de leer únicamente las filas visibles. Ahora usa los controles accesibles `First page` y `Next page`, interpreta etiquetas como `Page 1/2`, acumula por Request ID y exige que la cantidad única coincida con el contador total de la tabla.
- Solo después del recorrido completo aplica `Request Start Date` exacto y las identidades actuales de `Favorites`. La cantidad total de solicitudes ajenas puede ser menor o mayor que 14 y no afecta el resultado.
- Una comprobación visible y de solo lectura recorrió las dos páginas reales: leyó las 29 filas, ignoró 15 solicitudes ajenas y encontró exactamente 14 para `01/08/2026 7:00 PM`: `140266` y `140284`–`140296`. No abrió formularios ni creó solicitudes.
- La suite completa quedó en 85 pruebas aprobadas, incluidas etiquetas válidas e inválidas del paginador.

### 27. Conservación de la firma predeterminada de Outlook

- `Outlook.Application.CreateItem(0)` no incorpora por sí solo la firma que aparece al pulsar `Correo nuevo`, y la asignación directa de `HTMLBody` reemplazaba cualquier contenido inicial.
- Una comprobación COM segura confirmó que `GetInspector.WordEditor` inicializa silenciosamente la misma firma configurada: produjo HTML e imágenes equivalentes a `Display()` sin mostrar el mensaje. Los dos mensajes temporales usados para comparar métodos fueron descartados y no se enviaron.
- El envío ahora selecciona primero `SendUsingAccount`, inicializa el Inspector, captura la firma y sus adjuntos, y coloca el contenido de PAM antes de ella. Después exige conservar todos los Request ID, el texto normalizado de la firma y al menos sus adjuntos originales.
- Si Outlook no inserta una firma significativa, el flujo se detiene antes de `Send()`. `-ValidateSignature` permite construir el correo completo y descartarlo para comprobar la integración sin enviar ni guardar un borrador.

### 28. Errores de automatización en cuadros y entrega estable a Outlook

- Se eliminó el mensaje de estado visible que aparecía debajo de los botones de la portada.
- Los fallos tanto al iniciar como durante la ejecución se muestran en un cuadro descartable con una causa limpia, sin trazas `CategoryInfo` de PowerShell.
- El bloqueo de reenvío se presenta específicamente como un correo ya enviado con los mismos Request ID.
- Outlook resuelve `Para` y `CC`, guarda el mensaje compuesto y luego ejecuta `Send()`; si la entrega falla, conserva el borrador para revisión.
- La comprobación segura con `-ValidateSignature` confirmó contenido, firma y destinatarios y descartó el mensaje temporal sin enviarlo.

### 29. Firma administrada desde el contenido del correo

- La integración de la firma predeterminada mediante `GetInspector.WordEditor` dejó grandes espacios antes de la firma y provocó que Outlook rechazara `Send()` aunque el mensaje quedara en Borradores.
- Por decisión del usuario se retiraron la inicialización del Inspector, la concatenación de la firma, el guardado previo y `-ValidateSignature`.
- El envío vuelve al flujo directo que ya funcionaba: asigna el HTML configurado a `HTMLBody` y llama a `Send()` sin crear primero un borrador.
- La firma pasa a ser parte opcional del contenido persistente de `Editar envío de correo`, donde puede pegarse con su formato e imágenes.

### 30. Compatibilidad de imágenes inline con Outlook restringido

- El primer reintento con la firma pegada llegó correctamente hasta la creación del adjunto, pero Outlook rechazó la propiedad MAPI opcional `PR_ATTACH_FLAGS` (`0x37140003`) con `UnauthorizedAccessException`.
- El adjunto inline conserva las propiedades necesarias `Content-ID` y tipo MIME; se retiraron `PR_ATTACH_FLAGS` y `AttachmentHidden` porque solo controlaban su presentación cosmética y no deben impedir el envío.
- Las 14 solicitudes `140311`–`140324` permanecieron reconocidas en `Pending`; el fallo ocurrió antes de llamar a `Send()`.

### 31. Jerarquía visual y animación de ejecución

- El toggle de resultado final reemplazó al distintivo `Solo en este equipo` en la esquina derecha del encabezado y usa textos compactos.
- `Iniciar automatización` pasó a ser el botón azul principal, más grande y exactamente centrado; el botón de prueba ocupa el espacio izquierdo cuando está habilitado y no desplaza el centro cuando falta.
- Los tres accesos de configuración se movieron a una fila inferior de botones blancos más pequeños.
- Durante el proceso aparece un spinner; los estados finales animan un visto verde o una X roja y vuelven a habilitar todos los controles.
- La validación visible comprobó ambas variantes del layout, el bloqueo durante la ejecución y las transiciones simuladas de éxito y error sin abrir PAM.

### 7. Migración y Git

- El proyecto se copió íntegramente desde el directorio generado por Codex a `C:\pam automatizacion`.
- Se compararon conteos, tamaños y hashes SHA-256 de los archivos principales.
- La copia anterior se conservó como respaldo.
- El repositorio Git actual usa la rama `main` y tiene `origin` configurado en `https://github.com/OmarTellez1/Pam-automatizacion.git`.
- Al crear este documento, el árbol de trabajo estaba limpio antes de los cambios de documentación.

## Estado técnico actual

El flujo funcional todavía usa:

- Node.js 20 o posterior.
- Playwright Core con Google Chrome.
- PowerShell como orquestador de los lanzadores.
- Outlook clásico mediante COM para el envío.
- Una interfaz de terminal para fecha y hora; el resultado final se selecciona en la web.
- Una interfaz web local para configurar credenciales, parámetros de solicitud y envío de correo.
- `.env` para las tres credenciales PAM y los parámetros de solicitud, en texto legible y excluido de Git.
- `.env.mail` para remitente de Outlook, destinatarios, copias, asunto y HTML; no existen destinatarios ni plantillas fijos versionados.

Los resultados locales se guardan dentro de `run-results/`; los diagnósticos y capturas de fallos se guardan en `run-artifacts/`.

## Próxima dirección solicitada

La aplicación web local ya incluye credenciales, parámetros de solicitud, contenido del correo, decisión final, inicio controlado y presentación de resultados. La siguiente etapa puede ampliar el detalle de progreso por cada cuenta sin mezclar esa presentación con la lógica de automatización.

### Interfaz web local

La página ya se sirve únicamente en `127.0.0.1` con HTML, CSS y JavaScript sin frameworks. Ya incorpora fecha, hora, duración, razón y correo persistentes. Aún debe incorporar:

- Validación clara sin cerrar la interfaz.
- Separación muy visible entre modo de prueba y ejecución real.
- Estado del proceso, errores comprensibles y presentación de todos los IDs dinámicos.
- Protección contra dobles clics o ejecuciones simultáneas.
- Ejecución exclusiva en loopback; no debe exponerse a la red local.

La capa web debe llamar a la lógica existente en módulos; no debe duplicar la automatización ni contener reglas de negocio dentro de HTML.

### Archivo `.env`

El almacenamiento DPAPI de las credenciales PAM fue reemplazado por un archivo `.env` en la raíz. Contiene `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET`. El servidor lo interpreta con un módulo pequeño propio, sin añadir dependencias, y nunca devuelve sus valores al cliente web.

El `.env` real no se versiona. Aunque el repositorio sea privado, Git conservaría los secretos en el historial; por eso solo `.env.example`, con datos ficticios, puede incluirse en commits.

### Gitignore

El `.gitignore` vigente excluye dependencias, secretos, configuraciones locales, artefactos, cachés y archivos de editores:

```gitignore
.playwright-cli/
.env
.env.*
!.env.example
coverage/
*.log
npm-debug.log*
.vscode/
.idea/
Thumbs.db
.DS_Store
```

La configuración pendiente de otros valores importantes debe incorporarse gradualmente sin exponer secretos al navegador.

## Reglas que deben preservarse

- Trabajar desde `C:\pam automatizacion`.
- Leer los tres documentos de contexto antes de modificar código.
- No mostrar ni copiar secretos reales en conversaciones, documentación, código de prueba o logs.
- Mantener `INICIAR_PRUEBA.cmd` como una ruta incapaz de presionar `Submit Request`; el correo de prueba con IDs simulados sí está permitido según el toggle.
- No ejecutar `-Execute` durante pruebas sin autorización expresa.
- Consultar únicamente `Pending`; no añadir navegación a `Approved`.
- Usar exclusivamente las cuentas de `Accounts > Browse By Category > Favorites` y exigir un Request ID único por cada una.
- Mantener la detección de solicitudes y correos duplicados.
- No automatizar Outlook mediante coordenadas o control visual.
- Validar primero de manera segura cualquier cambio de la web.
- Actualizar `README.md`, `LOGIC.md` y `History.md` cuando cambie el comportamiento o la dirección del proyecto.

## Cómo retomar el trabajo en otro hilo

1. Confirmar que el directorio activo sea `C:\pam automatizacion`.
2. Leer `README.md`, `LOGIC.md` y `History.md` completos.
3. Revisar `git status` y preservar cualquier cambio existente del usuario.
4. Ejecutar `npm test` antes de cambios funcionales.
5. Diseñar primero el límite entre servidor localhost, lógica de automatización y presentación.
6. Integrar los campos de fecha, hora y correo con la lógica existente, sin duplicar reglas en HTML.
7. Probar mediante el modo seguro y nunca mediante el lanzador real sin autorización.
8. Actualizar los tres documentos al concluir cada avance importante.
