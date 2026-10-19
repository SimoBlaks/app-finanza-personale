import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { caricaAlbero } from '../../lib/categorie'
import ModuloTransazione from './ModuloTransazione'
import ModuloRimborso from './ModuloRimborso'
import Ricorrenze from './Ricorrenze'
import Cronologia, { filtriVuoti } from './Cronologia'

export default function Transazioni() {
  const [scheda, setScheda] = useState('cronologia')
  const [albero, setAlbero] = useState(null)
  const [persone, setPersone] = useState([])
  // i filtri restano impostati anche dopo aver aperto e chiuso una transazione
  const [filtri, setFiltri] = useState(filtriVuoti)
  const [modulo, setModulo] = useState(null) // { tipo: 'transazione' | 'rimborso', voce }
  const [errore, setErrore] = useState('')

  const caricaAnagrafiche = useCallback(async () => {
    const [a, p] = await Promise.all([caricaAlbero(), supabase.from('persone').select('*').order('nome')])
    if (a.errore || p.error) return setErrore(messaggioErrore(a.errore || p.error))
    setAlbero(a)
    setPersone(p.data)
  }, [])

  useEffect(() => { caricaAnagrafiche() }, [caricaAnagrafiche])

  const nomePersona = (id) => persone.find((p) => p.id === id)?.nome ?? '?'
  const chiudiModulo = () => setModulo(null)

  if (!albero) return <section><h1>Transazioni</h1>{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  if (modulo?.tipo === 'transazione')
    return <section><ModuloTransazione albero={albero} persone={persone} transazione={modulo.voce} onFine={chiudiModulo} /></section>
  if (modulo?.tipo === 'rimborso')
    return <section><ModuloRimborso persone={persone} rimborso={modulo.voce} onFine={chiudiModulo} /></section>

  return (
    <section>
      <h1>Transazioni</h1>
      <div className="schede">
        <button className={`scheda-link ${scheda === 'cronologia' ? 'active' : ''}`} onClick={() => setScheda('cronologia')}>Cronologia</button>
        <button className={`scheda-link ${scheda === 'ricorrenze' ? 'active' : ''}`} onClick={() => setScheda('ricorrenze')}>Ricorrenze</button>
      </div>

      {scheda === 'ricorrenze' ? (
        <Ricorrenze albero={albero} nomePersona={nomePersona} />
      ) : (
        <>
          <div className="azioni-pagina">
            <button className="primario" onClick={() => setModulo({ tipo: 'transazione', voce: null })}>+ Nuova</button>
            <button onClick={() => setModulo({ tipo: 'rimborso', voce: null })}>Registra rimborso</button>
          </div>
          {errore && <p className="errore">{errore}</p>}
          <Cronologia albero={albero} nomePersona={nomePersona} filtri={filtri} setFiltri={setFiltri} onApri={setModulo} />
        </>
      )}
    </section>
  )
}
