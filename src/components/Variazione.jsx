import { euro } from '../lib/numeri'

// Differenza tra un valore e quello di confronto: "▲ +450,00 € (+24%)".
// tipo: 'spesa' (salire è male, rosso) o 'incasso' (salire è bene, verde).
export default function Variazione({ attuale, prima, tipo }) {
  const diff = attuale - prima
  if (Math.abs(diff) < 0.005) return <span className="variazione-voce pari">= come prima</span>
  if (Math.abs(prima) < 0.005) return <span className="variazione-voce nuova">nuova voce</span>
  const buona = tipo === 'spesa' ? diff < 0 : diff > 0
  const pct = (diff / Math.abs(prima)) * 100
  return (
    <span className={`variazione-voce ${buona ? 'meglio' : 'peggio'}`}>
      {diff > 0 ? '▲' : '▼'} {diff > 0 ? '+' : '−'}{euro(Math.abs(diff))} ({diff > 0 ? '+' : '−'}{Math.abs(pct).toLocaleString('it-IT', { maximumFractionDigits: 0 })}%)
    </span>
  )
}
