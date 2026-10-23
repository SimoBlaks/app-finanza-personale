import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, inCentesimi, leggiImporto, leggiNumero, oggiISO, perCampo } from '../../lib/numeri'
import { aggiungiGiorni, aggiungiMesi, dataBreve, frequenze } from '../../lib/date'
import { percorso } from '../../lib/categorie'
import { nomeScorciatoia, scorciatoiaAttiva, tipiTransazione } from '../../lib/scorciatoie'
import SceltaCategoria from '../../components/SceltaCategoria'
import { useConferma } from '../../components/Conferma'

function statoIniziale(t) {
  const data = t?.data ?? oggiISO()
  return {
    id: t?.id ?? null,
    tipo: t?.tipo ?? 'spesa',
    data,
    importo: t ? perCampo(t.importo_totale) : '',
    nota: t?.nota ?? '',
    categoria: t ? { macroId: t.macrocategoria_id, catId: t.categoria_id, microId: t.microcategoria_id } : {},
    condivisa: t?.condivisa ?? false,
    pagata_da: t?.pagata_da ?? 'io',
    persona_id: t?.persona_id ?? '',
    percentuale_mia: t?.percentuale_mia != null ? perCampo(t.percentuale_mia) : '50',
    ricorrente: false,
    frequenza: 'mensile',
    prossima_scadenza: aggiungiMesi(data, 1),
    scadenza_modificata: false,
    fine_ricorrenza: '',
  }
}

