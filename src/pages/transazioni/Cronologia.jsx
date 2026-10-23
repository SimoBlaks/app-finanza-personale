import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { normalizza, percorso } from '../../lib/categorie'
import { euro, inCentesimi, leggiNumero, numero, oggiISO } from '../../lib/numeri'
import { aggiungiMesi, dataBreve, dataEstesa, limitiMese, meseCorrente } from '../../lib/date'
import FiltroCategorie from '../../components/FiltroCategorie'

const BLOCCO = 30
const tipi = { tutte: 'Tutte', spesa: 'Spese', incasso: 'Incassi', rimborso: 'Rimborsi' }

export const filtriVuoti = { testo: '', tipo: 'tutte', da: '', a: '', categorie: [], persona: '', future: false, ricorrenti: false }

// Ordinamento della tabella (l'elenco va sempre per data, dal più recente).
export const ordineIniziale = { campo: 'data', crescente: false }

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

// Più categorie scelte: basta che la transazione rientri in una di esse.
const campiLivello = { macro: 'macrocategoria_id', cat: 'categoria_id', micro: 'microcategoria_id' }
function condizioneCategorie(categorie) {
  return Object.entries(campiLivello)
    .map(([livello, campo]) => [campo, categorie.filter((c) => c.livello === livello).map((c) => c.id)])
    .filter(([, ids]) => ids.length)
    .map(([campo, ids]) => `${campo}.in.(${ids.join(',')})`)
    .join(',')
}

// Applica i filtri a una query sulle transazioni.
function filtraTransazioni(q, f, albero) {
  if (f.tipo === 'spesa' || f.tipo === 'incasso') q = q.eq('tipo', f.tipo)
  if (f.da) q = q.gte('data', f.da)
  if (f.a) q = q.lte('data', f.a)
  if (f.categorie.length) q = q.or(condizioneCategorie(f.categorie))
  if (f.persona) q = q.eq('persona_id', f.persona)
  if (f.future) q = q.gt('data', oggiISO())
  if (f.ricorrenti) q = q.not('ricorrenza_id', 'is', null)
  if (f.testo.trim()) q = q.or(ricerca(f.testo, albero, ['quota_personale', 'importo_totale']))
  return q
}

function ordinaQuery(q, o) {
  if (o.campo !== 'data') q = q.order(o.campo, { ascending: o.crescente })
  const suData = o.campo === 'data' ? o.crescente : false
  return q.order('data', { ascending: suData }).order('created_at', { ascending: suData })
}

// I rimborsi non hanno categoria e non sono né spese né incassi.
const conRimborsi = (f) => (f.tipo === 'tutte' || f.tipo === 'rimborso') && !f.categorie.length && !f.ricorrenti
const conTransazioni = (f) => f.tipo !== 'rimborso'

// Confronto tra due voci con l'ordinamento scelto; per i rimborsi l'importo vale per tutte le colonne di importo.
const valore = (v, campo) => (campo === 'data' ? v.data : Number(v.genere === 'rimborso' ? v.importo : v[campo]))
const confronta = (o) => (x, y) => {
  const a = valore(x, o.campo)
  const b = valore(y, o.campo)
  if (a !== b) return (a < b ? -1 : 1) * (o.crescente ? 1 : -1)
  if (o.campo === 'data') return x.created_at.localeCompare(y.created_at) * (o.crescente ? 1 : -1)
  return y.data.localeCompare(x.data) || y.created_at.localeCompare(x.created_at)
}

// Movimenti con data futura: bordo arancione per le uscite, blu per i soldi in entrata
// (incassi e rimborsi ricevuti).
const futura = (v) => v.data > oggiISO()
const inEntrata = (v) => (v.genere === 'rimborso' ? v.direzione === 'ricevuto' : v.tipo === 'incasso')
const classeFutura = (v) => (futura(v) ? (inEntrata(v) ? 'futura entrata' : 'futura') : '')
const Programmata = ({ v }) => <span className={`etichetta ${inEntrata(v) ? 'programmata-entrata' : 'attenzione'}`}>programmata</span>

