# Automatización de BeyondInsight Password Safe

Este componente abre exclusivamente `https://10.30.17.117`, introduce el usuario y la contraseña, genera el código TOTP vigente y comprueba que BeyondInsight haya abierto Password Safe.

> **Instrucción obligatoria para nuevos agentes de IA:** antes de analizar, ejecutar o modificar el proyecto, lea completos este `README.md`, [`LOGIC.md`](LOGIC.md) y [`History.md`](History.md). `LOGIC.md` documenta el funcionamiento técnico; `History.md` conserva las decisiones, avances comprobados y la dirección futura. Después de cambios relevantes, mantenga actualizados los tres documentos.

## Requisitos

- Windows y Node.js 20 o posterior. Los lanzadores detectan automáticamente el runtime moderno incluido con Codex cuando la instalación global de Windows es antigua.
- Google Chrome instalado.
- Conectividad a la red o VPN donde existe `10.30.17.117`.
- Usuario y contraseña de BeyondInsight.
- Clave Base32 usada para enrolar el TOTP. **No es uno de los códigos temporales de seis dígitos.** Si no se conserva, un administrador debe restablecer/re-enrolar el TOTP y entregar la clave por un canal aprobado.
- Autorización del responsable de seguridad para almacenar contraseña y clave TOTP en el mismo equipo.
- Outlook clásico instalado y con `tellezoe@hitss.com` configurado. Microsoft Graph queda como alternativa opcional si HITSS concede permisos de registro de aplicaciones.

## Instalación única

Abra PowerShell en esta carpeta y ejecute:

```powershell
npm install
```

Después, haga doble clic en `INICIAR_INTERFAZ.cmd`. Se abrirá una página servida exclusivamente en `http://127.0.0.1:4317`. La terminal que inicia el servidor debe permanecer abierta mientras se usa la interfaz.

La pantalla inicial contiene cinco controles:

- `Configurar credenciales`: abre el formulario implementado en esta etapa.
- `Configurar solicitud`: permite guardar o editar fecha de inicio, hora de inicio, duración total en horas y razón.
- `Configurar envío de correo`: permite guardar destinatarios, copias, asunto y contenido enriquecido.
- Toggle de resultado final: alterna entre `Se mostrarán los IDs en esta interfaz al final` y `Se enviará un correo al final`.
- `Iniciar automatización`: permanece deshabilitado hasta integrar el flujo de solicitudes en la siguiente etapa.

Fuera del encabezado, la portada muestra únicamente estos cinco controles centrados. Solo el estado de las tres variables de credenciales controla si la primera acción dice `Configurar credenciales` o `Editar credenciales`. Los formularios de solicitud y correo vuelven a cargar sus valores guardados, pero no muestran avisos de “configuración existente”. El toggle se guarda como `PAM_FINAL_ACTION` en `.env`; si todavía no existe, mostrar los IDs en la web es la opción segura.

Durante una edición, los campos vacíos conservan su valor actual. Por ejemplo, se puede escribir únicamente una contraseña nueva y dejar vacíos el usuario y la clave del Authenticator. Después de guardar, la comprobación distingue entre un rechazo inicial de usuario/contraseña, un rechazo posterior del código TOTP y un fallo de conexión o del portal.

El formulario solicita usuario, contraseña y la clave Base32 de enrolamiento de Microsoft Authenticator. Esta clave no es el código temporal de seis dígitos. Al guardar, los tres valores se escriben en `.env` y se realiza inmediatamente una prueba aislada de inicio de sesión. Esta comprobación no crea solicitudes ni envía correos.

`.env` contiene texto legible y está excluido de Git. No debe copiarse a chats, documentación, logs ni commits. `.env.example` documenta los nombres de variables sin valores reales.

