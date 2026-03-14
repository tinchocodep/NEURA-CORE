-- Add Colpy config to contable_config
ALTER TABLE "public"."contable_config"
ADD COLUMN IF NOT EXISTS "colpy_username" text,
ADD COLUMN IF NOT EXISTS "colpy_password" text,
ADD COLUMN IF NOT EXISTS "colpy_empresa_id" text;

-- Add Colpy remote ID to clientes
ALTER TABLE "public"."contable_clientes"
ADD COLUMN IF NOT EXISTS "colpy_id" text;

-- Add Colpy remote ID to proveedores
ALTER TABLE "public"."contable_proveedores"
ADD COLUMN IF NOT EXISTS "colpy_id" text;

-- Add Colpy ID to contable_comprobantes (to know if it was injected with Colpy, instead of Xubio)
ALTER TABLE "public"."contable_comprobantes"
ADD COLUMN IF NOT EXISTS "colpy_id" text;
