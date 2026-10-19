import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const ContestoSessione = createContext(null)

export function SessioneProvider({ children }) {
  const [sessione, setSessione] = useState(undefined) // undefined = ancora in caricamento

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessione(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessione(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return <ContestoSessione.Provider value={sessione}>{children}</ContestoSessione.Provider>
}

export const useSessione = () => useContext(ContestoSessione)
