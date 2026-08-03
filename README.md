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
- Para usar el resultado por correo: Outlook clásico (la versión antigua) instalado, abierto al menos una vez y con el perfil del usuario iniciado. El nuevo Outlook no ofrece la interfaz COM requerida por este programa. Esta condición es opcional si los IDs se mostrarán en la interfaz.

## Instalación única

Abra PowerShell en esta carpeta y ejecute:

```powershell
npm install
```

Después, haga doble clic en `INICIAR_INTERFAZ.cmd`. Antes de abrir la página, el servidor crea automáticamente `.env` y `.env.mail` si faltan. `.env` incluye las tres credenciales PAM, fecha y hora vacías, duración de 8 horas, resultado web seguro y `BOTON_PRUEBA="FALSE"`. `.env.mail` deja vacíos el remitente de Outlook, `Para`, `CC` y contenido; solo propone el asunto `ACCESOS AL PAM`. Si un archivo ya existe, no se modifica ni se vuelve a crear. La página se sirve exclusivamente en `http://127.0.0.1:4317` y la terminal debe permanecer abierta mientras se usa.

La pantalla inicial contiene los controles de configuración, resultado y ejecución:

- `Configurar credenciales`: abre dos paneles independientes: credenciales PAM a la izquierda y cuenta de Outlook a la derecha.
- `Configurar solicitud`: permite guardar o editar fecha de inicio, hora de inicio, duración total en horas y razón.
- `Configurar envío de correo`: permite guardar destinatarios, copias, asunto y contenido enriquecido.
- Toggle compacto del encabezado: alterna entre `Mostrar IDs al final` y `Enviar correo al final`.
- `Iniciar prueba`: aparece únicamente cuando `.env` contiene `BOTON_PRUEBA="TRUE"`. Recorre todas las cuentas de `Favorites`, llena cada formulario y lo descarta sin presionar `Submit Request`.
- `Iniciar automatización`: solicita confirmación explícita y ejecuta el flujo real, que sí presiona `Submit Request`.

La portada coloca `Iniciar automatización` como acción principal azul, grande y centrada. `Iniciar prueba` aparece a su izquierda únicamente cuando está habilitado, sin desplazar el centro de la acción principal. Los tres accesos de configuración forman una fila secundaria de botones blancos más pequeños. Cada botón refleja su persistencia: `Editar credenciales` cuando las tres variables `BI_*` son válidas, `Editar solicitud` cuando sus cuatro parámetros están completos y `Editar envío de correo` cuando remitente, destinatarios, asunto y contenido son válidos. Los formularios de solicitud y correo vuelven a cargar sus valores guardados, pero no muestran avisos de “configuración existente”. El toggle se guarda como `PAM_FINAL_ACTION` en `.env`; si todavía no existe, mostrar los IDs en la web es la opción segura. Si se intenta activar correo sin una cuenta de Outlook configurada, aparece un cuadro explicativo y, al cerrarlo, el toggle vuelve a la opción web. El servidor bloquea un segundo inicio mientras haya otra automatización en curso.

Durante una edición de credenciales, los campos vacíos conservan su valor actual. Por ejemplo, se puede escribir únicamente una contraseña nueva y dejar vacíos el usuario y la clave del Authenticator. Después de guardar, la comprobación distingue entre un rechazo inicial de usuario/contraseña, un rechazo posterior del código TOTP y un fallo de conexión o del portal.

El formulario solicita usuario, contraseña y clave Base32 de enrolamiento de Microsoft Authenticator. Esta clave no es el código temporal de seis dígitos. Los tres valores se escriben en `.env`; después se realiza una prueba aislada del inicio de sesión PAM. Esta comprobación no crea solicitudes ni envía correos.

`.env` contiene texto legible y está excluido de Git. No debe copiarse a chats, documentación, logs ni commits. El usuario no necesita crearlo manualmente; únicamente completa sus datos desde la interfaz. `.env.example` documenta los nombres de variables sin valores reales.

