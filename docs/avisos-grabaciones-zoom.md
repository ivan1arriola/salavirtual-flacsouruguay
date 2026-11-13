# Avisos de grabaciones Zoom

El worker de archivos Zoom envía un correo individual al docente del encuentro y a todas las cuentas
activas de administración con correo. Incluye los enlaces de Drive de **todos los archivos de Zoom**
de la ocurrencia: video, audio, transcripciones y otros archivos conservados.

Se prepara el aviso cuando la ocurrencia está vinculada de forma inequívoca a un encuentro, su carpeta
está en el destino de vinculados, el último inventario no tiene errores ni procesamiento pendiente, hay
al menos un MP4 y todos los archivos inventariados están `CONSERVADO` con ID de Drive. Una grabación
histórica sin encuentro vinculado no se envía a un docente incorrecto. Un nuevo archivo descubierto antes
del envío pausa el aviso hasta que termine su transferencia.

Antes de enviar cada correo, el worker otorga lectura en Drive a **ese correo** para cada archivo. Nunca
usa el permiso público «Cualquier persona con el enlace» ni comparte la planilla de asistencia de Drive.
La API de Drive puede impedir compartir archivos según la política institucional; en ese caso el correo
no se envía y el permiso se reintenta en el siguiente ciclo. La cuenta destinataria debe poder usar Drive.

`AvisoGrabacionZoom` registra un envío por ocurrencia y destinatario; una aceptación confirmada no se
repite. Si el proveedor indica que el correo no está configurado, el aviso queda en `ERROR` para
reintentar. Si el resultado de envío es ambiguo o el worker cae durante el envío, queda `RESERVADO` y
requiere revisión manual antes de volver a enviarlo, para evitar duplicados. El correo no contiene datos
de asistencia ni enlaces de descarga de Zoom.

Aplicar la migración `20261113170000_zoom_recording_email` antes de iniciar el worker actualizado.
