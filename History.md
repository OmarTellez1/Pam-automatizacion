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
8. Si el usuario respondió `S`, construye y envía el correo mediante Outlook clásico.
9. Si respondió `N`, escribe un ID por línea y abre el resultado en el Bloc de notas.

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

- Una regresión hacía que el selector Flatpickr conservara la fecha actual al navegar a otro mes. Se corrigió abriendo primero la instancia exacta asociada a `Start Date`, posicionándola después y haciendo clic dentro de esa misma instancia.
- Se validó visiblemente que `12/08` y `15:00` producen `August 12, 2026` y `03:00 PM`, descartando el formulario sin crear la solicitud.

### 4. Extracción de IDs y correo

- Los Request ID se extraen dinámicamente de la última ejecución; nunca están fijados en el correo.
- El contenido se genera desde `EMAIL_TEMPLATE.md` y `EMAIL_TEMPLATE.html`.
- La tabla ya existe en la plantilla; el código solo sustituye el marcador `{{REQUEST_IDS}}` por un ID en cada línea.
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
- `INICIAR_AUTOMATIZACION.cmd`: es el lanzador real. Contiene `-Execute`, procesa las 14 solicitudes con Chrome oculto y ejecuta la decisión final `S/N`.

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
- El formulario solicita usuario, contraseña y clave Base32 de Microsoft Authenticator. Rechaza expresamente un código temporal de seis dígitos.
- Los valores se guardan como `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET` dentro de `.env`.
- `.env` permanece excluido de Git y `.env.example` contiene únicamente valores ficticios.
- Después del guardado se prueba el inicio de sesión en una sesión aislada y se cierra el navegador. No se crean solicitudes ni se envían correos.
- El servidor está limitado a IPv4 loopback, rechaza Host y Origin externos, no permite leer secretos y evita dos comprobaciones simultáneas.
- `run-login.ps1` y `run-access-requests.ps1` dejaron de descifrar archivos DPAPI y ahora consumen la configuración `.env` mediante la misma capa común.
- Se añadieron pruebas de lectura/escritura de `.env`, rechazo del código de seis dígitos, rutas de la interfaz, guardado, protección de origen y apertura automática. La suite completa aprobó 29 pruebas.

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
- Una interfaz de terminal para las tres preguntas.
- Una interfaz web local para configurar y comprobar credenciales.
- `.env` para las credenciales en texto legible y excluido de Git.
- `mail-config.json` para remitente, destinatario, copias y asunto.

Los resultados locales se guardan dentro de `run-results/`; los diagnósticos y capturas de fallos se guardan en `run-artifacts/`.

## Próxima dirección solicitada

La primera etapa de la aplicación web local ya está implementada: portada, configuración de credenciales y prueba de inicio de sesión. La siguiente etapa es trasladar a esta interfaz la fecha, la hora, la decisión de correo, el progreso y los resultados.

### Interfaz web local

La página ya se sirve únicamente en `127.0.0.1` con HTML, CSS y JavaScript sin frameworks. Aún debe incorporar:

- Campo de fecha `dd/mm` con el año de Ecuador calculado automáticamente.
- Campo de hora `HH:mm` de 24 horas y confirmación equivalente de 12 horas.
- Decisión `S/N` o un control visual equivalente para enviar el correo.
- Validación clara sin cerrar la interfaz.
- Separación muy visible entre modo de prueba y ejecución real.
- Estado del proceso, errores comprensibles y presentación de los 14 IDs.
- Protección contra dobles clics o ejecuciones simultáneas.
- Ejecución exclusiva en loopback; no debe exponerse a la red local.

La capa web debe llamar a la lógica existente en módulos; no debe duplicar la automatización ni contener reglas de negocio dentro de HTML.

### Archivo `.env`

El almacenamiento DPAPI de las credenciales PAM fue reemplazado por un archivo `.env` en la raíz. Contiene `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET`. El servidor lo interpreta con un módulo pequeño propio, sin añadir dependencias, y nunca devuelve sus valores al cliente web.

El `.env` real no se versiona. Aunque el repositorio sea privado, Git conservaría los secretos en el historial; por eso solo `.env.example`, con datos ficticios, puede incluirse en commits.

### Gitignore pendiente

El `.gitignore` vigente excluye `node_modules/`, `state/`, `run-artifacts/` y `run-results/`, pero su mejora quedó pendiente. Antes del próximo commit funcional se recomendó excluir también:

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