export default function ModuloTransazione({ albero, persone, transazione, onFine }) {
  const [f, setF] = useState(() => statoIniziale(transazione))
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const conferma = useConferma()
  const nuova = !f.id
  const [scorciatoie, setScorciatoie] = useState([])

  // le scorciatoie servono solo per le transazioni nuove; se non si caricano, il modulo funziona lo stesso
  useEffect(() => {
    if (!nuova) return
    supabase.from('scorciatoie_categoria').select('*').order('ordine').order('created_at')
      .then(({ data }) => setScorciatoie((data ?? []).filter((s) => scorciatoiaAttiva(albero, s))))
  }, [nuova, albero])

  // La nota della scorciatoia non cancella un testo scritto a mano: sostituisce solo una nota
  // vuota o arrivata da un'altra scorciatoia.
  const usaScorciatoia = (s) => {
    imposta('tipo', s.tipo)
    imposta('categoria', { macroId: s.macrocategoria_id, catId: s.categoria_id, microId: s.microcategoria_id })
    setF((x) => {
      const daScorciatoia = !x.nota.trim() || scorciatoie.some((a) => a.nota && a.nota === x.nota)
      return daScorciatoia ? { ...x, nota: s.nota ?? '' } : x
    })
  }
  // Categoria suggerita dalla nota: cerca le registrazioni passate con una nota simile e propone
  // le categorie usate più spesso. Solo per le nuove e finché la categoria non è scelta; decide l'utente.
  const [suggerimenti, setSuggerimenti] = useState([])
  const testoNota = f.nota.trim()
  const senzaCategoria = !f.categoria.macroId
  useEffect(() => {
    if (!nuova || !senzaCategoria || testoNota.length < 3) return setSuggerimenti([])
    let annullata = false
    const attesa = setTimeout(async () => {
      const cerca = testoNota.replace(/[\\%_]/g, (c) => `\\${c}`)
      const { data } = await supabase
        .from('transazioni')
        .select('tipo, macrocategoria_id, categoria_id, microcategoria_id')
        .ilike('nota', `%${cerca}%`)
        .order('data', { ascending: false })
        .limit(100)
      if (annullata || !data) return
      const conteggi = new Map()
      for (const t of data) {
        const chiave = [t.tipo, t.macrocategoria_id, t.categoria_id, t.microcategoria_id].join('|')
        const voce = conteggi.get(chiave) ?? { ...t, volte: 0 }
        voce.volte += 1
        conteggi.set(chiave, voce)
      }
      // solo categorie ancora attive, le due più usate
      const attiva = (id) => !id || albero.mappa[id]?.attiva
      setSuggerimenti(
        [...conteggi.values()]
          .filter((v) => attiva(v.macrocategoria_id) && attiva(v.categoria_id) && attiva(v.microcategoria_id))
          .sort((x, y) => y.volte - x.volte)
          .slice(0, 2),
      )
    }, 400)
    return () => { annullata = true; clearTimeout(attesa) }
  }, [nuova, senzaCategoria, testoNota, albero])

  const usaSuggerimento = (s) => {
    imposta('tipo', s.tipo)
    imposta('categoria', { macroId: s.macrocategoria_id, catId: s.categoria_id, microId: s.microcategoria_id })
  }

  const scorciatoiaScelta = (s) =>
    f.tipo === s.tipo && f.categoria.macroId === s.macrocategoria_id &&
    (f.categoria.catId ?? null) === s.categoria_id && (f.categoria.microId ?? null) === s.microcategoria_id

  // Finché l'utente non tocca la prossima scadenza, la teniamo allineata a data + frequenza.
  const imposta = (campo, valore) =>
    setF((x) => {
      const y = { ...x, [campo]: valore }
      if (campo === 'tipo' && valore === 'incasso') y.condivisa = false
      if ((campo === 'data' || campo === 'frequenza') && !x.scadenza_modificata && y.data)
        y.prossima_scadenza = aggiungiMesi(y.data, frequenze[y.frequenza].mesi)
      if (campo === 'prossima_scadenza') y.scadenza_modificata = true
      return y
    })

  const importo = leggiImporto(f.importo)
  const percentuale = leggiNumero(f.percentuale_mia)
  const anteprimaQuota =
    importo && percentuale && Number(importo) > 0 ? euro(Math.round((inCentesimi(importo) * Number(percentuale)) / 100) / 100) : null

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    if (!f.data) return setErrore('Indica la data.')
    if (!importo || Number(importo) <= 0) return setErrore('Inserisci un importo maggiore di zero, con al massimo 2 decimali.')
    if (!f.categoria.macroId) return setErrore('Scegli almeno la macrocategoria.')
    if (f.condivisa) {
      if (!f.persona_id) return setErrore('Scegli con chi dividere la spesa.')
      if (percentuale === null || Number(percentuale) < 0 || Number(percentuale) > 100)
        return setErrore('La tua percentuale deve essere tra 0 e 100.')
    }
    if (nuova && f.ricorrente) {
      if (!f.prossima_scadenza || f.prossima_scadenza <= f.data)
        return setErrore('La prossima scadenza deve essere successiva alla data della transazione.')
      if (f.fine_ricorrenza && f.fine_ricorrenza < f.prossima_scadenza)
        return setErrore('La fine della ricorrenza non può essere prima della prossima scadenza.')
    }

    // da qui il pulsante resta bloccato, così un secondo tocco non salva due volte
    setInvio(true)

    // Possibile doppione: una transazione nuova con stesso tipo e importo a meno di 3 giorni da una già registrata.
    if (nuova) {
      const { data: simili } = await supabase
        .from('transazioni')
        .select('id, data, nota, importo_totale, macrocategoria_id, categoria_id, microcategoria_id')
        .eq('tipo', f.tipo)
        .eq('importo_totale', importo)
        .gte('data', aggiungiGiorni(f.data, -3))
        .lte('data', aggiungiGiorni(f.data, 3))
        .order('data')
        .limit(5)
      if (simili?.length) {
        const ok = await conferma({
          titolo: 'Possibile doppione',
          messaggio: (
            <>
              <p>{simili.length === 1 ? "C'è già una registrazione" : `Ci sono già ${simili.length} registrazioni`} con lo stesso importo in quei giorni:</p>
              <ul className="elenco-doppioni">
                {simili.map((s) => (
                  <li key={s.id}>
                    {dataBreve(s.data)} · <strong>{euro(s.importo_totale)}</strong> · {s.nota || percorso(albero, s.macrocategoria_id, s.categoria_id, s.microcategoria_id)}
                  </li>
                ))}
              </ul>
              <p>Vuoi salvarla comunque?</p>
            </>
          ),
          conferma: 'Salva comunque',
        })
        if (!ok) return setInvio(false)
      }
    }

    const dati = {
      data: f.data,
      tipo: f.tipo,
      importo_totale: importo,
      nota: f.nota.trim() || null,
      macrocategoria_id: f.categoria.macroId,
      categoria_id: f.categoria.catId || null,
      microcategoria_id: f.categoria.microId || null,
      condivisa: f.condivisa,
      pagata_da: f.condivisa ? f.pagata_da : null,
      persona_id: f.condivisa ? f.persona_id : null,
      percentuale_mia: f.condivisa ? percentuale : null,
    }

    const { error } = nuova
      ? f.ricorrente
        ? await supabase.rpc('crea_ricorrenza', {
            p_transazione: dati,
            p_frequenza: f.frequenza,
            p_prossima_scadenza: f.prossima_scadenza,
            p_fine_ricorrenza: f.fine_ricorrenza || null,
          })
        : await supabase.from('transazioni').insert(dati)
      : await supabase.from('transazioni').update(dati).eq('id', f.id)
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  async function elimina() {
    if (!(await conferma({ titolo: 'Eliminare questa transazione?', conferma: 'Elimina', pericolo: true }))) return
    const { error } = await supabase.from('transazioni').delete().eq('id', f.id)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  const personeScelta = persone.filter((p) => p.attiva || p.id === f.persona_id)

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>{nuova ? 'Nuova transazione' : 'Modifica transazione'}</h2>

      {scorciatoie.length > 0 && (
        <div>
          <span className="etichetta-campo">Scorciatoie</span>
          <div className="pulsanti-scelta scorciatoie">
            {scorciatoie.map((s) => (
              <button type="button" key={s.id} className={`piccolo ${s.tipo} ${scorciatoiaScelta(s) ? 'selezionato' : ''}`} onClick={() => usaScorciatoia(s)}>
                {nomeScorciatoia(albero, s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="interruttore-tipo" role="radiogroup">
        {Object.entries(tipiTransazione).map(([t, etichetta]) => (
          <button type="button" key={t} className={f.tipo === t ? `selezionato ${t}` : ''} onClick={() => imposta('tipo', t)}>
            {etichetta}
          </button>
        ))}
      </div>

      <div className="griglia">
        <label>Importo (€)<input inputMode="decimal" value={f.importo} onChange={(e) => imposta('importo', e.target.value)} autoFocus={nuova} /></label>
        <label>Data<input type="date" value={f.data} onChange={(e) => imposta('data', e.target.value)} /></label>
      </div>
      <label>Nota<input value={f.nota} onChange={(e) => imposta('nota', e.target.value)} placeholder="Descrizione (facoltativa)" /></label>
      {senzaCategoria && suggerimenti.length > 0 && (
        <div className="suggerimenti-categoria">
          <span className="nota">Categoria usata altre volte con questa nota:</span>
          <div className="pulsanti-scelta">
            {suggerimenti.map((s) => (
              <button type="button" key={[s.tipo, s.macrocategoria_id, s.categoria_id, s.microcategoria_id].join('|')} className={`piccolo ${s.tipo}`} onClick={() => usaSuggerimento(s)}>
                {s.tipo !== f.tipo && `${tipiTransazione[s.tipo]} · `}
                {percorso(albero, s.macrocategoria_id, s.categoria_id, s.microcategoria_id)}
                <span className="volte"> ({s.volte} {s.volte === 1 ? 'volta' : 'volte'})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="etichetta-campo">Categoria</span>
        <SceltaCategoria albero={albero} valore={f.categoria} onChange={(v) => imposta('categoria', v)} />
      </div>

      {f.tipo === 'spesa' && (
        <label className="interruttore">
          <input type="checkbox" checked={f.condivisa} onChange={(e) => imposta('condivisa', e.target.checked)} />
          Spesa condivisa
        </label>
      )}
      {f.condivisa && (
        <div className="riquadro">
          <div className="griglia">
            <label>
              Chi ha pagato
              <select value={f.pagata_da} onChange={(e) => imposta('pagata_da', e.target.value)}>
                <option value="io">Io</option>
                <option value="persona">L'altra persona</option>
              </select>
            </label>
            <label>
              Con chi dividere
              <select value={f.persona_id} onChange={(e) => imposta('persona_id', e.target.value)}>
                <option value="">Scegli…</option>
                {personeScelta.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label>La mia percentuale (%)<input inputMode="decimal" value={f.percentuale_mia} onChange={(e) => imposta('percentuale_mia', e.target.value)} /></label>
          </div>
          {!personeScelta.length && <p className="nota">Aggiungi prima una persona in Impostazioni → Persone.</p>}
          {anteprimaQuota && <p className="nota">La tua quota: <strong>{anteprimaQuota}</strong></p>}
        </div>
      )}

      {nuova && (
        <label className="interruttore">
          <input type="checkbox" checked={f.ricorrente} onChange={(e) => imposta('ricorrente', e.target.checked)} />
          Rendi ricorrente
        </label>
      )}
      {nuova && f.ricorrente && (
        <div className="riquadro griglia">
          <label>
            Frequenza
            <select value={f.frequenza} onChange={(e) => imposta('frequenza', e.target.value)}>
              {Object.entries(frequenze).map(([v, { etichetta }]) => <option key={v} value={v}>{etichetta}</option>)}
            </select>
          </label>
          <label>Prossima scadenza<input type="date" value={f.prossima_scadenza} onChange={(e) => imposta('prossima_scadenza', e.target.value)} /></label>
          <label>Fine ricorrenza (facoltativa)<input type="date" value={f.fine_ricorrenza} onChange={(e) => imposta('fine_ricorrenza', e.target.value)} /></label>
        </div>
      )}
      {!nuova && transazione?.ricorrenza_id && (
        <p className="nota">Generata da una ricorrenza: le modifiche valgono solo per questa occorrenza.</p>
      )}

      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        {!nuova && <button type="button" className="pericolo" onClick={elimina}>Elimina</button>}
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}