// Elenco di tutte le transazioni (e i rimborsi), 30 alla volta, con filtri facoltativi.
export default function Cronologia({ albero, persone, nomePersona, filtri, setFiltri, vista, setVista, ordineTabella, setOrdine, aggiorna, onApri }) {
  const ordine = vista === 'tabella' ? ordineTabella : ordineIniziale
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

  // quante: righe da rileggere (dopo una modifica si rileggono tutte quelle già caricate)
  const carica = useCallback(async (quante = BLOCCO, rilettura = false) => {
    setCaricamento(true)
    setErrore('')
    if (!rilettura) setMostrati(BLOCCO)
    const richieste = [
      conTransazioni(filtri)
        ? ordinaQuery(filtraTransazioni(supabase.from('transazioni').select('*', { count: 'exact' }), filtri, albero), ordine)
            .range(0, quante - 1)
        : Promise.resolve({ data: [], count: 0 }),
      conRimborsi(filtri)
        ? (() => {
            let q = supabase.from('pagamenti_saldo').select('*').order('data', { ascending: false }).order('created_at', { ascending: false })
            if (filtri.da) q = q.gte('data', filtri.da)
            if (filtri.a) q = q.lte('data', filtri.a)
            if (filtri.persona) q = q.eq('persona_id', filtri.persona)
            if (filtri.future) q = q.gt('data', oggiISO())
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
  }, [filtri, albero, ordine])

  // Totali (sulla tua quota) di tutti i movimenti filtrati, non solo di quelli mostrati:
  // si calcolano con qualsiasi filtro attivo e si leggono a pagine da 1000.
  const richiestaTotali = useRef(0)
  const caricaTotali = useCallback(async () => {
    const richiesta = ++richiestaTotali.current
    const filtrato = filtri.testo.trim() || filtri.tipo !== 'tutte' || filtri.da || filtri.a || filtri.categorie.length ||
      filtri.persona || filtri.future || filtri.ricorrenti
    if (!filtrato || !conTransazioni(filtri)) return setTotali(null)
    let entrate = 0
    let uscite = 0
    for (let da = 0; ; da += 1000) {
      let q = filtraTransazioni(supabase.from('transazioni').select('tipo, quota_personale'), filtri, albero)
      if (!filtri.future) q = q.lte('data', oggiISO())
      const { data, error } = await q
        .order('id').range(da, da + 999)
      if (error) return setTotali(null)
      for (const v of data) {
        const c = inCentesimi(String(v.quota_personale))
        if (v.tipo === 'incasso') entrate += c
        else uscite += c
      }
      if (data.length < 1000) break
    }
    // se nel frattempo i filtri sono cambiati, questo risultato è vecchio
    if (richiesta === richiestaTotali.current) setTotali({ entrate: entrate / 100, uscite: uscite / 100 })
  }, [filtri, albero])

  useEffect(() => { carica() }, [carica])
  useEffect(() => { caricaTotali() }, [caricaTotali])

  // chiuso un modulo, si rileggono le righe già mostrate senza tornare all'inizio
  const caricate = useRef(BLOCCO)
  caricate.current = Math.max(transazioni.length, BLOCCO)
  const ultimoAggiorna = useRef(aggiorna)
  useEffect(() => {
    if (ultimoAggiorna.current === aggiorna) return
    ultimoAggiorna.current = aggiorna
    carica(caricate.current, true)
    caricaTotali()
  }, [aggiorna, carica, caricaTotali])

  async function caricaAltre() {
    const { data, error } = await ordinaQuery(filtraTransazioni(supabase.from('transazioni').select('*'), filtri, albero), ordine)
      .range(transazioni.length, transazioni.length + BLOCCO - 1)
    if (error) return setErrore(messaggioErrore(error))
    setTransazioni((t) => [...t, ...data.map((x) => ({ ...x, genere: 'transazione' }))])
  }

  const altreTransazioni = transazioni.length < conteggio.transazioni

  // Rimborsi mescolati alle transazioni: mostro solo quelli che cadono nel tratto già caricato.
  const voci = useMemo(() => {
    const cmp = confronta(ordine)
    if (!conTransazioni(filtri)) return [...rimborsi].sort(cmp).slice(0, mostrati)
    const ultima = altreTransazioni ? transazioni[transazioni.length - 1] : null
    const r = ultima ? rimborsi.filter((x) => cmp(x, ultima) <= 0) : rimborsi
    return [...transazioni, ...r].sort(cmp)
  }, [transazioni, rimborsi, filtri, altreTransazioni, mostrati, ordine])

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
  const attivi = [filtri.tipo !== 'tutte', filtri.da || filtri.a, filtri.categorie.length > 0, filtri.persona, filtri.future, filtri.ricorrenti].filter(Boolean).length
  const qualcosaAttivo = attivi > 0 || filtri.testo.trim()
  // i rimborsi filtrati sono già tutti caricati: i loro totali si fanno qui
  const totaliRimborsi = useMemo(() => {
    if (!qualcosaAttivo || !rimborsi.length) return null
    const somma = (direzione) => rimborsi.filter((r) => r.direzione === direzione && (filtri.future || r.data <= oggiISO())).reduce((t, r) => t + inCentesimi(String(r.importo)), 0) / 100
    return { ricevuti: somma('ricevuto'), dati: somma('pagato') }
  }, [rimborsi, qualcosaAttivo, filtri.future])
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
              <span className="etichetta-campo">Categorie (puoi sceglierne più di una)</span>
              <FiltroCategorie albero={albero} valore={filtri.categorie} onChange={(v) => imposta('categorie', v)} />
            </div>
          )}

          <div>
            <span className="etichetta-campo">Mostra solo</span>
            <div className="pulsanti-scelta">
              <button className={`piccolo ${filtri.future ? 'selezionato' : ''}`} onClick={() => imposta('future', !filtri.future)}>Future</button>
              {filtri.tipo !== 'rimborso' && (
                <button className={`piccolo ${filtri.ricorrenti ? 'selezionato' : ''}`} onClick={() => imposta('ricorrenti', !filtri.ricorrenti)}>Ricorrenti</button>
              )}
            </div>
          </div>

          {persone.length > 0 && (
            <label>
              Persona (spese condivise e rimborsi)
              <select value={filtri.persona} onChange={(e) => imposta('persona', e.target.value)}>
                <option value="">Tutte</option>
                {persone.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
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
        <span className="interruttore-vista scelta-vista" role="group" aria-label="Visualizzazione">
          <button className={vista === 'elenco' ? 'attivo' : ''} aria-pressed={vista === 'elenco'} onClick={() => setVista('elenco')}>Elenco</button>
          <button className={vista === 'tabella' ? 'attivo' : ''} aria-pressed={vista === 'tabella'} onClick={() => setVista('tabella')}>Tabella</button>
        </span>
      </p>

      {(totali || totaliRimborsi) && !caricamento && (
        <div className="totali-mese">
          {totali && filtri.tipo !== 'spesa' && (
            <div><span className="nota">Entrate</span><strong className="importo incasso">{euro(totali.entrate)}</strong></div>
          )}
          {totali && filtri.tipo !== 'incasso' && (
            <div><span className="nota">Uscite (tua quota)</span><strong className="importo spesa">{euro(totali.uscite)}</strong></div>
          )}
          {totaliRimborsi?.ricevuti > 0 && (
            <div><span className="nota">Rimborsi ricevuti</span><strong className="importo">{euro(totaliRimborsi.ricevuti)}</strong></div>
          )}
          {totaliRimborsi?.dati > 0 && (
            <div><span className="nota">Rimborsi dati</span><strong className="importo">{euro(totaliRimborsi.dati)}</strong></div>
          )}
        </div>
      )}

      {errore && <p className="errore">{errore}</p>}
      {!caricamento && !voci.length && <p className="nota">Nessun movimento{qualcosaAttivo ? ' con questi filtri' : ''}.</p>}

      {vista === 'tabella' && voci.length > 0 && (
        <div className="scheda contenitore-tabella">
          <table className="tabella-movimenti">
            <thead>
              <tr>
                <Intestazione campo="data" etichetta="Data" ordine={ordine} setOrdine={setOrdine} />
                <th>Descrizione</th>
                <th>Categoria</th>
                <th>Persona</th>
                <Intestazione campo="importo_totale" etichetta="Totale" ordine={ordine} setOrdine={setOrdine} numerica />
                <Intestazione campo="quota_personale" etichetta="Tua quota" ordine={ordine} setOrdine={setOrdine} numerica />
              </tr>
            </thead>
            <tbody>
              {voci.map((v) => {
                const apri = () => onApri({ tipo: v.genere, voce: v })
                const tasti = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri() } }
                const classi = [v.genere === 'rimborso' && 'rimborso', classeFutura(v)].filter(Boolean).join(' ')
                const data = <td className="cella-data">{dataBreve(v.data)}{futura(v) && <Programmata v={v} />}</td>
                if (v.genere === 'rimborso')
                  return (
                    <tr key={v.id} className={classi} tabIndex={0} onClick={apri} onKeyDown={tasti}>
                      {data}
                      <td><strong>Rimborso {v.direzione === 'ricevuto' ? 'ricevuto' : 'pagato'}</strong>{v.nota && <span className="nota"> · {v.nota}</span>}</td>
                      <td className="nota">—</td>
                      <td>{nomePersona(v.persona_id)}</td>
                      <td className="numerica">{euro(v.importo)}</td>
                      <td className="numerica"><span className="importo">{v.direzione === 'ricevuto' ? '+' : '−'}{euro(v.importo)}</span></td>
                    </tr>
                  )
                return (
                  <tr key={v.id} className={classi} tabIndex={0} onClick={apri} onKeyDown={tasti}>
                    {data}
                    <td>
                      {v.nota ? <strong>{v.nota}</strong> : <span className="nota">—</span>}
                      {v.ricorrenza_id && <span className="etichetta">ricorrente</span>}
                    </td>
                    <td>{percorso(albero, v.macrocategoria_id, v.categoria_id, v.microcategoria_id) || <span className="nota">—</span>}</td>
                    <td>{v.condivisa ? nomePersona(v.persona_id) : <span className="nota">—</span>}</td>
                    <td className="numerica">{euro(v.importo_totale)}</td>
                    <td className="numerica"><span className={`importo ${v.tipo}`}>{v.tipo === 'incasso' ? '+' : '−'}{euro(v.quota_personale)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {vista === 'elenco' && perGiorno.map((g) => (
        <div key={g.data} className="giorno">
          <h3>{dataEstesa(g.data)} {g.data.slice(0, 4) !== annoCorrente() && g.data.slice(0, 4)}</h3>
          <div className="scheda elenco-movimenti">
            {g.voci.map((v) =>
              v.genere === 'rimborso' ? (
                <button key={v.id} className={`movimento rimborso ${classeFutura(v)}`} onClick={() => onApri({ tipo: 'rimborso', voce: v })}>
                  <span className="movimento-testo">
                    <strong>Rimborso {v.direzione === 'ricevuto' ? 'da' : 'a'} {nomePersona(v.persona_id)}{futura(v) && <Programmata v={v} />}</strong>
                    {v.nota && <span className="nota">{v.nota}</span>}
                  </span>
                  <span className="importo">{v.direzione === 'ricevuto' ? '+' : '−'}{euro(v.importo)}</span>
                </button>
              ) : (
                <button key={v.id} className={`movimento ${classeFutura(v)}`} onClick={() => onApri({ tipo: 'transazione', voce: v })}>
                  <span className="movimento-testo">
                    <strong>{v.nota || percorso(albero, v.macrocategoria_id, v.categoria_id)}</strong>
                    <span className="nota">
                      {percorso(albero, v.macrocategoria_id, v.categoria_id, v.microcategoria_id)}
                      {v.condivisa && <span className="etichetta">condivisa con {nomePersona(v.persona_id)}</span>}
                      {v.ricorrenza_id && <span className="etichetta">ricorrente</span>}
                      {futura(v) && <Programmata v={v} />}
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

// Intestazione di colonna che cambia l'ordinamento: primo clic dal più grande/recente, secondo clic al contrario.
function Intestazione({ campo, etichetta, ordine, setOrdine, numerica }) {
  const attiva = ordine.campo === campo
  const cambia = () => setOrdine(attiva ? { campo, crescente: !ordine.crescente } : { campo, crescente: false })
  return (
    <th className={numerica ? 'numerica' : ''} aria-sort={attiva ? (ordine.crescente ? 'ascending' : 'descending') : 'none'}>
      <button className={`ordina ${attiva ? 'attiva' : ''}`} onClick={cambia}>
        {etichetta}<span aria-hidden="true">{attiva ? (ordine.crescente ? ' ↑' : ' ↓') : ' ↕'}</span>
      </button>
    </th>
  )
}
