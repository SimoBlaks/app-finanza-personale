import { useState } from 'react'

// Tacche "rotonde" per l'asse: 0, metà, massimo arrotondato.
function massimoTondo(n) {
  if (n <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(n))
  return Math.ceil(n / p) * p
}
const compatto = (n) => (n >= 1000 ? `${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k` : String(Math.round(n)))

// Colonne affiancate per due serie (es. entrate e uscite per mese), con legenda e
// valori al passaggio del mouse/tocco. mesi: [{ id, etichetta, etichettaLunga, a, b }].
// conTotali: accanto a ogni voce della legenda il totale dei mesi mostrati.
export default function ColonneDoppie({ mesi, serie, formatta, conTotali = false }) {
  const [attivo, setAttivo] = useState(null)
  const massimo = massimoTondo(Math.max(...mesi.flatMap((m) => [m.a, m.b]), 0))
  const h = (v) => `${(v / massimo) * 100}%`
  const scelto = mesi.find((m) => m.id === attivo)

  return (
    <div className="colonne-doppie">
      <div className="legenda-linea">
        {serie.map((s) => (
          <span key={s.chiave}>
            <span className="pallino" style={{ background: s.colore }} />{s.etichetta}
            {conTotali && <strong className="totale-legenda">{formatta(mesi.reduce((t, m) => t + m[s.chiave], 0))}</strong>}
          </span>
        ))}
      </div>
      <div className="area-colonne" onMouseLeave={() => setAttivo(null)}>
        <div className="asse-y">
          <span>{compatto(massimo)}</span>
          <span>{compatto(massimo / 2)}</span>
          <span>0</span>
        </div>
        <div className="griglia-colonne">
          {/* le barre partono sopra la riga dei mesi (1.3rem): le linee seguono la stessa scala */}
          <span className="linea-griglia" style={{ bottom: 'calc(1.3rem + (100% - 1.3rem))' }} />
          <span className="linea-griglia" style={{ bottom: 'calc(1.3rem + (100% - 1.3rem) * 0.5)' }} />
          {mesi.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`gruppo-colonne ${attivo === m.id ? 'attivo' : ''}`}
              onMouseEnter={() => setAttivo(m.id)}
              onFocus={() => setAttivo(m.id)}
              onClick={() => setAttivo(m.id)}
              aria-label={`${m.etichettaLunga}: ${serie[0].etichetta} ${formatta(m.a)}, ${serie[1].etichetta} ${formatta(m.b)}`}
            >
              <span className="coppia">
                <span className="barretta" style={{ height: h(m.a), background: serie[0].colore }} />
                <span className="barretta" style={{ height: h(m.b), background: serie[1].colore }} />
              </span>
              <span className="etichetta-mese">{m.etichetta}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="dettaglio-colonne">
        {scelto ? (
          <>
            <strong>{scelto.etichettaLunga}</strong> · {serie[0].etichetta} {formatta(scelto.a)} · {serie[1].etichetta} {formatta(scelto.b)}
            {' · '}Saldo <strong className={scelto.a - scelto.b >= 0 ? 'positivo' : 'negativo'}>{formatta(scelto.a - scelto.b)}</strong>
          </>
        ) : (
          <span className="nota">Passa o tocca un mese per vedere i valori.</span>
        )}
      </p>
    </div>
  )
}