La configuración de solicitud se guarda en el mismo archivo con `PAM_START_DATE`, `PAM_START_TIME`, `PAM_SESSION_HOURS` y `PAM_REQUEST_REASON`. La fecha se elige con listas de día y mes, pero se sigue persistiendo como `dd/mm`. Cada mes ofrece únicamente sus 28, 29, 30 o 31 días reales; los meses anteriores y los días ya transcurridos del mes actual no aparecen en las listas y, por tanto, no pueden seleccionarse. El año vigente de Ecuador se añade automáticamente y junto al campo se muestra la lectura completa, por ejemplo `Sábado, 1 de agosto de 2026`. Al abrir `Editar solicitud`, una fecha anterior al día actual de Ecuador se reemplaza y persiste automáticamente con la fecha de hoy; la hora, duración y razón no cambian. En la web local, la hora se introduce como `hh:mm` y se elige `AM` o `PM`; el servidor la convierte y persiste como `HH:mm` de 24 horas. El control real de BeyondInsight es `<input type="time">`: Playwright debe asignarle el valor técnico `HH:mm`, aunque Chrome lo presenta visualmente como `hh:mm AM/PM`. La duración admite únicamente números enteros de 1 a 8 y se escribe en `Hours`, manteniendo `Days` en cero. Antes de iniciar PowerShell, el servidor rechaza una fecha u hora que ya haya pasado en `America/Guayaquil`.

La configuración del correo se guarda por separado en `.env.mail`, también excluido de Git y creado automáticamente. El remitente de Outlook se configura en el panel derecho de `/credenciales`; `Para`, `CC` y contenido se configuran en `/correo` y comienzan vacíos. El remitente debe coincidir exactamente con la cuenta iniciada en Outlook clásico. `Para` y `CC` admiten varias direcciones separadas por punto y coma, por ejemplo `uno@empresa.com;dos@empresa.com`. Después del primer guardado, cada pantalla recupera sus propios valores configurados.

## Prueba visible

```powershell
.\scripts\run-login.ps1 -Headed -KeepOpen
```

La primera prueba debe mostrar Chrome y terminar en BeyondInsight Password Safe. Cierre la ventana para finalizar el proceso.

Este script y el flujo de solicitudes cargan `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET` desde `.env`. El envío carga `PAM_MAIL_SENDER` y los demás parámetros del correo desde `.env.mail`. Primero debe usarse `INICIAR_INTERFAZ.cmd` para crear la configuración automáticamente y completar las credenciales.

## Ejecución desatendida

```powershell
.\scripts\run-login.ps1
```

El proceso devuelve código `0` si inició sesión correctamente y `1` si falló. En un fallo guarda una captura y un informe sin secretos dentro de `run-artifacts`. Cada automatización iniciada desde la web crea además un archivo completo en `logs\automation-<modo>-<fecha>.log`, refleja la salida en la terminal de `INICIAR_INTERFAZ.cmd` y muestra en la portada el error concreto junto con la ruta del log. Los lanzadores directos crean `logs\powershell-<modo>-<fecha>.log` y siempre muestran la salida detallada en su terminal.

## Solicitar accesos de Favorites

Para ejecutar la prueba desde la web, establezca `BOTON_PRUEBA="TRUE"` en `.env` y pulse `Iniciar prueba`; la interfaz detecta el cambio automáticamente. También puede hacer doble clic en `INICIAR_PRUEBA.cmd`. La prueba abre Chrome, entra en `Accounts > Browse By Category > Favorites`, llena y descarta todos los formularios. Nunca presiona `Submit Request` y guarda `submitted: 0`.

Al finalizar una prueba se usan siempre estos 14 IDs simulados: `137288`, `137287`, `137286`, `137284`, `137283`, `137282`, `137281`, `137280`, `137278`, `137276`, `137275`, `137274`, `137273` y `137271`. Si el toggle indica web, aparecen identificados como simulados en el diálogo. Si indica correo, se prepara y envía el mensaje con esos IDs mediante Outlook clásico y se antepone `[PRUEBA]` al asunto. Justo antes de enviar se valida nuevamente la lista fija, el hash del HTML y la presencia de cada ID; además, cada ejecución crea un mensaje nuevo para no reutilizar borradores obsoletos. Como la lista es deliberadamente fija, los correos de prueba permiten repetirla y usan `last-test-email.json`; esto no cambia `last-email.json` ni la protección contra duplicados del modo real.

