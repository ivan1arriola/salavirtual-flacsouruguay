-- Las nueve cuentas pertenecen a la misma cuenta institucional Zoom y usan
-- el OAuth de servidor; no se guarda ninguna contraseña individual.
INSERT INTO "CuentaProveedor" (
  "id", "proveedorId", "nombre", "emailOrganizador", "externalAccountId",
  "prioridad", "tieneLicencia", "limiteConcurrente", "activa", "createdAt", "updatedAt"
)
SELECT
  'zoom-host-sala' || LPAD(numero::text, 2, '0'),
  proveedor.id,
  'Sala Zoom ' || LPAD(numero::text, 2, '0'),
  'sala' || LPAD(numero::text, 2, '0') || '@flacso.edu.uy',
  'sala' || LPAD(numero::text, 2, '0') || '@flacso.edu.uy',
  numero, true, 1, true, NOW(), NOW()
FROM "ProveedorReunion" AS proveedor
CROSS JOIN generate_series(1, 9) AS numero
WHERE proveedor.tipo = 'ZOOM'
  AND NOT EXISTS (
    SELECT 1 FROM "CuentaProveedor" AS existente
    WHERE existente."proveedorId" = proveedor.id
      AND LOWER(existente."emailOrganizador") = 'sala' || LPAD(numero::text, 2, '0') || '@flacso.edu.uy'
  )
ON CONFLICT DO NOTHING;
