# Automatización de BeyondInsight Password Safe

Este componente abre exclusivamente `https://10.30.17.117`, introduce el usuario y la contraseña, genera el código TOTP vigente y comprueba que BeyondInsight haya abierto Password Safe.

> Antes de modificar o ampliar el flujo, lea también [`LOGIC.md`](LOGIC.md). Allí se documentan el propósito, la lógica interna, las decisiones de seguridad, los archivos y el estado actual del trabajo para facilitar la continuidad en otros hilos de Codex.

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
.\scripts\setup-secrets.ps1
```

El asistente solicita los secretos directamente en PowerShell. La contraseña y la clave TOTP se cifran mediante DPAPI y solo la misma cuenta de Windows puede descifrarlas. No introduzca esos valores en un chat, archivo de código o tarea programada.

## Prueba visible

```powershell
.\scripts\run-login.ps1 -Headed -KeepOpen
```

La primera prueba debe mostrar Chrome y terminar en BeyondInsight Password Safe. Cierre la ventana para finalizar el proceso.

## Ejecución desatendida

```powershell
.\scripts\run-login.ps1
```

El proceso devuelve código `0` si inició sesión correctamente y `1` si falló. En un fallo guarda una captura y un informe sin secretos dentro de `run-artifacts`.

## Solicitar los 14 accesos

Para abrir la interfaz de prueba, haga doble clic en `INICIAR_PRUEBA.cmd`. Este lanzador abre una terminal visible, formula las tres preguntas y ejecuta únicamente la validación del primer formulario. No incluye `-Execute` y, por tanto, no crea solicitudes, no envía correo y no abre el Bloc de notas con IDs.

Para ejecutar el proceso real, haga doble clic en `INICIAR_AUTOMATIZACION.cmd`. Este segundo lanzador sí incluye `-Execute`: crea o recupera las 14 solicitudes `Pending` y, según la tercera respuesta, envía el correo (`S`) o abre los IDs en el Bloc de notas (`N`). El navegador funciona de forma desatendida para reducir el tiempo del proceso; la terminal permanece visible para las preguntas y el resultado.

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
¿Desea que envié el correo por usted? S/N: 
```

La fecha acepta únicamente día y mes, por ejemplo `01/08`. El año se añade automáticamente usando el año vigente en Ecuador. La hora se introduce en formato de 24 horas: `14:00` se confirma como `02:00 PM` y se envía técnicamente como `14:00` al control web.

La tercera respuesta acepta `S` o `N`, sin distinguir entre mayúsculas y minúsculas. `S` indica que, al finalizar una ejecución real con 14 IDs, debe enviarse el correo por Outlook clásico. `N` evita el envío, escribe los IDs —uno por línea— en `run-results\REQUEST_IDS.txt` y abre ese archivo en un nuevo Bloc de notas.

La interfaz elimina los espacios al inicio y al final de cada respuesta. Si una respuesta está vacía o no tiene el formato correcto, muestra el motivo y repite la misma pregunta. No continúa ni cierra la interfaz hasta recibir los tres valores válidos. Para cancelar voluntariamente, presione `Ctrl+C`; el proceso mostrará el mensaje de cancelación y no iniciará o detendrá la automatización.

Sin `-Execute`, el primer formulario se completa, valida y descarta sin crear solicitudes. Para ejecutar las 14 solicitudes reales use:

```powershell
.\scripts\run-access-requests.ps1 -Execute -Headed
```

También se pueden proporcionar los valores directamente para una ejecución no interactiva:

```powershell
.\scripts\run-access-requests.ps1 -Date '01/08' -StartTime '14:00' -Email 'N' -Headed
```

La duración continúa siendo 8 horas y la razón está definida en el código. El flujo consulta exclusivamente el estado `Pending` para comprobar solicitudes equivalentes y extraer sus Request ID. No abre ni consulta el estado `Approved`.

El lanzador final de doble clic está implementado como `INICIAR_AUTOMATIZACION.cmd`. No se requiere un `.exe`: el archivo CMD inicia el mismo flujo de PowerShell y Node.js instalado en esta carpeta.

Los Request ID de la última ejecución se guardan en `run-results\last-run.json`. Si se respondió `N`, también se guardan como texto en `run-results\REQUEST_IDS.txt` y se abre el archivo con el Bloc de notas.

Cuando una ejecución real termina con exactamente 14 ID únicos, genera `run-results\CORREO_ACCESOS_PAM.md` y `run-results\CORREO_ACCESOS_PAM.html` a partir de [`EMAIL_TEMPLATE.md`](EMAIL_TEMPLATE.md) y [`EMAIL_TEMPLATE.html`](EMAIL_TEMPLATE.html). Los archivos contienen el correo completo con una tabla ya armada y un ID por línea. La automatización solo sustituye el marcador de la plantilla; no vuelve a construir la tabla en Outlook.

Los ID no están fijados en el código. Cada correo usa exclusivamente `requestIds` de la última ejecución y comprueba que coincidan con exactamente 14 registros en estado `Pending`. Por ejemplo, una ejecución para el 4 de agosto usará los 14 ID nuevos de esa ejecución, no los obtenidos para el 1 de agosto.

## Método activo: Outlook clásico

Este equipo tiene Outlook clásico instalado y el perfil `Outlook` expone exactamente una cuenta `tellezoe@hitss.com` mediante COM. El proceso no usa coordenadas ni controla visualmente la pantalla.

### Configurar Para y CC

Edite [`mail-config.json`](mail-config.json) antes de una ejecución real. El campo `recipient` es el destinatario principal y `cc` contiene hasta tres espacios preparados para las copias:

```json
{
  "sender": "tellezoe@hitss.com",
  "recipient": "tellezoe@hitss.com",
  "cc": [
    "",
    "",
    ""
  ],
  "subject": "ACCESOS AL PAM"
}
```

Escriba cada dirección de copia entre comillas, por ejemplo `"persona@hitss.com"`. Los espacios vacíos se ignoran. Todas las direcciones se validan, no pueden repetirse y el destinatario principal no puede aparecer nuevamente en `cc`. Para las pruebas actuales, `recipient` continúa siendo `tellezoe@hitss.com` y las tres copias permanecen vacías.

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
- Los tokens de Outlook se guardan cifrados con DPAPI mediante Microsoft Authentication Extensions for Node.
- El envío de correo solicita únicamente el permiso delegado `Mail.Send`.
- La ejecución predeterminada de `run-email.ps1` solo genera una vista previa; `-Send` es obligatorio para enviar.
- La ejecución predeterminada de `run-outlook-classic.ps1` crea únicamente un borrador; también exige `-Send` para enviarlo.
- La decisión final se valida como `S` o `N`: `S` envía por Outlook clásico y `N` abre los 14 IDs en el Bloc de notas sin enviar correo.
- El destinatario principal y las copias se leen exclusivamente de `mail-config.json`; no están fijados dentro del script de Outlook.
- Los secretos cifrados y artefactos de ejecución están excluidos de Git.

## Limitación de seguridad

Guardar la contraseña y la semilla TOTP en el mismo equipo elimina la separación efectiva de factores. Para producción, es preferible que BeyondTrust proporcione una cuenta de automatización con privilegios mínimos o una API con credenciales rotables. Revocar el usuario, restablecer el TOTP o cambiar la contraseña requiere volver a ejecutar `setup-secrets.ps1`.
