import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { caricaAlbero } from '../../lib/categorie'
import ModuloTransazione from './ModuloTransazione'
import ModuloRimborso from './ModuloRimborso'
import Ricorrenze from './Ricorrenze'
import Cronologia, { filtriVuoti, ordineIniziale } from './Cronologia'

// elenco o tabella: la scelta resta salvata su questo dispositivo
const CHIAVE_VISTA = 'vista-transazioni'
function vistaSalvata() {
  try { return localStorage.getItem(CHIAVE_VISTA) === 'tabella' ? 'tabella' : 'elenco' } catch { return 'elenco' }
}

export default function Transazioni() {
  const [scheda, setScheda] = useState('cronologia')
  const [albero, setAlbero] = useState(null)
  const [persone, setPersone] = useState([])
  // i filtri restano impostati anche dopo aver aperto e chiuso una transazione
  const [filtri, setFiltri] = useState(filtriVuoti)
  const [ordine, setOrdine] = useState(ordineIniziale)
  const [vista, setVistaStato] = useState(vistaSalvata)
  const [modulo, setModulo] = useState(null) // { tipo: 'transazione' | 'rimborso', voce }
  const [errore, setErrore] = useState('')
  // dopo aver chiuso un modulo l'elenco si aggiorna e torna dove si era
  const [aggiorna, setAggiorna] = useState(0)
  const posizione = useRef(null)

  const caricaAnagrafiche = useCallback(async () => {
    const [a, p] = await Promise.all([caricaAlbero(), supabase.from('persone').select('*').order('nome')])
    if (a.errore || p.error) return setErrore(messaggioErrore(a.errore || p.error))
    setAlbero(a)
    setPersone(p.data)
  }, [])

  useEffect(() => { caricaAnagrafiche() }, [caricaAnagrafiche])

  const nomePersona = (id) => persone.find((p) => p.id === id)?.nome ?? '?'
  const apriModulo = (m) => {
    posizione.current = window.scrollY
    setModulo(m)
  }
  const chiudiModulo = () => {
    setModulo(null)
    setAggiorna((n) => n + 1)
  }

  // il modulo si apre dall'alto; chiudendolo si torna al punto dell'elenco in cui si era
  useLayoutEffect(() => {
    if (modulo) window.scrollTo(0, 0)
    else if (posizione.current !== null) {
      window.scrollTo(0, posizione.current)
      posizione.current = null
    }
  }, [modulo])
  const setVista = (v) => {
    setVistaStato(v)
    try { localStorage.setItem(CHIAVE_VISTA, v) } catch { /* non salvata: vale solo per questa visita */ }
  }

  if (!albero) return <section><h1>Transazioni</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  // L'elenco resta montato (nascosto) mentre il modulo è aperto, così non perde le righe caricate.
  return (
    <>
      {modulo?.tipo === 'transazione' && (
        <section><ModuloTransazione albero={albero} persone={persone} transazione={modulo.voce} onFine={chiudiModulo} /></section>
      )}
      {modulo?.tipo === 'rimborso' && (
        <section><ModuloRimborso persone={persone} rimborso={modulo.voce} onFine={chiudiModulo} /></section>
      )}
      <section hidden={!!modulo} className={scheda === 'cronologia' && vista === 'tabella' ? 'larga' : ''}>
        <h1>Transazioni</h1>
        <div className="schede">
          <button className={`scheda-link ${scheda === 'cronologia' ? 'active' : ''}`} onClick={() => setScheda('cronologia')}>Cronologia</button>
          <button className={`scheda-link ${scheda === 'ricorrenze' ? 'active' : ''}`} onClick={() => setScheda('ricorrenze')}>Ricorrenze</button>
        </div>
  
        {scheda === 'ricorrenze' ? (
          <Ricorrenze albero={albero} nomePersona={nomePersona} />
        ) : (
          <>
            <div className="azioni-pagina uguali">
              <button className="primario" onClick={() => apriModulo({ tipo: 'transazione', voce: null })}>+ Nuova</button>
              <button onClick={() => apriModulo({ tipo: 'rimborso', voce: null })}>Registra rimborso</button>
            </div>
            {errore && <p className="errore">{errore}</p>}
            <Cronologia
              albero={albero}
              persone={persone}
              nomePersona={nomePersona}
              filtri={filtri}
              setFiltri={setFiltri}
              vista={vista}
              setVista={setVista}
              ordineTabella={ordine}
              setOrdine={setOrdine}
              aggiorna={aggiorna}
              onApri={apriModulo}
            />
          </>
        )}
      </section>
    </>
  )
}
