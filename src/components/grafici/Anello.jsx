// Indicatore ad anello per una percentuale (es. tasso di risparmio).
// Il colore segue lo stato: verde se buono, arancio se basso, rosso se negativo.
export default function Anello({ percentuale, soglia = 20 }) {
  const r = 52
  const giro = 2 * Math.PI * r
  const nd = percentuale === null || percentuale === undefined
  const p = nd ? 0 : Math.max(Math.min(percentuale, 100), 0)
  const stato = nd ? 'neutro' : percentuale < 0 ? 'negativo' : percentuale < soglia ? 'basso' : 'buono'
  const testo = nd ? 'n/d' : `${percentuale.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`

  return (
    <svg className={`anello ${stato}`} viewBox="0 0 140 140" role="img" aria-label={`Tasso di risparmio ${testo}`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--traccia)" strokeWidth="14" />
      {!nd && percentuale !== 0 && (
        <circle
          cx="70" cy="70" r={r} fill="none" strokeWidth="14" strokeLinecap="round"
          className="anello-pieno"
          strokeDasharray={`${(percentuale < 0 ? 100 : p) / 100 * giro} ${giro}`}
          transform="rotate(-90 70 70)"
        />
      )}
      <text x="70" y="77" textAnchor="middle" className="anello-testo">{testo}</text>
    </svg>
  )
}
