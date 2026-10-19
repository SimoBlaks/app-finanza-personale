import { useRef, useState } from 'react'

const L = 1000
const H = 200

// Grafico ad area a serie singola con mirino e valore al passaggio del mouse/tocco.
// punti: [{ id, etichetta, valore }] in ordine di tempo. compatto: senza asse né date (sparkline).
export default function Area({ punti, formatta, altezza = 180, compatto = false, colore = 'var(--primario)' }) {
  const [indice, setIndice] = useState(null)
  const box = useRef(null)
  if (punti.length < 2) return <p className="nota">Dati insufficienti per il grafico.</p>

  const valori = punti.map((p) => p.valore)
  let min = Math.min(...valori)
  let max = Math.max(...valori)
  if (min > 0 && !compatto) min = 0
  if (max === min) max = min + 1
  const x = (i) => (i / (punti.length - 1)) * L
  const y = (v) => H - ((v - min) / (max - min)) * (H - 8) - 4
  const linea = punti.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.valore)}`).join(' ')
  const area = `${linea} L ${L} ${H} L 0 ${H} Z`

  function muovi(e) {
    const r = box.current.getBoundingClientRect()
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
    setIndice(Math.round(f * (punti.length - 1)))
  }

  const scelto = indice !== null ? punti[indice] : punti[punti.length - 1]

  return (
    <div className={`grafico-area ${compatto ? 'compatto' : ''}`}>
      {!compatto && (
        <p className="valore-area">
          <span className="nota">{scelto.etichetta}</span> <strong>{formatta(scelto.valore)}</strong>
        </p>
      )}
      <div
        ref={box}
        className="tela-area"
        style={{ height: altezza }}
        onPointerMove={muovi}
        onPointerDown={muovi}
        onPointerLeave={() => setIndice(null)}
      >
        <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={area} fill={colore} opacity="0.12" />
          <path d={linea} fill="none" stroke={colore} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {min < 0 && max > 0 && <line x1="0" x2={L} y1={y(0)} y2={y(0)} stroke="var(--bordo)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {indice !== null && (
          <>
            <span className="mirino" style={{ left: `${(indice / (punti.length - 1)) * 100}%` }} />
            <span
              className="punto-area"
              style={{ left: `${(indice / (punti.length - 1)) * 100}%`, top: `${(y(punti[indice].valore) / H) * 100}%`, background: colore }}
            />
          </>
        )}
      </div>
      {!compatto && (
        <div className="asse-x">
          <span>{punti[0].etichetta}</span>
          <span>{punti[punti.length - 1].etichetta}</span>
        </div>
      )}
      {compatto && indice !== null && (
        <span className="valore-sparkline">{punti[indice].etichetta}: {formatta(punti[indice].valore)}</span>
      )}
    </div>
  )
}
