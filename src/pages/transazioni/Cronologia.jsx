import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { normalizza, percorso } from '../../lib/categorie'
import { euro, inCentesimi, leggiNumero, numero, oggiISO } from '../../lib/numeri'
import { aggiungiMesi, dataBreve, dataEstesa, limitiMese, meseCorrente } from '../../lib/date'
import SceltaCategoria from '../../components/SceltaCategoria'

const BLOCCO = 50
const tipi = { tutte: 'Tutte', spesa: 'Spese', incasso: 'Incassi', rimborso: 'Rimborsi' }

export const filtriVuoti = { testo: '', tipo: 'tutte', da: '', a: '', categoria: {} }

const annoCorrente = () => oggiISO().slice(0, 4)
const scorciatoie = [
  { etichetta: 'Questo mese', periodo: () => limitiMese(meseCorrente()) },
  { etichetta: 'Mese scorso', periodo: () => limitiMese(aggiungiMesi(`${meseCorrente()}-01`, -1).slice(0, 7)) },
  { etichetta: "Quest'anno", periodo: () => ({ da: `${annoCorrente()}-01-01`, a: `${annoCorrente()}-12-31` }) },
  { etichetta: 'Anno scorso', periodo: () => ({ da: `${Number(annoCorrente()) - 1}-01-01`, a: `${Number(annoCorrente()) - 1}-12-31` }) },
]

// Valore tra virgolette per i filtri "or" delle API (virgole e parentesi nel testo non li rompono).
const virgolette = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// Condizione di ricerca per testo: nella nota, nel nome della categoria (a qualsiasi
// livello) e, se il testo è un numero, nell'importo.
function ricerca(testo, albero, campiImporto) {
  const t = testo.trim()
  const parti = [`nota.ilike.${virgolette(`*${t}*`)}`]
  if (albero) {
    const cercato = normalizza(t)
    const trovati = (voci) => voci.filter((v) => normalizza(v.nome).includes(cercato)).map((v) => v.id)
    for (const [campo, voci] of [['macrocategoria_id', albero.macro], ['categoria_id', albero.cat], ['microcategoria_id', albero.micro]]) {
      const ids = trovati(voci)
      if (ids.length) parti.push(`${campo}.in.(${ids.join(',')})`)
    }
  }
  const importo = leggiNumero(t)
  if (importo !== null) for (const c of campiImporto) parti.push(`${c}.eq.${importo.replace('-', '')}`)
  return parti.join(',')
}

// Applica i filtri a una query sulle transazioni.
function filtraTransazioni(q, f, albero) {
  if (f.tipo === 'spesa' || f.tipo === 'incasso') q = q.eq('tipo', f.tipo)
  if (f.da) q = q.gte('data', f.da)
  if (f.a) q = q.lte('data', f.a)
  if (f.categoria.microId) q = q.eq('microcategoria_id', f.categoria.microId)
  else if (f.categoria.catId) q = q.eq('categoria_id', f.categoria.catId)
  else if (f.categoria.macroId) q = q.eq('macrocategoria_id', f.categoria.macroId)
  if (f.testo.trim()) q = q.or(ricerca(f.testo, albero, ['quota_personale', 'importo_totale']))
  return q
}

// I rimborsi non hanno categoria e non sono né spese né incassi.
const conRimborsi = (f) => (f.tipo === 'tutte' || f.tipo === 'rimborso') && !f.categoria.macroId
const conTransazioni = (f) => f.tipo !== 'rimborso'

const ordina = (x, y) => (x.data === y.data ? y.created_at.localeCompare(x.created_at) : y.data.localeCompare(x.data))

