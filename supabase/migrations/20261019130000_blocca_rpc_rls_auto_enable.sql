-- rls_auto_enable è la funzione dell'event trigger "ensure_rls" creata da Supabase:
-- attiva l'RLS su ogni nuova tabella di public. Va tenuta, ma non deve essere
-- richiamabile via API (/rest/v1/rpc). L'event trigger continua a funzionare,
-- perché il permesso EXECUTE non viene controllato quando scatta un trigger.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
