// Scorciatoie di categoria: nome mostrato sul pulsante e controllo che le voci siano ancora attive.

// "Pagamento" e non "Spesa", per non confonderlo con una scorciatoia della spesa al supermercato.
export const tipiTransazione = { spesa: 'Pagamento', incasso: 'Incasso' }

// Il nome scelto, altrimenti quello della voce più interna (micro, poi categoria, poi macro).
export function nomeScorciatoia(albero, s) {
  if (s.nome) return s.nome
  const id = s.microcategoria_id || s.categoria_id || s.macrocategoria_id
  return albero.mappa[id]?.nome ?? '?'
}

// Una scorciatoia si mostra nella registrazione solo se tutte le sue voci sono attive.
export function scorciatoiaAttiva(albero, s) {
  return [s.macrocategoria_id, s.categoria_id, s.microcategoria_id].filter(Boolean).every((id) => albero.mappa[id]?.attiva)
}
