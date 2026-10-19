import { NavLink, Outlet } from 'react-router-dom'

const schede = [
  { a: 'categorie', etichetta: 'Categorie' },
  { a: 'persone', etichetta: 'Persone' },
  { a: 'asset', etichetta: 'Asset' },
  { a: 'generali', etichetta: 'Saldo e soglie' },
]

export default function Impostazioni() {
  return (
    <section>
      <h1>Impostazioni</h1>
      <div className="schede">
        {schede.map((s) => (
          <NavLink key={s.a} to={s.a} className="scheda-link">{s.etichetta}</NavLink>
        ))}
      </div>
      <Outlet />
    </section>
  )
}
