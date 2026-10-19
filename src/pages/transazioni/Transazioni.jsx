import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { caricaAlbero, percorso } from '../../lib/categorie'
import { euro, inCentesimi } from '../../lib/numeri'
import { dataEstesa, limitiMese, meseCorrente, nomeMese, spostaMese } from '../../lib/date'
import ModuloTransazione from './ModuloTransazione'
import ModuloRimborso from './ModuloRimborso'
import Ricorrenze from './Ricorrenze'

const filtri = { tutte: 'Tutte', spesa: 'Spese', incasso: 'Incassi', rimborso: 'Rimborsi' }

export default function Transazioni() {
  const [scheda, setScheda] = useState('cronologia')
  const [albero, setAlbero] = useState(null)
  const [persone, setPersone] = useState([])
  const [mese, setMese] = useState(meseCorrente)
  const [filtro, setFiltro] = useState('tutte')
  const [voci, setVoci] = useState([])
  const [modulo, setModulo] = useState(null) // { tipo: 'transazione' | 'rimborso', voce }
  const [errore, setErrore] = useState('')

  const caricaAnagrafiche = useCallback(async () => {
    const [a, p] = await Promise.all([caricaAlbero(), supabase.from('persone').select('*').order('nome')])
    if (a.errore || p.error) return setErrore(messaggioErrore(a.errore || p.error))
    setAlbero(a)
    setPersone(p.data)
  }, [])

  const caricaMese = useCallback(async () => {
    const { da, a } = limitiMese(mese)
    const [t, r] = await Promise.all([
      supabase.from('transazioni').select('*').gte('data', da).lte('data', a).order('data', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('pagamenti_saldo').select('*').gte('data', da).lte('data', a).order('data', { ascending: false }).order('created_at', { ascending: false }),
    ])
    if (t.error || r.error) return setErrore(messaggioErrore(t.error || r.error))
    const tutte = [
      ...t.data.map((x) => ({ ...x, genere: 'transazione' })),
      ...r.data.map((x) => ({ ...x, genere: 'rimborso' })),
    ].sort((x, y) => (x.data === y.data ? y.created_at.localeCompare(x.created_at) : y.data.localeCompare(x.data)))
    setVoci(tutte)
  }, [mese])

  useEffect(() => { caricaAnagrafiche() }, [caricaAnagrafiche])
  useEffect(() => { caricaMese() }, [caricaMese])

  const nomePersona = (id) => persone.find((p) => p.id === id)?.nome ?? '?'

  const visibili = voci.filter((v) =>
    filtro === 'tutte' ? true : filtro === 'rimborso' ? v.genere === 'rimborso' : v.genere === 'transazione' && v.tipo === filtro,
  )

  // Totali del mese sulla quota personale (i rimborsi non contano).
  const totali = useMemo(() => {
    let entrate = 0
    let uscite = 0
    for (const v of voci) {
      if (v.genere !== 'transazione') continue
      const c = inCentesimi(String(v.quota_personale))
      if (v.tipo === 'incasso') entrate += c
      else uscite += c
    }
    return { entrate: entrate / 100, uscite: uscite / 100 }
  }, [voci])

  const perGiorno = useMemo(() => {
    const gruppi = []
    for (const v of visibili) {
      const ultimo = gruppi[gruppi.length - 1]
      if (ultimo && ultimo.data === v.data) ultimo.voci.push(v)
      else gruppi.push({ data: v.data, voci: [v] })
    }
    return gruppi
  }, [visibili])

  const chiudiModulo = () => {
    setModulo(null)
    caricaMese()
  }

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

          <div className="selettore-mese">
            <button className="piccolo" onClick={() => setMese((m) => spostaMese(m, -1))} aria-label="Mese precedente">‹</button>
            <strong>{nomeMese(mese)}</strong>
            <button className="piccolo" onClick={() => setMese((m) => spostaMese(m, 1))} aria-label="Mese successivo">›</button>
          </div>

          <div className="totali-mese">
            <div><span className="nota">Entrate</span><strong className="importo incasso">{euro(totali.entrate)}</strong></div>
            <div><span className="nota">Uscite (tua quota)</span><strong className="importo spesa">{euro(totali.uscite)}</strong></div>
          </div>

          <div className="schede">
            {Object.entries(filtri).map(([v, l]) => (
              <button key={v} className={`scheda-link ${filtro === v ? 'active' : ''}`} onClick={() => setFiltro(v)}>{l}</button>
            ))}
          </div>

          {errore && <p className="errore">{errore}</p>}
          {!perGiorno.length && <p className="nota">Nessun movimento in questo mese.</p>}

          {perGiorno.map((g) => (
            <div key={g.data} className="giorno">
              <h3>{dataEstesa(g.data)}</h3>
              <div className="scheda elenco-movimenti">
                {g.voci.map((v) =>
                  v.genere === 'rimborso' ? (
                    <button key={v.id} className="movimento rimborso" onClick={() => setModulo({ tipo: 'rimborso', voce: v })}>
                      <span className="movimento-testo">
                        <strong>Rimborso {v.direzione === 'ricevuto' ? 'da' : 'a'} {nomePersona(v.persona_id)}</strong>
                        {v.nota && <span className="nota">{v.nota}</span>}
                      </span>
                      <span className="importo">{v.direzione === 'ricevuto' ? '+' : '−'}{euro(v.importo)}</span>
                    </button>
                  ) : (
                    <button key={v.id} className="movimento" onClick={() => setModulo({ tipo: 'transazione', voce: v })}>
                      <span className="movimento-testo">
                        <strong>{v.nota || percorso(albero, v.macrocategoria_id, v.categoria_id)}</strong>
                        <span className="nota">
                          {percorso(albero, v.macrocategoria_id, v.categoria_id, v.microcategoria_id)}
                          {v.condivisa && <span className="etichetta">condivisa con {nomePersona(v.persona_id)}</span>}
                          {v.ricorrenza_id && <span className="etichetta">ricorrente</span>}
                        </span>
                      </span>
                      <span className="movimento-importi">
                        <span className={`importo ${v.tipo}`}>{v.tipo === 'incasso' ? '+' : '−'}{euro(v.quota_personale)}</span>
                        {v.condivisa && <span className="nota">su {euro(v.importo_totale)}</span>}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
