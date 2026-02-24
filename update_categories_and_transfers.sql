-- 1. Ensure a clear way to mark categories as internal transfers
ALTER TABLE public.treasury_categories ADD COLUMN IF NOT EXISTS is_internal_transfer BOOLEAN DEFAULT FALSE;

-- 2. Add a pairing ID to treasury_transactions to link the source and destination of a transfer
ALTER TABLE public.treasury_transactions ADD COLUMN IF NOT EXISTS transfer_pair_id UUID;

-- 3. Pre-seed an 'Internal Transfer' category for existing tenants (if none exists)
DO $$
DECLARE
    t_record RECORD;
BEGIN
    FOR t_record IN SELECT id FROM public.tenants
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.treasury_categories 
            WHERE tenant_id = t_record.id AND is_internal_transfer = TRUE
        ) THEN
            INSERT INTO public.treasury_categories (tenant_id, name, type, is_internal_transfer)
            VALUES (t_record.id, 'Transferencia Interna (Fondeo)', 'expense', TRUE);
            -- Note: We insert one for expense. Often we might need one for income as well, or just handle logic in the app.
            
            INSERT INTO public.treasury_categories (tenant_id, name, type, is_internal_transfer)
            VALUES (t_record.id, 'Transferencia Interna (Recepción)', 'income', TRUE);
        END IF;
    END LOOP;
END;
$$;
