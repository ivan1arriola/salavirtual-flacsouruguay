UPDATE "CuentaProveedor" AS cuenta
SET "limiteConcurrente" = 1
FROM "ProveedorReunion" AS proveedor
WHERE cuenta."proveedorId" = proveedor.id
  AND proveedor.tipo = 'ZOOM'
  AND cuenta."limiteConcurrente" IS DISTINCT FROM 1;
