import { Navigate, Route, Routes } from 'react-router-dom'
import { useSessione } from './auth/Sessione'
import Accesso from './auth/Accesso'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Transazioni from './pages/Transazioni'
import Investimenti from './pages/Investimenti'
import Impostazioni from './pages/impostazioni/Impostazioni'
import Categorie from './pages/impostazioni/Categorie'
import Persone from './pages/impostazioni/Persone'
import Asset from './pages/impostazioni/Asset'
import Generali from './pages/impostazioni/Generali'

function SoloAutenticato({ children }) {
  const sessione = useSessione()
  if (sessione === undefined) return <p className="caricamento">Caricamento…</p>
  if (!sessione) return <Navigate to="/accesso" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/accesso" element={<Accesso />} />
      <Route
        path="/"
        element={
          <SoloAutenticato>
            <Layout />
          </SoloAutenticato>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="transazioni" element={<Transazioni />} />
        <Route path="investimenti" element={<Investimenti />} />
        <Route path="impostazioni" element={<Impostazioni />}>
          <Route index element={<Navigate to="categorie" replace />} />
          <Route path="categorie" element={<Categorie />} />
          <Route path="persone" element={<Persone />} />
          <Route path="asset" element={<Asset />} />
          <Route path="generali" element={<Generali />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