Para ejecutar el proceso real, haga doble clic en `INICIAR_AUTOMATIZACION.cmd`. Este segundo lanzador sí incluye `-Execute`: entra en `Accounts > Browse By Category > Favorites`, cuenta las filas disponibles y crea o recupera una solicitud `Pending` por cada cuenta. La cantidad es dinámica. Si PAM rechaza una cuenta porque ya existe un acceso aprobado que se superpone con el horario solicitado, la registra como omitida y continúa con el siguiente favorito; otros tipos de error sí detienen el proceso. Después aplica el resultado elegido previamente en el toggle. El navegador funciona de forma desatendida para reducir el tiempo del proceso; la terminal permanece visible para el estado y el resultado.

Antes de cada `Submit Request`, el flujo espera que el formulario termine de inicializarse, exige que `Application Session` permanezca seleccionado y comprueba dos veces fecha, hora, días, horas, minutos y razón. El calendario admite hasta tres intentos y debe conservar la fecha durante un intervalo estable. Si el portal restablece cualquier campo a su valor predeterminado, la solicitud se bloquea y no se presiona `Submit Request`.

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

La fecha acepta únicamente día y mes, por ejemplo `01/08`. El año se añade automáticamente usando el año vigente en Ecuador. La hora técnica usa 24 horas: `14:00` se asigna al `input[type="time"]` del portal y Chrome lo muestra visualmente como `02:00 PM`.

El resultado final ya no se pregunta en la terminal. Si el toggle indica correo, al finalizar una ejecución se muestra un diálogo pequeño que confirma el envío y permite cerrarlo. Si indica interfaz web, la portada detecta un resultado nuevo en `run-results\last-run.json` y abre automáticamente un diálogo con todos los IDs y un botón para copiarlos. El resultado que ya existía al abrir o reiniciar la interfaz se registra como visto y no vuelve a abrir el diálogo. Mientras una ejecución está activa, todos los controles permanecen deshabilitados y aparece un spinner debajo de las acciones principales. Al terminar, ese indicador se transforma temporalmente en un visto verde o una X roja; los cuadros finales usan la misma señal visual. Los errores aparecen en un cuadro descartable y no en una línea debajo de los botones. Si el inicio se rechaza porque la fecha y hora ya pasaron, el cuadro ofrece acceso directo a `Editar solicitud`. `INICIAR_INTERFAZ.cmd` debe permanecer abierto para mostrar el resultado.

La interfaz elimina los espacios al inicio y al final de cada respuesta. Si una respuesta está vacía o no tiene el formato correcto, muestra el motivo y repite la misma pregunta. No continúa hasta recibir fecha y hora válidas. Para cancelar voluntariamente, presione `Ctrl+C`; el proceso mostrará el mensaje de cancelación y no iniciará o detendrá la automatización.

`-TestRun` completa, valida y descarta todos los formularios sin crear solicitudes:

```powershell
.\scripts\run-access-requests.ps1 -TestRun -Headed
```

Sin `-Execute` ni `-TestRun`, se conserva una vista previa técnica que valida solamente el primer formulario. Para ejecutar las solicitudes reales de todas las cuentas favoritas use:

```powershell
.\scripts\run-access-requests.ps1 -Execute -Headed
```

También se pueden proporcionar los valores directamente para una ejecución no interactiva:

```powershell
.\scripts\run-access-requests.ps1 -Date '01/08' -StartTime '14:00' -Headed
```

La duración admite de 1 a 8 horas y la razón se obtiene de la configuración persistente. El flujo consulta exclusivamente el estado `Pending` para comprobar solicitudes equivalentes y extraer sus Request ID. Recorre todas las páginas de la tabla y contrasta los Request ID únicos leídos con el contador total; no presupone que `Pending` tenga 14 elementos ni que todo quepa en una página. Después exige que `Request Start Date` coincida exactamente con la fecha y hora configuradas y cruza sistema, cuenta y familia de aplicación con las cuentas actuales de `Favorites`. Las demás solicitudes pendientes se ignoran. La razón se envía en el formulario, pero no participa en la identificación porque suele repetirse entre ejecuciones. No abre ni consulta el estado `Approved`.