La configuración de solicitud se guarda en el mismo archivo con `PAM_START_DATE`, `PAM_START_TIME`, `PAM_SESSION_HOURS` y `PAM_REQUEST_REASON`. La fecha usa `dd/mm` y recibe automáticamente el año vigente de Ecuador al ejecutar. La hora usa `HH:mm`; la duración admite únicamente números enteros de 1 a 8 y se escribe en `Hours`, manteniendo `Days` en cero. Estos valores son usados por el flujo existente cuando están completos; una fecha u hora proporcionada explícitamente por PowerShell continúa teniendo prioridad.

La configuración del correo se guarda por separado en `.env.mail`, también excluido de Git. `Para` y `CC` admiten varias direcciones separadas por punto y coma, por ejemplo `uno@empresa.com;dos@empresa.com`. Al volver a entrar en `/correo` se recuperan los destinatarios, el asunto y el contenido guardado.

## Prueba visible

```powershell
.\scripts\run-login.ps1 -Headed -KeepOpen
```

La primera prueba debe mostrar Chrome y terminar en BeyondInsight Password Safe. Cierre la ventana para finalizar el proceso.

Este script y el flujo de solicitudes cargan `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET` desde `.env`. Si el archivo aún no existe, primero debe usarse `INICIAR_INTERFAZ.cmd`.

## Ejecución desatendida

```powershell
.\scripts\run-login.ps1
```

El proceso devuelve código `0` si inició sesión correctamente y `1` si falló. En un fallo guarda una captura y un informe sin secretos dentro de `run-artifacts`.

## Solicitar los 14 accesos

Para abrir la interfaz de prueba, haga doble clic en `INICIAR_PRUEBA.cmd`. Este lanzador abre una terminal visible, pregunta fecha y hora y ejecuta únicamente la validación del primer formulario. No incluye `-Execute` y, por tanto, no crea solicitudes, no envía correo ni publica resultados en la web.

Para ejecutar el proceso real, haga doble clic en `INICIAR_AUTOMATIZACION.cmd`. Este segundo lanzador sí incluye `-Execute`: crea o recupera las 14 solicitudes `Pending` y aplica el resultado elegido previamente en el toggle. El navegador funciona de forma desatendida para reducir el tiempo del proceso; la terminal permanece visible para las preguntas y el resultado.

No use `INICIAR_AUTOMATIZACION.cmd` para pruebas: abrirlo constituye la autorización para crear las solicitudes reales.

El lanzador comprueba Node.js antes de iniciar y usa únicamente una versión 20 o posterior. En este equipo evita la instalación global 14.21.3 y utiliza el runtime compatible de Codex, por lo que no depende del orden de `PATH` de la terminal visible.

El lanzador pregunta la fecha y la hora antes de abrir el navegador:

```powershell
.\scripts\run-access-requests.ps1 -Headed
```

Las preguntas son:

```text
¿En qué fecha desea solicitar los permisos? Formato dd/mm: 
¿A qué hora desea solicitar los permisos? Formato HH:mm de 24 horas: 
```

La fecha acepta únicamente día y mes, por ejemplo `01/08`. El año se añade automáticamente usando el año vigente en Ecuador. La hora se introduce en formato de 24 horas: `14:00` se confirma como `02:00 PM` y se envía técnicamente como `14:00` al control web.

El resultado final ya no se pregunta en la terminal. Si el toggle indica correo, al finalizar una ejecución real con 14 IDs se envía el mensaje mediante Outlook clásico. Si indica interfaz web, la portada detecta `run-results\last-run.json` y abre automáticamente un diálogo con los 14 IDs y un botón para copiarlos. `INICIAR_INTERFAZ.cmd` debe permanecer abierto para mostrar el resultado.

La interfaz elimina los espacios al inicio y al final de cada respuesta. Si una respuesta está vacía o no tiene el formato correcto, muestra el motivo y repite la misma pregunta. No continúa hasta recibir fecha y hora válidas. Para cancelar voluntariamente, presione `Ctrl+C`; el proceso mostrará el mensaje de cancelación y no iniciará o detendrá la automatización.

Sin `-Execute`, el primer formulario se completa, valida y descarta sin crear solicitudes. Para ejecutar las 14 solicitudes reales use:

