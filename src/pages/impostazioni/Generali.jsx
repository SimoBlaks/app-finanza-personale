import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useSessione } from '../../auth/Sessione'
import { messaggioErrore } from '../../lib/errori'
import { leggiImporto, leggiNumero, oggiISO, perCampo } from '../../lib/numeri'
import AllineaLiquidita from './AllineaLiquidita'

export default function Generali() {
  const sessione = useSessione()
  const [f, setF] = useState(null)
  const [messaggio, setMessaggio] = useState({ testo: '', errore: false })

  useEffect(() => {
    supabase.from('impostazioni').select('*').maybeSingle().then(({ data, error }) => {
      if (error) return setMessaggio({ testo: messaggioErrore(error), errore: true })
      setF({
        saldo_iniziale: perCampo(data?.saldo_iniziale ?? 0),
        data_saldo_iniziale: data?.data_saldo_iniziale ?? oggiISO(),
        giorni_prezzo_vecchio_azioni: String(data?.giorni_prezzo_vecchio_azioni ?? 7),
        giorni_prezzo_vecchio_obbligazioni: String(data?.giorni_prezzo_vecchio_obbligazioni ?? 30),
        soglia_avviso_prezzo_pct: perCampo(data?.soglia_avviso_prezzo_pct ?? 20),
      })
    })
  }, [])

  if (!f) return <p className="caricamento">Caricamento…</p>

  const imposta = (campo, valore) => setF((x) => ({ ...x, [campo]: valore }))

  async function salva(e) {
    e.preventDefault()
    const saldo = leggiImporto(f.saldo_iniziale)
    const soglia = leggiNumero(f.soglia_avviso_prezzo_pct)
    const giorniA = Number(f.giorni_prezzo_vecchio_azioni)
    const giorniO = Number(f.giorni_prezzo_vecchio_obbligazioni)
    if (saldo === null) return setMessaggio({ testo: 'Saldo iniziale non valido: usa al massimo 2 decimali.', errore: true })
    if (!f.data_saldo_iniziale) return setMessaggio({ testo: 'Indica la data di partenza.', errore: true })
    if (!Number.isInteger(giorniA) || giorniA <= 0 || !Number.isInteger(giorniO) || giorniO <= 0)
      return setMessaggio({ testo: 'I giorni devono essere numeri interi maggiori di zero.', errore: true })
    if (soglia === null || Number(soglia) <= 0) return setMessaggio({ testo: 'Soglia di avviso non valida.', errore: true })

    const { error } = await supabase.from('impostazioni').upsert(
      {
        user_id: sessione.user.id,
        saldo_iniziale: saldo,
        data_saldo_iniziale: f.data_saldo_iniziale,
        giorni_prezzo_vecchio_azioni: giorniA,
        giorni_prezzo_vecchio_obbligazioni: giorniO,
        soglia_avviso_prezzo_pct: soglia,
      },
      { onConflict: 'user_id' },
    )
    setMessaggio(error ? { testo: messaggioErrore(error), errore: true } : { testo: 'Impostazioni salvate.', errore: false })
  }

  return (
    <>
    <form className="scheda modulo" onSubmit={salva}>
      <h2>Saldo iniziale</h2>
      <p className="nota">Il patrimonio in dashboard parte da questo saldo, alla data indicata.</p>
      <div className="griglia">
        <label>Saldo iniziale (€)<input inputMode="decimal" value={f.saldo_iniziale} onChange={(e) => imposta('saldo_iniziale', e.target.value)} /></label>
        <label>Data di partenza<input type="date" value={f.data_saldo_iniziale} onChange={(e) => imposta('data_saldo_iniziale', e.target.value)} /></label>
      </div>

      <h2>Prezzi degli investimenti</h2>
      <div className="griglia">
        <label>"Prezzo vecchio" dopo (giorni) – azioni ed ETF<input inputMode="numeric" value={f.giorni_prezzo_vecchio_azioni} onChange={(e) => imposta('giorni_prezzo_vecchio_azioni', e.target.value)} /></label>
        <label>"Prezzo vecchio" dopo (giorni) – obbligazioni<input inputMode="numeric" value={f.giorni_prezzo_vecchio_obbligazioni} onChange={(e) => imposta('giorni_prezzo_vecchio_obbligazioni', e.target.value)} /></label>
        <label>Avviso se il nuovo prezzo varia più del (%)<input inputMode="decimal" value={f.soglia_avviso_prezzo_pct} onChange={(e) => imposta('soglia_avviso_prezzo_pct', e.target.value)} /></label>
      </div>

      {messaggio.testo && <p className={messaggio.errore ? 'errore' : 'successo'}>{messaggio.testo}</p>}
      <div className="azioni-modulo">
        <button className="primario">Salva</button>
      </div>
    </form>
    <AllineaLiquidita />
    </>
  )
}
