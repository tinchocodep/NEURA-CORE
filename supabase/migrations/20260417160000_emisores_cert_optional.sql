-- Hacer cert_pem y key_pem opcionales en facturacion_emisores.
-- Caso de uso: un tenant puede querer cargar su razon social solo para
-- descargar comprobantes desde ARCA (sync) sin emitir facturas. La emision
-- si requiere cert+key; la descarga via afipsdk.com NO.
--
-- Un emisor sin cert/key = solo descarga. Con cert/key = descarga + emision.

alter table facturacion_emisores
  alter column cert_pem drop not null,
  alter column key_pem drop not null;

comment on column facturacion_emisores.cert_pem is
  'Certificado .crt en PEM. Opcional: sin cert, el emisor solo sirve para sincronizar comprobantes desde ARCA, no para emitir.';
comment on column facturacion_emisores.key_pem is
  'Clave privada .key en PEM. Opcional: sin key, el emisor solo sirve para sincronizar, no para emitir.';
