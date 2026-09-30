ALTER POLICY "leads_select_all" ON public.leads USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "leads_insert" ON public.leads WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "leads_update" ON public.leads USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "leads_delete" ON public.leads USING (((auth.uid() = owner_id) OR (auth.uid() = created_by) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "activities_select_all" ON public.activities USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "activities_insert" ON public.activities WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "activities_update" ON public.activities USING (((auth.uid() = user_id) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())) WITH CHECK (((auth.uid() = user_id) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "activities_delete" ON public.activities USING (((auth.uid() = user_id) OR is_manager(auth.uid())) AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "profiles_select_all" ON public.profiles USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "import_batches_select_all" ON public.import_batches USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "import_batches_insert" ON public.import_batches WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "teamleader_contacts_select_all" ON public.teamleader_contacts USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "teamleader_contacts_insert" ON public.teamleader_contacts WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "teamleader_contacts_update" ON public.teamleader_contacts USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
ALTER POLICY "teamleader_contacts_delete" ON public.teamleader_contacts USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

ALTER POLICY "user_roles_select_all" ON public.user_roles USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));