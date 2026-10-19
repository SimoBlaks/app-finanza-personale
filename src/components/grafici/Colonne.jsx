// Colonne a serie singola (es. spese mese per mese). Il valore compare al passaggio
// del mouse/tocco e per la colonna selezionata; le altre restano senza numero.
export default function Colonne({ voci, formatta, selezionata, onScegli }) {
  const massimo = Math.max(...voci.map((v) => v.valore), 0) || 1
  return (
    <div className="colonne" role="list">
      {voci.map((v) => (
        <button
          key={v.id}
          type="button"
          role="listitem"
          className={`colonna ${v.id === selezionata ? 'selezionata' : ''}`}
          title={`${v.etichettaLunga ?? v.etichetta}: ${formatta(v.valore)}`}
          aria-label={`${v.etichettaLunga ?? v.etichetta}: ${formatta(v.valore)}`}
          onClick={() => onScegli?.(v)}
        >
          <span className="colonna-valore">{formatta(v.valore)}</span>
          <span className="colonna-traccia">
            <span className="colonna-barra" style={{ height: `${v.valore > 0 ? Math.max((v.valore / massimo) * 100, 2) : 0}%` }} />
          </span>
          <span className="colonna-etichetta">{v.etichetta}</span>
        </button>
      ))}
    </div>
  )
}
