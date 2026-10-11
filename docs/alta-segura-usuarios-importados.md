# Alta segura de usuarios importados

El script `scripts/migrate-legacy-users.ts` ya no genera la misma contraseña temporal para usuarios importados sin credenciales previas.

- Conserva los hashes de contraseñas existentes cuando el sistema legacy los proporciona.
- Conserva el acceso mediante Google para las cuentas vinculadas.
- Para cuentas nuevas sin credenciales, no crea una contraseña predeterminada: la persona puede solicitar un enlace de recuperación desde `/recuperar-contrasena` utilizando su correo registrado.
- Una importación con cuentas sin contraseña, sin Google y sin correo de activación se bloquea antes de escribir datos.
- La importación no modifica los hashes de los usuarios existentes cuando actualiza sus datos.

## Antes de ejecutar --apply

1. Ejecutar el modo dry-run y revisar `usersRequiringActivation` y `activationWithoutEmail`.
2. Corregir los correos faltantes en la fuente antes de importar.
3. Confirmar la capacidad de envío de correos del sistema.
4. Informar a los usuarios que deberán utilizar la recuperación de contraseña para activar el acceso local.
5. Comprobar el flujo de recuperación y el inicio de sesión con una cuenta de prueba.

El cambio no elimina la columna histórica `passwordInicialCifrada` ni afecta contraseñas existentes. Su retirada requiere una migración posterior con auditoría de datos y revisión de accesos.
