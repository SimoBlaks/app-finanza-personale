import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import ProtezioneErrori from './ProtezioneErrori'

const sezioni = [
  { a: '/', etichetta: 'Dashboard', icona: '◧', esatto: true },
  { a: '/transazioni', etichetta: 'Transazioni', icona: '⇄' },
  { a: '/investimenti', etichetta: 'Investimenti', icona: '↗' },
  { a: '/impostazioni', etichetta: 'Impostazioni', icona: '⚙' },
]

// Sugli schermi larghi il menu laterale si può ridurre alle sole icone; la scelta resta su questo dispositivo.
const CHIAVE_MENU = 'menu-compatto'
function menuSalvato() {
  try { return localStorage.getItem(CHIAVE_MENU) === 'si' } catch { return false }
}

export default function Layout() {
  const { pathname } = useLocation()
  const [compatto, setCompattoStato] = useState(menuSalvato)
  const cambiaMenu = () => {
    setCompattoStato(!compatto)
    try { localStorage.setItem(CHIAVE_MENU, compatto ? 'no' : 'si') } catch { /* non salvata: vale solo per questa visita */ }
  }

  return (
    <div className={`app ${compatto ? 'menu-compatto' : ''}`}>
      <nav className="navigazione">
        <div className="marchio">
          <span className="testo-nav">Finanza personale</span>
          <button
            className="riduci-menu"
            onClick={cambiaMenu}
            aria-label={compatto ? 'Allarga il menu' : 'Riduci il menu'}
            title={compatto ? 'Allarga il menu' : 'Riduci il menu'}
          >
            {compatto ? '»' : '«'}
          </button>
        </div>
        {sezioni.map((s) => (
          <NavLink key={s.a} to={s.a} end={s.esatto} className="voce-nav" title={compatto ? s.etichetta : undefined}>
            <span className="icona" aria-hidden="true">{s.icona}</span>
            <span className="testo-nav">{s.etichetta}</span>
          </NavLink>
        ))}
        <button className="esci" onClick={() => supabase.auth.signOut()} aria-label="Esci" title={compatto ? 'Esci' : undefined}>
          <span className="icona-esci" aria-hidden="true">⏻</span>
          <span className="testo-nav">Esci</span>
        </button>
      </nav>
      <main className="contenuto">
        {/* la key azzera l'errore quando si cambia sezione */}
        <ProtezioneErrori key={pathname}>
          <Outlet />
        </ProtezioneErrori>
      </main>
    </div>
  )
}