```powershell
.\scripts\run-access-requests.ps1 -Execute -Headed
```

También se pueden proporcionar los valores directamente para una ejecución no interactiva:

```powershell
.\scripts\run-access-requests.ps1 -Date '01/08' -StartTime '14:00' -Headed
```

La duración continúa siendo 8 horas y la razón está definida en el código. El flujo consulta exclusivamente el estado `Pending` para comprobar solicitudes equivalentes y extraer sus Request ID. No abre ni consulta el estado `Approved`.

El lanzador final de doble clic está implementado como `INICIAR_AUTOMATIZACION.cmd`. No se requiere un `.exe`: el archivo CMD inicia el mismo flujo de PowerShell y Node.js instalado en esta carpeta.

Los Request ID de la última ejecución se guardan en `run-results\last-run.json`. La opción web los entrega mediante un diálogo local; ya no crea ni abre `REQUEST_IDS.txt`.

Cuando una ejecución real termina con exactamente 14 ID únicos, genera `run-results\CORREO_ACCESOS_PAM.md` y `run-results\CORREO_ACCESOS_PAM.html`. El HTML usa el contenido enriquecido configurado en la interfaz. El contenido debe incluir `{{REQUEST_IDS}}` exactamente una vez; al preparar el mensaje se reemplaza por los 14 IDs actuales, uno por línea. También se actualiza la celda `Motivo del acceso` cuando está presente.

Los ID no están fijados en el código. Cada correo usa exclusivamente `requestIds` de la última ejecución y comprueba que coincidan con exactamente 14 registros en estado `Pending`. Por ejemplo, una ejecución para el 4 de agosto usará los 14 ID nuevos de esa ejecución, no los obtenidos para el 1 de agosto.

## Método activo: Outlook clásico

Este equipo tiene Outlook clásico instalado y el perfil `Outlook` expone exactamente una cuenta `tellezoe@hitss.com` mediante COM. El proceso no usa coordenadas ni controla visualmente la pantalla.

### Configurar destinatarios y contenido

Abra `INICIAR_INTERFAZ.cmd` y seleccione `Configurar envío de correo`. `Para` requiere al menos una dirección; tanto `Para` como `CC` aceptan listas separadas por `;`. Las direcciones se validan, no pueden repetirse y una dirección de `Para` no puede aparecer nuevamente en `CC`.

El campo de contenido admite texto con formato, tablas e imágenes pegadas desde el portapapeles. La política local permite estilos en línea para representar ese formato, pero mantiene bloqueados scripts, objetos, marcos y conexiones externas; además, el servidor sanea el HTML al guardar. Las imágenes se guardan como datos locales y, al preparar el mensaje, se convierten en adjuntos inline con identificadores CID para que Outlook clásico las muestre dentro del cuerpo. `mail-config.json` se conserva únicamente para identificar y validar la cuenta remitente de Outlook.

Use el botón `Insertar {{REQUEST_IDS}}` para colocar el marcador en la posición actual del cursor. El formulario rechaza contenido sin marcador o con más de uno. Las configuraciones anteriores que tenían IDs escritos en la celda `Solicitudes de PAM` se migran al marcador al cargarlas.

Para crear y mostrar un borrador sin enviarlo:

```powershell
.\scripts\run-outlook-classic.ps1 -Display
```

Sin `-Display`, el borrador se guarda en Outlook sin abrir la ventana. Para enviar el correo actual de forma explícita:

```powershell
.\scripts\run-outlook-classic.ps1 -Send
```

Antes de crear o enviar, el script regenera el correo desde `run-results\last-run.json`, exige 14 ID únicos y comprueba que coincidan con 14 solicitudes `Pending`. `-Send` bloquea un segundo envío del mismo conjunto de ID; `-Force` permite un reenvío deliberado.

La prueba del 31 de julio de 2026 creó correctamente un borrador con asunto `ACCESOS AL PAM`, destinatario `tellezoe@hitss.com` y los 14 ID `140131` a `140144`. El elemento quedó guardado con `Sent = False`; no se envió ningún correo.