El lanzador final de doble clic está implementado como `INICIAR_AUTOMATIZACION.cmd`. No se requiere un `.exe`: el archivo CMD inicia el mismo flujo de PowerShell y Node.js instalado en esta carpeta.

Los Request ID de la última ejecución se guardan en `run-results\last-run.json`. La opción web los entrega mediante un diálogo local; ya no crea ni abre `REQUEST_IDS.txt`.

El resultado también guarda `conflicts` para las cuentas rechazadas con el código estable de PAM `PSPortal.Requests.Policies.RemoteAppAccesssAlreadyAvailable`. La terminal muestra sistema, aplicación, cuenta y `Request Start Date` de cada omisión. El diálogo web presenta la misma lista junto a los IDs que sí se obtuvieron. Si todos los favoritos terminan en conflicto y la acción configurada era correo, no se envía un mensaje vacío: el resultado se deja disponible en la interfaz web.

Cuando una ejecución real obtiene un ID único por cada cuenta de `Favorites`, genera `run-results\CORREO_ACCESOS_PAM.html` a partir del contenido enriquecido configurado en la interfaz. El contenido debe incluir `{{REQUEST_IDS}}` exactamente una vez; al preparar el mensaje se reemplaza por todos los IDs actuales, uno por línea. El resto del contenido, incluida cualquier celda `Motivo del acceso`, se conserva tal como fue configurado por el usuario.

Los ID y su cantidad no están fijados en el código. Cada correo usa exclusivamente `requestIds` de la última ejecución y comprueba que su cantidad coincida con `favoriteCount` y con las solicitudes en estado `Pending` de esas cuentas.

Existe un modo técnico deliberadamente limitado para validar un único envío sin ejecutar todos los favoritos: `node src\request-access.mjs --single-submit --date dd/mm --time HH:mm --email N --headed`. Es incompatible con `--execute` y `--test-run`, nunca envía correo y guarda su evidencia en `run-results\single-submit-verification.json` sin modificar `last-run.json`. No forma parte de la interfaz de usuario.

## Método activo: Outlook clásico

El proceso abre Outlook clásico mediante COM y busca exactamente una cuenta cuyo `SmtpAddress` coincida con `PAM_MAIL_SENDER`. Usa la sesión de Outlook ya iniciada por cada usuario; no almacena la contraseña de Outlook, no usa coordenadas y no controla visualmente la pantalla. Si la cuenta no existe o aparece más de una coincidencia, el envío se detiene con un error.

Outlook recibe únicamente el contenido configurado en `Editar envío de correo`; la automatización no carga ni concatena la firma predeterminada de Outlook. Si se desea incluir una firma, debe copiarse dentro del editor web junto con el resto del mensaje. El guardado conserva su formato e imágenes mediante los mismos adjuntos inline usados para cualquier imagen pegada.

En `Configurar credenciales`, el botón de Outlook comprueba que Outlook clásico pueda abrirse, que exista exactamente esa cuenta en el perfil y que pueda asignarse como remitente. Para esta comprobación crea un mensaje temporal y lo descarta, sin enviarlo; el valor solo se guarda si la prueba termina correctamente. `Enviar correo de prueba` solicita confirmación y envía un mensaje a la misma cuenta configurada. Antes de iniciar una automatización cuyo resultado sea correo, la aplicación repite la comprobación de Outlook para evitar abrir PAM cuando el cliente o la sesión no están disponibles.

### Configurar destinatarios y contenido

Abra `INICIAR_INTERFAZ.cmd`, seleccione `Configurar credenciales` y verifique primero la cuenta remitente en el panel de Outlook. Después abra `Configurar envío de correo`: `Para` requiere al menos una dirección; tanto `Para` como `CC` aceptan listas separadas por `;`. Las direcciones se validan, no pueden repetirse y una dirección de `Para` no puede aparecer nuevamente en `CC`.

