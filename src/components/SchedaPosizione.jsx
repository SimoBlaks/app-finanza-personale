import { euro, numero } from '../lib/numeri'
import { dataBreve } from '../lib/date'
import { mostraPrezzo } from '../lib/investimenti'

export const percento = (n) => `${n > 0 ? '+' : ''}${numero(n.toFixed(2))}%`

// Scheda di una posizione: quantità, PMC, ultimo prezzo, valore e guadagno (SPEC 3.5).
// v è il risultato di valuta() in lib/prezzi.js.
export default function SchedaPosizione({ asset: a, posizione: p, valutazione: v, children }) {
  return (
    <div className="scheda posizione">
      <div className="posizione-titolo">
        <strong>{a?.nome}</strong>
        <span className="nota">{a?.ticker_isin}</span>
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
      </dl>
      {v.senzaPrezzo && <p className="etichetta-avviso">nessun prezzo disponibile: valore calcolato al PMC</p>}
      {v.prezzoVecchio && <p className="etichetta-avviso">prezzo vecchio</p>}
      {children}
    </div>
  )
}
