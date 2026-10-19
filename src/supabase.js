import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chiave = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !chiave) {
  throw new Error('Mancano VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY: copia .env.example in .env e compila i valori.')
}

export const supabase = createClient(url, chiave)
