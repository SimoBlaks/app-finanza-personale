import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { numero, oggiISO } from '../../lib/numeri'
import { esportaExcel } from '../../lib/esporta'

export default function Esporta() {
  const [anni, setAnni] = useState(null)
  const [annoDa, setAnnoDa] = useState('')
  const [annoA, setAnnoA] = useState('')
  const [stato, setStato] = useState('')
  const [esito, setEsito] = useState(null)
  const [errore, setErrore] = useState('')

  // anni disponibili: dal primo movimento all'anno in corso
  useEffect(() => {
    supabase.from('transazioni').select('data').order('data').limit(1).maybeSingle().then(({ data, error }) => {
      if (error) return setErrore(messaggioErrore(error))
      const ultimo = Number(oggiISO().slice(0, 4))
      const primo = data ? Number(data.data.slice(0, 4)) : ultimo
      const elenco = Array.from({ length: ultimo - primo + 1 }, (_, i) => String(primo + i))
      setAnni(elenco)
      setAnnoDa(elenco[0])
      setAnnoA(elenco[elenco.length - 1])
    })
  }, [])

  async function scarica() {
    setErrore('')
    setEsito(null)
    try {
      const r = await esportaExcel({ annoDa, annoA, avanzamento: setStato })
      setEsito(r)
    } catch (e) {
      setErrore(messaggioErrore(e) || String(e))
    } finally {
      setStato('')
    }
  }

  if (!anni) return <p className="caricamento">{errore || 'Caricamento…'}</p>

  return (
    <div className="scheda modulo">
      <h2>Esporta in Excel</h2>
      <p className="nota">
        Crea un file Excel con lo stesso formato di quello usato per l'importazione: un foglio per anno
        (Data, Uscita, Entrata, Descrizione, Macrocategoria, Categoria, Microcategoria, Note) con il riepilogo
        per macrocategoria, più i fogli DATI (categorie), Rimborsi e Investimenti. Il file si crea sul tuo
        dispositivo e viene scaricato direttamente.
      </p>
      <div className="griglia">
        <label>
          Dall'anno
          <select value={annoDa} onChange={(e) => { setAnnoDa(e.target.value); if (e.target.value > annoA) setAnnoA(e.target.value) }}>
            {anni.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label>
          All'anno
          <select value={annoA} onChange={(e) => { setAnnoA(e.target.value); if (e.target.value < annoDa) setAnnoDa(e.target.value) }}>
            {anni.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
      </div>
      <div className="pulsanti-scelta">
        <button type="button" className="piccolo" onClick={() => { setAnnoDa(anni[0]); setAnnoA(anni[anni.length - 1]) }}>Tutti gli anni</button>
        <button type="button" className="piccolo" onClick={() => { const x = anni[anni.length - 1]; setAnnoDa(x); setAnnoA(x) }}>Solo quest'anno</button>
      </div>

      {errore && <p className="errore">{errore}</p>}
      {esito && (
        <p className="successo">
          Scaricato "{esito.nomeFile}": {numero(esito.transazioni)} movimenti in {esito.anni} {esito.anni === 1 ? 'foglio' : 'fogli'} annuali,
          {' '}{numero(esito.rimborsi)} rimborsi, {numero(esito.operazioni)} operazioni di investimento.
        </p>
      )}
      <div className="azioni-modulo">
        <button className="primario" onClick={scarica} disabled={!!stato}>{stato || 'Scarica Excel'}</button>
      </div>
    </div>
  )
}
