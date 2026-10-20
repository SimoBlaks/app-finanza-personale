import { euro, numero } from '../lib/numeri'
import { dataBreve } from '../lib/date'
import { mostraPrezzo } from '../lib/investimenti'

export const percento = (n) => `${n > 0 ? '+' : ''}${numero(n.toFixed(2))}%`

// Dividendi e cedole netti incassati, per asset: { [asset_id]: totale }.
export const sommaProventi = (proventi) =>
  proventi.reduce((t, x) => ({ ...t, [x.asset_id]: (t[x.asset_id] ?? 0) + Number(x.importo_netto) }), {})

// Scheda di una posizione: quantità, PMC, ultimo prezzo, valore e guadagno (SPEC 3.5).
// v è il risultato di valuta() in lib/prezzi.js; proventi è il netto incassato in dividendi/cedole.
export default function SchedaPosizione({ asset: a, posizione: p, valutazione: v, proventi = 0, children }) {
  const costo = Number(p.costo_carico)
  const conProventi = v.guadagno + proventi
  return (
    <div className="scheda posizione">
      <div className="posizione-titolo">
        <strong>{a?.nome}</strong>
        <span className="nota">{a?.ticker_isin}</span>
        {a?.escluso_dal_patrimonio && <span className="etichetta">escluso dal patrimonio</span>}
      </div>
      <dl className="dati">
        <dt>{a?.quotazione === 'percentuale' ? 'Nominale' : 'Quantità'}</dt>
        <dd>{a?.quotazione === 'percentuale' ? euro(p.quantita) : numero(p.quantita)}</dd>
        <dt>PMC</dt>
        <dd>{mostraPrezzo(a, p.pmc)}</dd>
        <dt>Ultimo prezzo</dt>
        <dd>
          {v.senzaPrezzo ? '—' : mostraPrezzo(a, v.prezzo)}
          {v.dataPrezzo && <span className="nota"> del {dataBreve(v.dataPrezzo)}</span>}
        </dd>
        <dt>Valore attuale</dt>
        <dd>{euro(v.valore)}</dd>
        <dt>Guadagno / perdita</dt>
        <dd className={v.guadagno >= 0 ? 'ok' : 'perdita'}>{euro(v.guadagno)} ({percento(v.guadagnoPct)})</dd>
        {proventi > 0 && (
          <>
            <dt>Dividendi / cedole netti</dt>
            <dd className="ok">+{euro(proventi)}</dd>
            <dt>Guadagno con proventi</dt>
            <dd className={conProventi >= 0 ? 'ok' : 'perdita'}>
              {euro(conProventi)}{costo > 0 && ` (${percento((conProventi / costo) * 100)})`}
            </dd>
          </>
        )}
      </dl>
      {v.senzaPrezzo && <p className="etichetta-avviso">nessun prezzo disponibile: valore calcolato al PMC</p>}
      {v.prezzoVecchio && <p className="etichetta-avviso">prezzo vecchio</p>}
      {children}
    </div>
  )
}
