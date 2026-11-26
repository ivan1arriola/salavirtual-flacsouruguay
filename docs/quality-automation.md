# Automatización de calidad

La CI existente conserva su deploy gate. Este workflow adicional inicia una línea base de duplicación,
ShellCheck y riesgos de migración. Gitleaks informa fallos por secretos detectados sin publicar valores.
Los informes de diagnóstico se conservan 14 días.

Se ejecuta por pull request, manualmente y los lunes a las 03:30 de Uruguay.

El detector SQL es heurístico: no sustituye revisión de migraciones, backups ni pruebas PostgreSQL.
Las rutas externas y los scripts operativos requieren revisión humana antes de eliminarse.

## Próximas fases

- Validar línea base y hacer bloqueantes las regresiones, no los hallazgos históricos.
- Incorporar análisis de seguridad estática y de workflows.
- Añadir Playwright, axe y contratos API con datos ficticios y entorno aislado.
- Incorporar Stryker, Lighthouse, tamaño del bundle y recursos estáticos bajo demanda.
- Revisar licencias y ampliar smoke tests del despliegue existente.

No se modifican credenciales, configuración AWS, permisos de producción ni datos institucionales.