## Alternativa: Microsoft Graph

El envío usa Microsoft Graph y no controla la ventana de Outlook. Se necesita registrar una aplicación pública de escritorio en el tenant de HITSS:

1. En Microsoft Entra, cree una aplicación de un solo tenant y copie `Application (client) ID` y `Directory (tenant) ID`.
2. En `Authentication > Advanced settings`, active `Allow public client flows`.
3. En `API permissions`, agregue Microsoft Graph, permiso delegado `Mail.Send`. La política corporativa puede exigir consentimiento administrativo.
4. No cree ni configure un client secret: este flujo es una aplicación pública con Device Code y caché cifrada.

Cuando tenga ambos identificadores, ejecute:

```powershell
.\scripts\setup-outlook.ps1
.\scripts\run-outlook-auth.ps1
```

La segunda instrucción muestra una dirección oficial de Microsoft y un código de un solo uso. Inicie sesión como `tellezoe@hitss.com`. Después, MSAL intentará renovar los tokens silenciosamente. La caché se protege con DPAPI para la cuenta actual de Windows; una política de acceso condicional de HITSS puede requerir una nueva autorización ocasional.

Para generar y revisar el correo sin enviarlo:

```powershell
.\scripts\run-email.ps1
```

Para enviar el correo actual después de revisarlo:

```powershell
.\scripts\run-email.ps1 -Send
```

El destinatario de pruebas es `tellezoe@hitss.com` y el asunto es `ACCESOS AL PAM`; ambos se guardan en `state\outlook-config.json`. El envío exige 14 ID únicos y pendientes. También registra `run-results\last-email.json` y bloquea un segundo envío del mismo conjunto de ID. `-Force` permite un reenvío solo cuando sea deliberado.

Microsoft Graph devuelve `202 Accepted` cuando acepta el mensaje para procesamiento y guarda la copia en Elementos enviados. Esto no garantiza por sí solo que el servidor del destinatario ya lo haya entregado.

## Controles aplicados

- La excepción de certificado HTTPS se usa en un contexto aislado.
- Se bloquean solicitudes hacia orígenes distintos de `https://10.30.17.117`.
- No se guardan cookies ni sesiones del navegador.
- La contraseña, la clave TOTP y el código generado no se escriben en consola.
- La interfaz escucha únicamente en `127.0.0.1`, rechaza orígenes externos y nunca devuelve las credenciales guardadas al navegador.
- El archivo `.env` está excluido de Git; `.env.example` solo contiene valores ficticios.
- Los tokens de Outlook se guardan cifrados con DPAPI mediante Microsoft Authentication Extensions for Node.
- El envío de correo solicita únicamente el permiso delegado `Mail.Send`.
- La ejecución predeterminada de `run-email.ps1` solo genera una vista previa; `-Send` es obligatorio para enviar.
- La ejecución predeterminada de `run-outlook-classic.ps1` crea únicamente un borrador; también exige `-Send` para enviarlo.
- La acción final se lee de `PAM_FINAL_ACTION`: `email` envía por Outlook clásico y `web` muestra los 14 IDs en un diálogo local sin enviar correo.
- Los destinatarios, copias, asunto y HTML se leen de `.env.mail`; `mail-config.json` conserva únicamente la cuenta remitente usada por Outlook clásico.
- Los secretos cifrados y artefactos de ejecución están excluidos de Git.

## Limitación de seguridad

Guardar la contraseña y la semilla TOTP juntas y como texto legible en `.env` elimina la separación efectiva de factores. Cualquier persona o proceso con acceso a la carpeta puede leerlas. Para producción, es preferible que BeyondTrust proporcione una cuenta de automatización con privilegios mínimos o una API con credenciales rotables. Revocar el usuario, restablecer el TOTP o cambiar la contraseña requiere volver a configurar y comprobar las credenciales desde la interfaz local.
