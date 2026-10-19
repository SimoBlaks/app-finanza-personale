import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Finestra di conferma disegnata dall'app (window.confirm non funziona in tutti i browser).
// Uso: const conferma = useConferma(); if (await conferma({ messaggio: '…' })) { … }
const ContestoConferma = createContext(null)

export function ConfermaProvider({ children }) {
  const [richiesta, setRichiesta] = useState(null)
  const pulsante = useRef(null)

  const chiedi = useCallback(
    ({ titolo = 'Sei sicuro?', messaggio, conferma = 'Conferma', pericolo = false }) =>
      new Promise((risolvi) => setRichiesta({ titolo, messaggio, conferma, pericolo, risolvi })),
    [],
  )

  const chiudi = (risposta) => {
    richiesta.risolvi(risposta)
    setRichiesta(null)
  }

  useEffect(() => {
    if (!richiesta) return
    pulsante.current?.focus()
    const tasto = (e) => e.key === 'Escape' && chiudi(false)
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  })

  return (
    <ContestoConferma.Provider value={chiedi}>
      {children}
      {richiesta && (
        <div className="sfondo-dialogo" onClick={() => chiudi(false)}>
          <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="titolo-dialogo" onClick={(e) => e.stopPropagation()}>
            <h2 id="titolo-dialogo">{richiesta.titolo}</h2>
            {richiesta.messaggio && <div className="dialogo-testo">{richiesta.messaggio}</div>}
            <div className="azioni-modulo">
              <button type="button" onClick={() => chiudi(false)}>Annulla</button>
              <button type="button" ref={pulsante} className={richiesta.pericolo ? 'pericolo-pieno' : 'primario'} onClick={() => chiudi(true)}>
                {richiesta.conferma}
              </button>
            </div>
          </div>
        </div>
      )}
    </ContestoConferma.Provider>
  )
}

export const useConferma = () => useContext(ContestoConferma)
