import { useState } from 'react'
import { euro } from '../../lib/numeri'
import { dataBreve } from '../../lib/date'
import { fattore, mostraPrezzo, mostraQuantita, tipologiePlurale } from '../../lib/investimenti'

export const BLOCCO_INVESTIMENTI = 15
export const filtriInvestimentiVuoti = { tipologia: '', asset: '', tipo: 'tutte', da: '', a: '', daVerificare: false }
const tipi = { tutte: 'Tutte', acquisto: 'Acquisti', vendita: 'Vendite', provento: 'Dividendi e cedole' }

// Spesa o incasso di un'operazione, come nella liquidità: acquisto = quantità × prezzo + spese.
const valoreOperazione = (o, a) => (o.tipo === 'acquisto' ? Number(o.quantita) * Number(o.prezzo) * fattore(a) + Number(o.spese) : Number(o.liquidita_incassata))

// Cronologia di operazioni e proventi, dal più recente, con filtri e 15 voci alla volta.
// Filtri e quantità mostrata stanno nella pagina, così restano dopo aver aperto un'operazione.
export default function CronologiaInvestimenti({ cronologia, asset, perId, filtri, setFiltri, mostrati, setMostrati, onApri }) {
  const [mostraFiltri, setMostraFiltri] = useState(false)
  const imposta = (campo, valore) => {
    setFiltri((f) => ({ ...f, [campo]: valore }))
    setMostrati(BLOCCO_INVESTIMENTI)
  }
  const azzera = () => { setFiltri(filtriInvestimentiVuoti); setMostrati(BLOCCO_INVESTIMENTI) }

  const filtrate = cronologia.filter((o) =>
    (!filtri.tipologia || perId[o.asset_id]?.tipologia === filtri.tipologia) &&
    (!filtri.asset || o.asset_id === filtri.asset) &&
    (filtri.tipo === 'tutte' || (filtri.tipo === 'provento' ? o.genere === 'provento' : o.genere === 'operazione' && o.tipo === filtri.tipo)) &&
    (!filtri.da || o.data >= filtri.da) &&
    (!filtri.a || o.data <= filtri.a) &&
    (!filtri.daVerificare || o.da_verificare),
  )
  const attivi = [filtri.tipologia, filtri.asset, filtri.tipo !== 'tutte', filtri.da || filtri.a, filtri.daVerificare].filter(Boolean).length

  // totali delle voci filtrate (tutte, non solo quelle mostrate)
  let totali = null
  if (attivi) {
    totali = { acquisti: 0, vendite: 0, proventi: 0 }
    for (const o of filtrate) {
      if (o.genere === 'provento') totali.proventi += Number(o.importo_netto)
      else totali[o.tipo === 'acquisto' ? 'acquisti' : 'vendite'] += valoreOperazione(o, perId[o.asset_id])
    }
  }

  const visibili = filtrate.slice(0, mostrati)
  const assetUsati = asset.filter((a) => cronologia.some((o) => o.asset_id === a.id))
  const tipologieUsate = Object.keys(tipologiePlurale).filter((t) => assetUsati.some((a) => a.tipologia === t))
  // scegliendo un tipo di asset, l'elenco degli asset mostra solo quelli di quel tipo
  const assetScelta = assetUsati.filter((a) => !filtri.tipologia || a.tipologia === filtri.tipologia)
  const cambiaTipologia = (t) => {
    setFiltri((f) => ({ ...f, tipologia: t, asset: t && f.asset && perId[f.asset]?.tipologia !== t ? '' : f.asset }))
    setMostrati(BLOCCO_INVESTIMENTI)
  }

  return (
    <>
      <div className="intestazione-scheda">
        <h2>Cronologia operazioni</h2>
        <button className={`piccolo ${mostraFiltri || attivi ? 'attivo-filtri' : ''}`} onClick={() => setMostraFiltri((x) => !x)} aria-expanded={mostraFiltri}>
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
          <div className="griglia affiancati">
          <label>
            Tipo di asset
            <select value={filtri.tipologia} onChange={(e) => cambiaTipologia(e.target.value)}>
              <option value="">Tutti</option>
              {tipologieUsate.map((t) => <option key={t} value={t}>{tipologiePlurale[t]}</option>)}
            </select>
          </label>
          <label>
            Asset
            <select value={filtri.asset} onChange={(e) => imposta('asset', e.target.value)}>
              <option value="">Tutti</option>
              {assetScelta.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          </div>
          <div className="griglia periodo">
            <label>Dal<input type="date" value={filtri.da} onChange={(e) => imposta('da', e.target.value)} /></label>
            <label>Al<input type="date" value={filtri.a} onChange={(e) => imposta('a', e.target.value)} /></label>
          </div>
          <div className="filtro-con-spiegazione">
            <button className={`piccolo ${filtri.daVerificare ? 'selezionato' : ''}`} onClick={() => imposta('daVerificare', !filtri.daVerificare)}>Solo da verificare</button>
            <span className="nota">Acquisti (es. dei PAC) inseriti in automatico dall'app con un prezzo stimato, da verificare con i dati reali del broker.</span>
          </div>
          <div className="azioni-modulo">
            {attivi > 0 && <button onClick={azzera}>Azzera filtri</button>}
            <button className="primario" onClick={() => setMostraFiltri(false)}>Fatto</button>
          </div>
        </div>
      )}

      {cronologia.length > 0 && (
        <p className="riepilogo-elenco">
          {filtrate.length} {filtrate.length === 1 ? 'operazione' : 'operazioni'}{attivi ? (filtrate.length === 1 ? ' trovata' : ' trovate') : ' in totale'}
          {attivi > 0 && <button className="link" onClick={azzera}>Azzera filtri</button>}
        </p>
      )}

      {totali && filtrate.length > 0 && (
        <div className="totali-mese">
          {totali.acquisti > 0 && <div><span className="nota">Acquisti</span><strong className="importo">{euro(totali.acquisti)}</strong></div>}
          {totali.vendite > 0 && <div><span className="nota">Vendite (netto incassato)</span><strong className="importo">{euro(totali.vendite)}</strong></div>}
          {totali.proventi > 0 && <div><span className="nota">Dividendi e cedole netti</span><strong className="importo incasso">{euro(totali.proventi)}</strong></div>}
        </div>
      )}

      {!cronologia.length && <p className="nota">Nessuna operazione registrata.</p>}
      {cronologia.length > 0 && !filtrate.length && <p className="nota">Nessuna operazione con questi filtri.</p>}
      {visibili.length > 0 && (
        <div className="scheda elenco-movimenti">
          {visibili.map((o) => {
            const a = perId[o.asset_id]
            if (o.genere === 'provento')
              return (
                <button key={o.id} className="movimento" onClick={() => onApri({ tipo: 'provento', provento: o })}>
                  <span className="movimento-testo">
                    <strong>{o.tipo === 'cedola' ? 'Cedola' : 'Dividendo'} · {a?.nome}</strong>
                    <span className="nota">
                      {dataBreve(o.data)} · lordo {euro(o.importo_lordo)} · tasse {euro(o.tasse)}{o.nota ? ` · ${o.nota}` : ''}
                    </span>
                  </span>
                  <span className="importo incasso">+{euro(o.importo_netto)}</span>
                </button>
              )
            const valore = valoreOperazione(o, a)
            return (
              <button key={o.id} className="movimento" onClick={() => onApri({ tipo: o.tipo, operazione: o })}>
                <span className="movimento-testo">
                  <strong>{o.tipo === 'acquisto' ? 'Acquisto' : 'Vendita'} · {a?.nome}</strong>
                  <span className="nota">
                    {dataBreve(o.data)} · {mostraQuantita(a, o.quantita)} a {mostraPrezzo(a, o.prezzo)}
                    {Number(o.spese) > 0 && ` · spese ${euro(o.spese)}`}
                    {o.movimenta_liquidita === false && ' · fuori liquidità'}
                    {o.da_verificare && <span className="etichetta attenzione">da verificare</span>}
                  </span>
                  {o.tipo === 'vendita' && (
                    <span className="nota">
                      {Number(o.plusvalore) >= 0 ? 'Plusvalore' : 'Minusvalenza'} {euro(o.plusvalore)} · tasse {euro(o.tasse)}
                    </span>
                  )}
                </span>
                <span className={`importo ${o.movimenta_liquidita === false ? '' : o.tipo === 'acquisto' ? 'spesa' : 'incasso'}`}>
                  {o.movimenta_liquidita === false ? euro(valore) : o.tipo === 'acquisto' ? `−${euro(valore)}` : `+${euro(valore)}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {filtrate.length > mostrati && (
        <button className="carica-altre" onClick={() => setMostrati((m) => m + BLOCCO_INVESTIMENTI)}>
          Carica altre {Math.min(BLOCCO_INVESTIMENTI, filtrate.length - mostrati)}
        </button>
      )}
    </>
  )
}
