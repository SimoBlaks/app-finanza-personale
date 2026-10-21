import { NavLink, Outlet } from 'react-router-dom'
import InterruttoreCifre from '../../components/Riservatezza'
import SceltaTema from '../../components/Tema'

const schede = [
  { a: 'categorie', etichetta: 'Categorie' },
  { a: 'scorciatoie', etichetta: 'Scorciatoie' },
  { a: 'persone', etichetta: 'Persone' },
  { a: 'asset', etichetta: 'Asset' },
  { a: 'generali', etichetta: 'Saldo e soglie' },
  { a: 'esporta', etichetta: 'Esporta' },
]

export default function Impostazioni() {
  return (
    <section>
      <h1>Impostazioni</h1>
      <div className="scheda riservatezza">
        <SceltaTema />
        <InterruttoreCifre etichetta="Nascondi le cifre nella dashboard" />
        <p className="nota">Tema e cifre nascoste valgono solo su questo dispositivo. "Automatico" segue l'impostazione del telefono.</p>
      </div>
      <div className="schede">
        {schede.map((s) => (
          <NavLink key={s.a} to={s.a} className="scheda-link">{s.etichetta}</NavLink>
        ))}
      </div>
      <Outlet />
    </section>
  )
}