El campo de contenido aparece vacío hasta que el usuario escriba y guarde su propio mensaje. Admite texto con formato, tablas e imágenes pegadas desde el portapapeles. La política local permite estilos en línea para representar ese formato, pero mantiene bloqueados scripts, objetos, marcos y conexiones externas; además, el servidor sanea el HTML al guardar. Las imágenes se guardan como datos locales y, al preparar el mensaje, se convierten en adjuntos inline con identificadores CID para que Outlook clásico las muestre dentro del cuerpo.

Para cada imagen inline se asignan únicamente su `Content-ID` y tipo MIME. No se escriben las propiedades MAPI opcionales `PR_ATTACH_FLAGS` o `AttachmentHidden`, porque ciertas instalaciones de Outlook las bloquean y esa característica cosmética no debe detener el envío.

Use el botón `Insertar {{REQUEST_IDS}}` para colocar el marcador en la posición actual del cursor. El formulario rechaza contenido sin marcador o con más de uno. Las configuraciones anteriores que tenían IDs escritos en la celda `Solicitudes de PAM` se migran al marcador al cargarlas.

Para crear y mostrar un borrador sin enviarlo:

```powershell
.\scripts\run-outlook-classic.ps1 -Display
```

Sin `-Display`, el borrador se guarda en Outlook sin abrir la ventana. Para enviar el correo actual de forma explícita:

```powershell
.\scripts\run-outlook-classic.ps1 -Send
```

Antes de crear o enviar, el script regenera el correo desde `run-results\last-run.json`, exige un ID único por cuenta favorita y comprueba que coincidan con las solicitudes `Pending`. Inmediatamente antes de `Send()` vuelve a comprobar el hash del cuerpo y todos los IDs; en modo de prueba exige exactamente la lista simulada autorizada. Siempre crea un mensaje nuevo, sin recuperar borradores anteriores. `-Send` bloquea un segundo envío del mismo conjunto de ID; `-Force` permite un reenvío deliberado.

El envío asigna directamente el HTML ya validado y llama a `Send()` usando la cuenta configurada, sin inicializar el Inspector ni guardar antes un borrador. Esto conserva el flujo que enviaba correctamente antes de incorporar la firma automática. La portada muestra cualquier error en un cuadro descartable; un correo duplicado, por ejemplo, se informa como `Estos Request ID ya fueron enviados`.

La integridad se calcula directamente sobre los bytes UTF-8 del HTML, evitando que Windows PowerShell 5 altere tildes u otros caracteres al convertir el contenido. `scripts\run-outlook-classic.ps1 -ValidateOnly` regenera y valida manifiesto, hash, marcador e IDs sin abrir Outlook, crear borradores ni enviar mensajes.

La validación histórica del 31 de julio de 2026 creó correctamente un borrador con los 14 ID esperados y confirmó `Sent = False`; no se envió ningún correo durante esa comprobación.

## Controles aplicados

- La excepción de certificado HTTPS se usa en un contexto aislado.
- Se bloquean solicitudes hacia orígenes distintos de `https://10.30.17.117`.
- No se guardan cookies ni sesiones del navegador.
- La contraseña, la clave TOTP y el código generado no se escriben en consola.
- La interfaz escucha únicamente en `127.0.0.1`, rechaza orígenes externos y nunca devuelve las credenciales guardadas al navegador.
- El archivo `.env` está excluido de Git; `.env.example` solo contiene valores ficticios.
- La ejecución predeterminada de `run-outlook-classic.ps1` crea únicamente un borrador; también exige `-Send` para enviarlo.
- La acción final se lee de `PAM_FINAL_ACTION`: `email` envía por Outlook clásico y `web` muestra todos los IDs obtenidos en un diálogo local sin enviar correo.
- El remitente, los destinatarios, copias, asunto y HTML se leen de `.env.mail`.
- Las credenciales y los artefactos de ejecución están excluidos de Git.

## Limitación de seguridad

Guardar la contraseña y la semilla TOTP juntas y como texto legible en `.env` elimina la separación efectiva de factores. Cualquier persona o proceso con acceso a la carpeta puede leerlas. Para producción, es preferible que BeyondTrust proporcione una cuenta de automatización con privilegios mínimos o una API con credenciales rotables. Revocar el usuario, restablecer el TOTP o cambiar la contraseña requiere volver a configurar y comprobar las credenciales desde la interfaz local.
