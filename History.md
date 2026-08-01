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
2. Entra a las 14 cuentas favoritas configuradas para el usuario.
3. Solicita una fecha `dd/mm`; el año se obtiene automáticamente según `America/Guayaquil`.
4. Solicita una hora `HH:mm` de 24 horas y la convierte al formato visual de 12 horas usado por el portal.
5. Crea una solicitud de acceso de 8 horas para cada una de las 14 cuentas.
6. Consulta exclusivamente `Requests > Pending`, sin abrir ni utilizar `Approved`.
7. Extrae exactamente 14 `Request ID` únicos.
8. Si el toggle indica correo, construye y envía el mensaje mediante Outlook clásico.
9. Si indica interfaz web, muestra los 14 IDs en un diálogo local con opción de copiarlos.

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
- `INICIAR_AUTOMATIZACION.cmd`: es el lanzador real. Contiene `-Execute`, procesa las 14 solicitudes con Chrome oculto y ejecuta la acción final persistida.

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
- `.env` para las credenciales en texto legible y excluido de Git.
- `.env.mail` para destinatarios, copias, asunto y HTML; `mail-config.json` conserva la cuenta remitente esperada.

Los resultados locales se guardan dentro de `run-results/`; los diagnósticos y capturas de fallos se guardan en `run-artifacts/`.

## Próxima dirección solicitada

La aplicación web local ya incluye credenciales, parámetros de solicitud y contenido del correo. La siguiente etapa es integrar la decisión de envío, el inicio controlado de la automatización, el progreso y los resultados.

### Interfaz web local

La página ya se sirve únicamente en `127.0.0.1` con HTML, CSS y JavaScript sin frameworks. Ya incorpora fecha, hora, duración, razón y correo persistentes. Aún debe incorporar:

- Validación clara sin cerrar la interfaz.
- Separación muy visible entre modo de prueba y ejecución real.
- Estado del proceso, errores comprensibles y presentación de los 14 IDs.
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
- Mantener `INICIAR_PRUEBA.cmd` como una ruta incapaz de crear solicitudes o enviar correo.
- No ejecutar `-Execute` durante pruebas sin autorización expresa.
- Consultar únicamente `Pending`; no añadir navegación a `Approved`.
- Exigir exactamente 14 cuentas y 14 Request ID únicos.
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
