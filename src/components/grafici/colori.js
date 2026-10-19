// Palette categoriale (validata per daltonismo, vedi skill dataviz): l'ordine conta.
// I valori veri sono variabili CSS (--serie-1 … --serie-8, --serie-altro) in stile.css,
// così il tema scuro usa le sue tonalità.
export const SLOT = 8
export const coloreSerie = (i) => (i < SLOT ? `var(--serie-${i + 1})` : 'var(--serie-altro)')
export const COLORE_ALTRO = 'var(--serie-altro)'

// Assegna un colore fisso a ogni voce in base al totale (le più grandi prendono i
// primi colori, le altre finiscono in "Altro"). Il colore segue la voce, non la
// posizione nel grafico: filtri e mesi diversi non lo cambiano.
export function mappaColori(totaliPerId, quanti = 7) {
  const ordinati = [...totaliPerId.entries()].sort((a, b) => b[1] - a[1])
  return new Map(ordinati.map(([id], i) => [id, i < quanti ? coloreSerie(i) : COLORE_ALTRO]))
}
