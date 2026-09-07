## Automatización del pam

- Realizado por Omar Téllez

## Instalación única

Abra PowerShell en esta carpeta y ejecute:

```powershell
npm install
```

## Estructura del código

Los módulos de `src` están agrupados por responsabilidad:

- `auth`: inicio de sesión, sesión del navegador y códigos TOTP.
- `requests`: configuración, ejecución y resultados de solicitudes PAM.
- `email`: configuración, preparación y envío mediante Outlook clásico.
- `automation`: coordinación de ejecuciones, simulación y acción final.
- `config`: archivos de entorno e inicialización de la configuración local.
- `server`: servidor de la interfaz web local.

Al iniciar la interfaz se ejecuta una limpieza automática de retención. Se eliminan de forma recursiva únicamente los archivos con más de 48 horas dentro de `.playwright-cli`, `logs` y `run-artifacts`; las carpetas se conservan. `state`, `run-results`, `.env` y `.env.mail` no participan en esta limpieza.

## Abrir solamente una sesión autenticada de PAM

Ejecute `ABRIR_SESION_PAM.cmd` para abrir una ventana nueva en el perfil habitual de Google Chrome, conservando sus sesiones, extensiones y preferencias de descarga. El lanzador entra por `https://10.30.17.117/webconsole/dashboard`, utiliza `BI_USERNAME`, `BI_PASSWORD` y `BI_TOTP_SECRET` desde `.env`, completa el login cuando el portal lo solicita, confirma la sesión, ajusta la página al 67% de zoom y la deja disponible para uso manual. No crea solicitudes ni envía correos. La terminal se cierra automáticamente después del login y Chrome permanece abierto.

## Seguridad de los Request ID temporales

Antes de cada ejecución real o de prueba se eliminan los resultados, el manifiesto y el HTML temporal que pudieran pertenecer a una ejecución anterior. El lanzador acepta únicamente un resultado creado después del inicio de la ejecución actual.

Cuando Outlook confirma un envío, el resultado se convierte en un recibo sin `requestIds` ni solicitudes `pending`, y se eliminan el manifiesto y el HTML que contenían los IDs. La protección contra correos duplicados conserva solamente una huella SHA-256 y la cantidad de IDs, no la lista reutilizable.

La llamada COM `MailItem.Send()` solo coloca inicialmente el mensaje en la cola de Outlook. Antes de crear un mensaje nuevo, la aplicación mueve a `Borradores` cualquier correo del mismo asunto que una ejecución anterior haya dejado en `Bandeja de salida`; esta operación es recuperable y evita que Outlook lo transmita horas después. La aplicación no fuerza un `Enviar y recibir` global. Después espera hasta 60 segundos y considera exitoso el correo únicamente cuando encuentra ese asunto y todos los Request ID de la ejecución actual en la carpeta `Enviados` de la cuenta configurada. Si el mensaje actual continúa en `Bandeja de salida`, lo mueve a `Borradores`, conserva el resultado sin consumir y muestra un error específico.
