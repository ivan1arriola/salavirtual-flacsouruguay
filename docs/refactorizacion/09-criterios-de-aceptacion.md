# Criterios de aceptación y Definition of Done

## Por PR

- [ ] Vinculado a una épica/tarea y a IDs del inventario afectados.
- [ ] Contratos funcionales preservados, o cambio explícitamente aprobado y documentado.
- [ ] Guard de servidor y alcance de datos verificados con casos negativos.
- [ ] Componentes compartidos y tokens usados cuando corresponda.
- [ ] Estados de carga, vacío, error, permisos y dato no disponible revisados.
- [ ] Navegación, foco, teclado y lector de pantalla comprobados según impacto.
- [ ] Evidencia antes/después en escritorio, tablet y móvil, con datos sintéticos o anonimizados.
- [ ] Pruebas de regresión de comportamiento, no solo coincidencias de texto CSS.
- [ ] CI completo verde: TypeScript, esquema, ESLint, Prettier, Knip, arquitectura, tests/cobertura, auditoría, build, PostgreSQL integrado y gate.
- [ ] Plan de rollback y documentación actualizados; sin secretos ni datos sensibles.

## Matriz mínima de tareas críticas

- A: crear serie Zoom, cambiar horario y cancelar con alcance correcto; consultar Meet histórico; identificar cobertura pendiente, asignar/reasignar/desasignar; verificar disponibilidad; gestionar usuarios/programas; consultar y descargar archivos autorizados; revisar diagnóstico.
- D: ingresar, completar registro cuando corresponda, programar reunión dentro de programa, consultar próximas y anteriores, acceder a asistencia y grabaciones autorizadas.
- T: localizar asignación, postular a cobertura elegible, consultar estado, operar encuentro asignado, registrar horas y consultar histórico; denegar operación de encuentro ajeno.
- Todos: navegar atrás, seleccionar opción actual del menú móvil, recuperar contraseña, gestionar preferencias y notificaciones según política.

Variantes: Zoom/Meet, futuro/en curso/finalizado/cancelado/no iniciado según modelo real, ausencia de registros, error de proveedor, datos largos, red lenta, permisos denegados. No producir mutaciones en reuniones reales para validar.

## Evidencia visual y accesibilidad

Usar al menos 360, 768 y 1440 px como referencia; comprobar 320 px, zoom 200%, orientación horizontal y reflow cuando aplique. Probar navegación por teclado, foco tras cierre, objetivos táctiles, contraste, nombres accesibles, lectura de estados y alternativas al color. Los tests estáticos son apoyo, no una certificación WCAG. Documentar navegador, rol, datos y estado de cada captura.

## Comandos existentes

Ejecutar npm run format:check, npm run lint, npm run check, npm run validate:schema, npm run architecture, npm run deadcode, npm test y npm run build según alcance; CI completo sigue siendo obligatorio. Usar las versiones declaradas en el repo y npm ci. No saltar validaciones para desplegar.

## Puertas de fase

- E01/E02: inventario, permisos y arquitectura aprobados.
- E03/E04: piloto y shell por rol aprobados.
- E05–E08: recorridos críticos académicos y de monitoreo con paridad.
- E09–E12: acceso completo a recursos y administración.
- E14: inventario reconciliado, consumidores revisados, rollback comprobado y documentación vigente.
