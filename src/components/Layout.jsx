import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../supabase'

const sezioni = [
  { a: '/', etichetta: 'Dashboard', icona: '◧', esatto: true },
  { a: '/transazioni', etichetta: 'Transazioni', icona: '⇄' },
  { a: '/investimenti', etichetta: 'Investimenti', icona: '↗' },
  { a: '/impostazioni', etichetta: 'Impostazioni', icona: '⚙' },
]

export default function Layout() {
  return (
    <div className="app">
      <nav className="navigazione">
        <div className="marchio">Finanza personale</div>
        {sezioni.map((s) => (
          <NavLink key={s.a} to={s.a} end={s.esatto} className="voce-nav">
            <span className="icona" aria-hidden="true">{s.icona}</span>
            <span>{s.etichetta}</span>
          </NavLink>
        ))}
        <button className="esci" onClick={() => supabase.auth.signOut()}>Esci</button>
      </nav>
      <main className="contenuto">
        <Outlet />
      </main>
    </div>
  )
}
