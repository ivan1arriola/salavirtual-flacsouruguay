# CI de SalaVirtual en runner propio

## Estado y objetivo

El repositorio privado `ivan1arriola/salavirtual-flacsouruguay` realiza cinco trabajos pesados en GitHub Actions: esquema/TypeScript, tests y cobertura, auditoría, build y PostgreSQL integrado. El sexto trabajo, `Validación completa · Deploy gate`, queda en GitHub-hosted para resumir resultados y mantener el flujo automático de despliegue desde `main`.

Esta configuración añade una **opción**, no activa un servidor automáticamente:

- `SALAVIRTUAL_CI_RUNNER` **no definida** (valor recomendado hasta instalar): `ubuntu-24.04` de GitHub.
- `SALAVIRTUAL_CI_RUNNER=self-hosted`: los cinco trabajos usan el runner que tenga las etiquetas `self-hosted`, `linux`, `x64`, `salavirtual-ci`.
- Si la variable se activa sin un runner libre y conectado, los trabajos quedarán **en cola**; no hay fallback dinámico cuando un runner self-hosted está desconectado.
- Volver a GitHub-hosted: borrar la variable o cambiarla a `github`. No es necesario cambiar el YAML.

## Diseño recomendado

**No instalar el runner en ISPConfig/producción** (`i-076bdbb899b710abe`, `t3a.large`) ni en las otras instancias con aplicaciones. Los PR ejecutan código arbitrario del repositorio, `npm ci`, procesos Node y contenedores PostgreSQL. La máquina con el runner no debe compartir disco, usuarios ni secretos con producción.

Usar una instancia EC2 o VM **separada y descartable** que:

1. tenga Linux x86_64, suficiente RAM/CPU para build + Vitest (empezar con al menos 2 vCPU y 8 GiB y ajustar según mediciones);
2. pueda salir a GitHub y npm por HTTPS 443; sin puertos públicos de entrada para el runner;
3. no tenga IAM con permisos de producción, acceso a PostgreSQL real ni archivos `.env.production`; deshabilitar credenciales IMDS en esta instancia cuando sea posible;
4. ejecute los tests con **base local descartable**, Docker y el servicio PostgreSQL 17 del workflow; nunca apuntar a la base real;
5. separe permisos del usuario del runner, mantenga paquetes actualizados y evite PR de autores no confiables;
6. idealmente use runner efímero y destruya su VM/volumen tras cada ejecución, especialmente si hay colaboradores externos. Un runner persistente reutiliza el estado y requiere más mantenimiento y protección.

## Alta del runner (después de preparar la VM aislada)

1. Ir a **GitHub > Settings > Actions > Runners > New self-hosted runner** del repositorio.
2. Elegir Linux x64. Ejecutar **solo en la VM de CI** los comandos que GitHub muestra para descargar la versión compatible del runner y registrar su token temporal.
3. Durante el registro indicar la etiqueta adicional `salavirtual-ci` (por ejemplo `./config.sh --url https://github.com/ivan1arriola/salavirtual-flacsouruguay --token TOKEN_TEMPORAL --labels salavirtual-ci`). No guardar el token en el repositorio ni en los logs; seguir la guía de GitHub para runners efímeros cuando se automatice.
4. Instalar Docker con servicio activo y acceso para el usuario de runner. Instalar Node.js 24 y las dependencias de sistema de la build; el workflow utiliza `actions/setup-node@v7` y `npm ci`.
5. Verificar que el runner aparece **Online** en GitHub y que soporta los servicios de contenedor del trabajo PostgreSQL.
6. En **Settings > Secrets and variables > Actions > Variables**, crear `SALAVIRTUAL_CI_RUNNER` con el valor `self-hosted`.
7. Abrir un PR de prueba y comprobar los cinco trabajos, sus logs, el gate y el despliegue de `main`; verificar que ninguno corre en el EC2 de producción.

### Retorno inmediato a GitHub-hosted

Borrar `SALAVIRTUAL_CI_RUNNER` y ejecutar de nuevo el workflow. Los trabajos ya en cola pueden requerir cancelarse/reintentarse.

## Consumo y costos

En GitHub-hosted los cinco trabajos pesados consumen minutos de las máquinas de GitHub. Con self-hosted la CPU se consume en AWS; **no es costo cero**: se pagan EC2, EBS, tráfico y la operación del runner. Consultar el estado actual de facturación de Actions, ya que GitHub anunció y luego pospuso el cargo adicional de control plane para self-hosted en diciembre de 2025.

Mantener `concurrency.cancel-in-progress: true` en `test-coverage.yml`, para cancelar ejecuciones obsoletas cuando llega un commit nuevo al PR. El runner no debe utilizar credenciales de despliegue. `deploy-ec2.yml` continúa en GitHub-hosted con OIDC y solo despliega si CI finaliza correctamente en `main`.

## Verificación previa a activación

- [ ] Instancia separada de producción con recursos suficientes
- [ ] Runner etiquetado `salavirtual-ci` y Online
- [ ] Docker funcional para Postgres integrado
- [ ] Sin IAM, secretos o redes de producción
- [ ] Mecanismo de limpieza/aislamiento (preferentemente efímero)
- [ ] PR de prueba satisfactorio
- [ ] Variable `SALAVIRTUAL_CI_RUNNER` activada recién al final
