-- SQL: Añadir columna orden_pago_id a treasury_transactions
ALTER TABLE public.treasury_transactions
ADD COLUMN orden_pago_id UUID REFERENCES public.tesoreria_ordenes_pago(id) ON DELETE SET NULL;
