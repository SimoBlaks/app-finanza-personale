import { useState } from 'react'

const R = 80
const SPESSORE = 26

function arco(inizio, fine) {
  // angoli in giri (0..1), partendo dall'alto in senso orario
  const punto = (giri, r) => {
    const a = giri * 2 * Math.PI - Math.PI / 2
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]
  }
  const grande = fine - inizio > 0.5 ? 1 : 0
  const [x1, y1] = punto(inizio, R)
  const [x2, y2] = punto(fine, R)
  return `M ${x1} ${y1} A ${R} ${R} 0 ${grande} 1 ${x2} ${y2}`
}

// Grafico a ciambella con legenda. voci: [{ id, etichetta, valore, colore, extra? }] (extra: riga sotto il nome).
// Al centro il totale (o la voce sotto il puntatore); onScegli rende cliccabili fette e legenda.
export default function Ciambella({ voci, formatta, titoloCentro = 'Totale', onScegli, scegliibile = () => true }) {
  const [attiva, setAttiva] = useState(null)
  const totale = voci.reduce((t, v) => t + v.valore, 0)
  if (!totale) return <p className="nota">Nessun dato.</p>

  let cursore = 0
  const fette = voci.map((v) => {
    const quota = v.valore / totale
    const fetta = { ...v, inizio: cursore, fine: cursore + quota, quota }
    cursore += quota
    return fetta
  })
  const evidenziata = fette.find((f) => f.id === attiva)
  const cliccabile = (v) => onScegli && scegliibile(v)
  const percento = (q) => `${(q * 100).toLocaleString('it-IT', { maximumFractionDigits: 1, useGrouping: 'always' })}%`

  return (
    // il contenitore misura lo spazio disponibile: legenda accanto solo se ci sta
    <div className="ciambella-spazio">
    <div className="ciambella">
      <svg viewBox="0 0 200 200" role="img" aria-label={`${titoloCentro}: ${formatta(totale)}`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--traccia)" strokeWidth={SPESSORE} />
        {fette.map((f) =>
          f.quota >= 0.9999 ? (
            <circle key={f.id} cx="100" cy="100" r={R} fill="none" stroke={f.colore} strokeWidth={SPESSORE} />
          ) : (
            <path
              key={f.id}
              d={arco(f.inizio, f.fine)}
              fill="none"
              stroke={f.colore}
              strokeWidth={attiva === f.id ? SPESSORE + 6 : SPESSORE}
              className={`fetta ${cliccabile(f) ? 'cliccabile' : ''}`}
              onMouseEnter={() => setAttiva(f.id)}
              onMouseLeave={() => setAttiva(null)}
              onClick={() => cliccabile(f) && onScegli(f)}
            >
              <title>{`${f.etichetta}: ${formatta(f.valore)} (${percento(f.quota)})`}</title>
            </path>
          ),
        )}
        {/* separatori tra le fette, nel colore della superficie */}
        {fette.length > 1 && fette.map((f) => {
          const a = f.inizio * 2 * Math.PI - Math.PI / 2
          return (
            <line
              key={`s-${f.id}`}
              x1={100 + (R - SPESSORE / 2 - 4) * Math.cos(a)} y1={100 + (R - SPESSORE / 2 - 4) * Math.sin(a)}
              x2={100 + (R + SPESSORE / 2 + 4) * Math.cos(a)} y2={100 + (R + SPESSORE / 2 + 4) * Math.sin(a)}
              stroke="var(--superficie)" strokeWidth="2"
            />
          )
        })}
        <text x="100" y="94" textAnchor="middle" className="ciambella-titolo">
          {evidenziata ? evidenziata.etichetta.slice(0, 18) : titoloCentro}
        </text>
        <text x="100" y="116" textAnchor="middle" className="ciambella-valore">
          {formatta(evidenziata ? evidenziata.valore : totale)}
        </text>
      </svg>

      <ul className="legenda">
        {fette.map((f) => {
          const contenuto = (
            <>
              <span className="pallino" style={{ background: f.colore }} />
              <span className="legenda-nome">{f.etichetta}{f.extra}</span>
              <span className="legenda-valore">{formatta(f.valore)}</span>
              <span className="legenda-quota">{percento(f.quota)}</span>
            </>
          )
          return (
            <li key={f.id} onMouseEnter={() => setAttiva(f.id)} onMouseLeave={() => setAttiva(null)} className={attiva === f.id ? 'attiva' : ''}>
              {cliccabile(f) ? <button type="button" onClick={() => onScegli(f)}>{contenuto}</button> : <div>{contenuto}</div>}
            </li>
          )
        })}
      </ul>
    </div>
    </div>
  )
}
