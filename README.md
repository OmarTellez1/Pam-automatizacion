## Automatización del pam

- Realizado por Omar Téllez

## Instalación única

Abra PowerShell en esta carpeta y ejecute:

```powershell
npm install
```

## Seguridad de los Request ID temporales

Antes de cada ejecución real o de prueba se eliminan los resultados, el manifiesto y el HTML temporal que pudieran pertenecer a una ejecución anterior. El lanzador acepta únicamente un resultado creado después del inicio de la ejecución actual.

Cuando Outlook confirma un envío, el resultado se convierte en un recibo sin `requestIds` ni solicitudes `pending`, y se eliminan el manifiesto y el HTML que contenían los IDs. La protección contra correos duplicados conserva solamente una huella SHA-256 y la cantidad de IDs, no la lista reutilizable.

La llamada COM `MailItem.Send()` solo coloca inicialmente el mensaje en la cola de Outlook. Antes de crear un mensaje nuevo, la aplicación mueve a `Borradores` cualquier correo del mismo asunto que una ejecución anterior haya dejado en `Bandeja de salida`; esta operación es recuperable y evita que Outlook lo transmita horas después. La aplicación no fuerza un `Enviar y recibir` global. Después espera hasta 60 segundos y considera exitoso el correo únicamente cuando encuentra ese asunto y todos los Request ID de la ejecución actual en la carpeta `Enviados` de la cuenta configurada. Si el mensaje actual continúa en `Bandeja de salida`, lo mueve a `Borradores`, conserva el resultado sin consumir y muestra un error específico.
