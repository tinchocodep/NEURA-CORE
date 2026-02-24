-- Drop existing policies if they conflict (usually better to just be explicit)
DROP POLICY IF EXISTS "Users can view transactions in their tenant" ON public.treasury_transactions;
DROP POLICY IF EXISTS "Users can insert transactions in their tenant" ON public.treasury_transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON public.treasury_transactions;
DROP POLICY IF EXISTS "Admins can delete transactions" ON public.treasury_transactions;

-- 1. VIEW Policy: 
-- Superadmin/Admin see all in their tenant.
-- Regular users see ONLY transactions belonging to accounts assigned to them.
CREATE POLICY "Users can view transactions aligned with their assigned accounts" ON public.treasury_transactions
FOR SELECT USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'superadmin'
  OR
  (
     (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
     AND
     tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
  OR
  (
     tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
     AND 
     account_id IN (
        SELECT id FROM public.treasury_accounts WHERE assigned_user_id = auth.uid() OR assigned_user_id IS NULL
     )
  )
);

-- 2. INSERT Policy:
-- Superadmin/Admin insert all in their tenant.
-- Regular users insert ONLY transactions belonging to accounts assigned to them.
CREATE POLICY "Users can insert transactions for their assigned accounts" ON public.treasury_transactions
FOR INSERT WITH CHECK (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'superadmin'
  OR
  (
     (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
     AND
     tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
  OR
  (
     tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
     AND 
     account_id IN (
        SELECT id FROM public.treasury_accounts WHERE assigned_user_id = auth.uid() OR assigned_user_id IS NULL
     )
  )
);

-- 3. UPDATE / DELETE (Usually Admins only for financial records)
CREATE POLICY "Admins can update transactions" ON public.treasury_transactions
FOR UPDATE USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);

CREATE POLICY "Admins can delete transactions" ON public.treasury_transactions
FOR DELETE USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('superadmin', 'admin')
);
