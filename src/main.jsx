import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SessioneProvider } from './auth/Sessione'
import App from './App'
import './stile.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SessioneProvider>
        <App />
      </SessioneProvider>
    </BrowserRouter>
  </StrictMode>,
)
