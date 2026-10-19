import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, oggiISO } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'

// Debiti e crediti con le persone (SPEC 3.4): saldo netto e, toccando una persona,
// le spese condivise e i rimborsi che lo compongono.
export default function SezioneDebiti({ saldi }) {
  const [aperta, setAperta] = useState(null)
  const [dettaglio, setDettaglio] = useState([])
  const [errore, setErrore] = useState('')

  const visibili = saldi.filter((s) => Number(s.saldo) !== 0 || s.attiva)

  async function apri(persona) {
    if (aperta === persona.persona_id) return setAperta(null)
    setAperta(persona.persona_id)
    setDettaglio([])
    const [t, r] = await Promise.all([
      supabase.from('transazioni').select('id, data, nota, importo_totale, quota_personale, pagata_da').eq('persona_id', persona.persona_id).eq('condivisa', true).lte('data', oggiISO()),
      supabase.from('pagamenti_saldo').select('id, data, nota, importo, direzione').eq('persona_id', persona.persona_id).lte('data', oggiISO()),
    ])
    if (t.error || r.error) return setErrore(messaggioErrore(t.error || r.error))
    const righe = [
      ...t.data.map((x) => ({
        id: x.id,
        data: x.data,
        testo: `${x.nota || 'Spesa condivisa'} · pagata da ${x.pagata_da === 'io' ? 'te' : persona.nome} (${euro(x.importo_totale)})`,
        effetto: x.pagata_da === 'io' ? Number(x.importo_totale) - Number(x.quota_personale) : -Number(x.quota_personale),
      })),
      ...r.data.map((x) => ({
        id: x.id,
        data: x.data,
        testo: `Rimborso ${x.direzione === 'ricevuto' ? 'ricevuto' : 'pagato'}${x.nota ? ` · ${x.nota}` : ''}`,
        effetto: x.direzione === 'ricevuto' ? -Number(x.importo) : Number(x.importo),
      })),
    ].sort((a, b) => b.data.localeCompare(a.data))
    setDettaglio(righe)
  }

  const descrivi = (s) => {
    const v = Number(s.saldo)
    if (v > 0) return { testo: `${s.nome} ti deve`, classe: 'ok' }
    if (v < 0) return { testo: `Devi a ${s.nome}`, classe: 'perdita' }
    return { testo: `In pari con ${s.nome}`, classe: '' }
  }

  return (
    <div className="scheda">
      <h2>Debiti e crediti</h2>
      {errore && <p className="errore">{errore}</p>}
      {!visibili.length && <p className="nota">Nessuna persona. Aggiungile in Impostazioni → Persone.</p>}
      <div className="elenco-movimenti">
        {visibili.map((s) => {
          const d = descrivi(s)
          return (
            <div key={s.persona_id}>
              <button className="movimento" onClick={() => apri(s)} aria-expanded={aperta === s.persona_id}>
                <span className="movimento-testo"><strong>{d.testo}</strong></span>
                <span className={`importo ${d.classe}`}>{euro(Math.abs(Number(s.saldo)))}</span>
              </button>
              {aperta === s.persona_id && (
                <div className="dettaglio-persona">
                  {!dettaglio.length && <p className="nota">Nessun movimento.</p>}
                  {dettaglio.map((r) => (
                    <div key={r.id} className="riga-dettaglio">
                      <span className="nota">{dataBreve(r.data)} · {r.testo}</span>
                      <span className="importo-piccolo">{r.effetto > 0 ? '+' : r.effetto < 0 ? '−' : ''}{euro(Math.abs(r.effetto))}</span>
                    </div>
                  ))}
                  <p className="nota">+ aumenta quanto ti deve, − aumenta quanto gli devi.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
