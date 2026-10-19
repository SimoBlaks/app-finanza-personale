import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useSessione } from './Sessione'

export default function Accesso() {
  const sessione = useSessione()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)

  if (sessione) return <Navigate to="/" replace />

  async function accedi(e) {
    e.preventDefault()
    setErrore('')
    setInvio(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setInvio(false)
    if (error) setErrore('Email o password non corretti.')
  }

  return (
    <div className="accesso">
      <form className="scheda accesso-scheda" onSubmit={accedi}>
        <h1>Finanza personale</h1>
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {errore && <p className="errore">{errore}</p>}
        <button className="primario" disabled={invio}>{invio ? 'Accesso…' : 'Accedi'}</button>
      </form>
    </div>
  )
}
