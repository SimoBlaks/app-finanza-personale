// Traduce gli errori del database in messaggi comprensibili.
export function messaggioErrore(errore) {
  if (!errore) return ''
  switch (errore.code) {
    case '23503':
      return 'Questa voce è usata altrove e non si può eliminare: puoi archiviarla.'
    case '23505':
      return 'Esiste già una voce con questo nome.'
    case '23514':
      return 'Uno dei valori inseriti non è valido.'
    case 'P0001':
      return errore.message
    case '42501':
      return 'Non hai i permessi per questa operazione. Prova a uscire e rientrare.'
    default:
      return errore.message || 'Si è verificato un errore.'
  }
}
