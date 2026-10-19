import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { SessioneProvider } from './auth/Sessione'
import { ConfermaProvider } from './components/Conferma'
import App from './App'
import './stile.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* indirizzi con # (es. /#/transazioni): GitHub Pages non sa servire le pagine interne */}
    <HashRouter>
      <SessioneProvider>
        <ConfermaProvider>
          <App />
        </ConfermaProvider>
      </SessioneProvider>
    </HashRouter>
  </StrictMode>,
)
