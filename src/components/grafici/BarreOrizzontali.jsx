// Barre orizzontali a serie singola: etichetta a sinistra, barra, valore in punta.
// voci: [{ id, etichetta, valore, colore? }]; onScegli(voce) rende le barre cliccabili.
export default function BarreOrizzontali({ voci, formatta, onScegli, vuoto = 'Nessun dato.' }) {
  if (!voci.length) return <p className="nota">{vuoto}</p>
  const massimo = Math.max(...voci.map((v) => v.valore), 0) || 1

  return (
    <div className="barre" role="list">
      {voci.map((v) => {
        const contenuto = (
          <>
            <span className="barra-etichetta">{v.etichetta}</span>
            <span className="barra-traccia">
              <span className="barra" style={{ width: `${Math.max((v.valore / massimo) * 100, 0.5)}%`, ...(v.colore ? { background: v.colore } : {}) }} />
              <span className="barra-valore">{formatta(v.valore)}</span>
            </span>
          </>
        )
        return onScegli ? (
          <button key={v.id} type="button" role="listitem" className="barra-riga cliccabile" title={`${v.etichetta}: ${formatta(v.valore)}`} onClick={() => onScegli(v)}>
            {contenuto}
          </button>
        ) : (
          <div key={v.id} role="listitem" className="barra-riga" title={`${v.etichetta}: ${formatta(v.valore)}`}>
            {contenuto}
          </div>
        )
      })}
    </div>
  )
}