// Elenco di tutte le transazioni (e i rimborsi), 50 alla volta, con filtri facoltativi.
export default function Cronologia({ albero, nomePersona, filtri, setFiltri, onApri }) {
  const [testo, setTesto] = useState(filtri.testo)
  const [mostraFiltri, setMostraFiltri] = useState(false)
  const [transazioni, setTransazioni] = useState([])
  const [rimborsi, setRimborsi] = useState([])
  const [conteggio, setConteggio] = useState({ transazioni: 0, rimborsi: 0 })
  const [totali, setTotali] = useState(null)
  const [mostrati, setMostrati] = useState(BLOCCO) // solo per l'elenco dei soli rimborsi
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')

  // la ricerca parte poco dopo che si smette di scrivere
  useEffect(() => {
    const t = setTimeout(() => setFiltri((f) => (f.testo === testo ? f : { ...f, testo })), 350)
    return () => clearTimeout(t)
  }, [testo, setFiltri])

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore('')
    setMostrati(BLOCCO)
    const richieste = [
      conTransazioni(filtri)
        ? filtraTransazioni(supabase.from('transazioni').select('*', { count: 'exact' }), filtri, albero)
            .order('data', { ascending: false }).order('created_at', { ascending: false })
            .range(0, BLOCCO - 1)
        : Promise.resolve({ data: [], count: 0 }),
      conRimborsi(filtri)
        ? (() => {
            let q = supabase.from('pagamenti_saldo').select('*').order('data', { ascending: false }).order('created_at', { ascending: false })
            if (filtri.da) q = q.gte('data', filtri.da)
            if (filtri.a) q = q.lte('data', filtri.a)
            if (filtri.testo.trim()) q = q.or(ricerca(filtri.testo, null, ['importo']))
            return q
          })()
        : Promise.resolve({ data: [] }),
    ]
    const [t, r] = await Promise.all(richieste)
    setCaricamento(false)
    if (t.error || r.error) return setErrore(messaggioErrore(t.error || r.error))
    setTransazioni(t.data.map((x) => ({ ...x, genere: 'transazione' })))
    setRimborsi(r.data.map((x) => ({ ...x, genere: 'rimborso' })))
    setConteggio({ transazioni: t.count ?? 0, rimborsi: r.data.length })
  }, [filtri, albero])

  // Totali (sulla tua quota) solo se è impostato un periodo: si leggono a pagine da 1000.
  const caricaTotali = useCallback(async () => {
    if (!(filtri.da || filtri.a) || !conTransazioni(filtri)) return setTotali(null)
    let entrate = 0
    let uscite = 0
    for (let da = 0; ; da += 1000) {
      const { data, error } = await filtraTransazioni(supabase.from('transazioni').select('tipo, quota_personale'), filtri, albero)
        .order('id').range(da, da + 999)
      if (error) return setTotali(null)
      for (const v of data) {
        const c = inCentesimi(String(v.quota_personale))
        if (v.tipo === 'incasso') entrate += c
        else uscite += c
      }
      if (data.length < 1000) break
    }
    setTotali({ entrate: entrate / 100, uscite: uscite / 100 })
  }, [filtri, albero])

  useEffect(() => { carica() }, [carica])
  useEffect(() => { caricaTotali() }, [caricaTotali])

  async function caricaAltre() {
    const { data, error } = await filtraTransazioni(supabase.from('transazioni').select('*'), filtri, albero)
      .order('data', { ascending: false }).order('created_at', { ascending: false })
      .range(transazioni.length, transazioni.length + BLOCCO - 1)
    if (error) return setErrore(messaggioErrore(error))
    setTransazioni((t) => [...t, ...data.map((x) => ({ ...x, genere: 'transazione' }))])
  }

  const altreTransazioni = transazioni.length < conteggio.transazioni

  // Rimborsi mescolati alle transazioni: mostro solo quelli che cadono nel tratto già caricato.
  const voci = useMemo(() => {
    if (!conTransazioni(filtri)) return rimborsi.slice(0, mostrati)
    const limite = altreTransazioni ? transazioni[transazioni.length - 1]?.data : null
    const r = limite ? rimborsi.filter((x) => x.data >= limite) : rimborsi
    return [...transazioni, ...r].sort(ordina)
  }, [transazioni, rimborsi, filtri, altreTransazioni, mostrati])

  const perGiorno = useMemo(() => {
    const gruppi = []
    for (const v of voci) {
      const ultimo = gruppi[gruppi.length - 1]
      if (ultimo && ultimo.data === v.data) ultimo.voci.push(v)
      else gruppi.push({ data: v.data, voci: [v] })
    }
    return gruppi
  }, [voci])

  const imposta = (campo, valore) => setFiltri((f) => ({ ...f, [campo]: valore }))
  const attivi = [filtri.tipo !== 'tutte', filtri.da || filtri.a, filtri.categoria.macroId].filter(Boolean).length
  const qualcosaAttivo = attivi > 0 || filtri.testo.trim()
  const totaleTrovate = conteggio.transazioni + conteggio.rimborsi
  const ancora = conTransazioni(filtri) ? altreTransazioni : mostrati < rimborsi.length

  return (
    <>
      <div className="barra-filtri">
        <input
          type="search"
          placeholder="Cerca in note, categorie o importi…"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          aria-label="Cerca nelle note"
        />
        <button className={mostraFiltri || attivi ? 'attivo' : ''} onClick={() => setMostraFiltri((x) => !x)} aria-expanded={mostraFiltri}>
          Filtri{attivi > 0 && <span className="contatore">{attivi}</span>}
        </button>
      </div>

      {mostraFiltri && (
        <div className="scheda pannello-filtri">
          <div className="pulsanti-scelta">
            {Object.entries(tipi).map(([v, l]) => (
              <button key={v} className={`piccolo ${filtri.tipo === v ? 'selezionato' : ''}`} onClick={() => imposta('tipo', v)}>{l}</button>
            ))}
          </div>

          <div>
            <span className="etichetta-campo">Periodo</span>
            <div className="pulsanti-scelta">
              {scorciatoie.map((s) => {
                const p = s.periodo()
                const scelto = filtri.da === p.da && filtri.a === p.a
                return (
                  <button key={s.etichetta} className={`piccolo ${scelto ? 'selezionato' : ''}`} onClick={() => setFiltri((f) => ({ ...f, ...p }))}>
                    {s.etichetta}
                  </button>
                )
              })}
            </div>
            <div className="griglia periodo">
              <label>Dal<input type="date" value={filtri.da} onChange={(e) => imposta('da', e.target.value)} /></label>
              <label>Al<input type="date" value={filtri.a} onChange={(e) => imposta('a', e.target.value)} /></label>
            </div>
          </div>

          {filtri.tipo !== 'rimborso' && (
            <div>
              <span className="etichetta-campo">Categoria</span>
              <SceltaCategoria albero={albero} valore={filtri.categoria} onChange={(v) => imposta('categoria', v)} />
            </div>
          )}

          <div className="azioni-modulo">
            {qualcosaAttivo && (
              <button onClick={() => { setTesto(''); setFiltri(filtriVuoti) }}>Azzera filtri</button>
            )}
            <button className="primario" onClick={() => setMostraFiltri(false)}>Fatto</button>
          </div>
        </div>
      )}

      <p className="riepilogo-elenco">
        {caricamento ? 'Caricamento…' : `${numero(totaleTrovate)} ${totaleTrovate === 1 ? 'movimento' : 'movimenti'}${qualcosaAttivo ? (totaleTrovate === 1 ? ' trovato' : ' trovati') : ' in totale'}`}
        {(filtri.da || filtri.a) && !caricamento && (
          <span className="nota"> · {filtri.da ? `dal ${dataBreve(filtri.da)}` : ''} {filtri.a ? `al ${dataBreve(filtri.a)}` : ''}</span>
        )}
        {qualcosaAttivo && (
          <button className="link" onClick={() => { setTesto(''); setFiltri(filtriVuoti) }}>Azzera filtri</button>
        )}
      </p>

      {totali && (
        <div className="totali-mese">
          <div><span className="nota">Entrate</span><strong className="importo incasso">{euro(totali.entrate)}</strong></div>
          <div><span className="nota">Uscite (tua quota)</span><strong className="importo spesa">{euro(totali.uscite)}</strong></div>
        </div>
      )}

      {errore && <p className="errore">{errore}</p>}
      {!caricamento && !voci.length && <p className="nota">Nessun movimento{qualcosaAttivo ? ' con questi filtri' : ''}.</p>}

      {perGiorno.map((g) => (
        <div key={g.data} className="giorno">
          <h3>{dataEstesa(g.data)} {g.data.slice(0, 4) !== annoCorrente() && g.data.slice(0, 4)}</h3>
          <div className="scheda elenco-movimenti">
            {g.voci.map((v) =>
              v.genere === 'rimborso' ? (
                <button key={v.id} className="movimento rimborso" onClick={() => onApri({ tipo: 'rimborso', voce: v })}>
                  <span className="movimento-testo">
                    <strong>Rimborso {v.direzione === 'ricevuto' ? 'da' : 'a'} {nomePersona(v.persona_id)}</strong>
                    {v.nota && <span className="nota">{v.nota}</span>}
                  </span>
                  <span className="importo">{v.direzione === 'ricevuto' ? '+' : '−'}{euro(v.importo)}</span>
                </button>
              ) : (
                <button key={v.id} className="movimento" onClick={() => onApri({ tipo: 'transazione', voce: v })}>
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

      {ancora && !caricamento && (
        <button
          className="carica-altre"
          onClick={() => (conTransazioni(filtri) ? caricaAltre() : setMostrati((m) => m + BLOCCO))}
        >
          Carica altre {BLOCCO}
        </button>
      )}
    </>
  )
}
