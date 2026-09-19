# Scripts operativos y manuales

Los jobs periódicos operativos se ejecutan por Route Handlers y delegan en `src/bootstrap`: reportes mensuales y sincronización de archivos.

Los scripts con `--apply` son intervenciones administrativas manuales. No se ejecutan por cron ni desde una ruta HTTP. Deben conservar su variante `:dry`, requerir `--apply` explícito y revisarse contra una base no productiva antes de cualquier ejecución.

Las migraciones `migrate-*`, restauraciones, importaciones legacy, diagnósticos y `deploy-ec2.sh` son herramientas históricas u operativas de administración; no son casos de uso programados. Su frontera de seguridad es la confirmación explícita del operador y el dry-run cuando exista.
