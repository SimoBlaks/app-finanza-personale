import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, inCentesimi, oggiISO } from '../../lib/numeri'
import { limitiMese, meseCorrente, nomeMese, spostaMese } from '../../lib/date'
import Anello from '../../components/grafici/Anello'

// Tasso di risparmio del mese (SPEC 3.3), di default il mese precedente.
// Usa la quota personale; i rimborsi non contano.
export default function SezioneRisparmio() {
  const [mese, setMese] = useState(() => spostaMese(meseCorrente(), -1))
  const [dati, setDati] = useState(null)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    const { da, a } = limitiMese(mese)
    supabase
      .from('transazioni')
      .select('tipo, quota_personale')
      .gte('data', da)
      // le programmate (data futura) contano solo dal loro giorno
      .lte('data', [a, oggiISO()].sort()[0])
      .then(({ data, error }) => {
        if (error) return setErrore(messaggioErrore(error))
        let entrate = 0
        let uscite = 0
        for (const t of data) {
          const c = inCentesimi(String(t.quota_personale))
          if (t.tipo === 'incasso') entrate += c
          else uscite += c
        }
        setDati({ entrate: entrate / 100, uscite: uscite / 100, tasso: entrate > 0 ? ((entrate - uscite) / entrate) * 100 : null })
      })
  }, [mese])

  return (
    <div className="scheda scheda-risparmio">
      <div className="intestazione-scheda">
        <h2>Tasso di risparmio</h2>
        <div className="selettore-mese compatto">
          <button className="piccolo" onClick={() => setMese((m) => spostaMese(m, -1))} aria-label="Mese precedente">‹</button>
          <span>{nomeMese(mese)}</span>
          <button className="piccolo" onClick={() => setMese((m) => spostaMese(m, 1))} aria-label="Mese successivo">›</button>
        </div>
      </div>
      {errore && <p className="errore">{errore}</p>}
      {dati && (
        <div className="risparmio-corpo">
          <Anello percentuale={dati.tasso} />
          <dl className="dati risparmio-dati">
            <dt><span className="pallino" style={{ background: 'var(--entrate)' }} />Entrate</dt>
            <dd>{euro(dati.entrate)}</dd>
            <dt><span className="pallino" style={{ background: 'var(--uscite)' }} />Uscite</dt>
            <dd>{euro(dati.uscite)}</dd>
            <dt>Risparmiato</dt>
            <dd><strong>{euro(dati.entrate - dati.uscite)}</strong></dd>
          </dl>
          {dati.tasso === null && <p className="nota">Nessuna entrata nel mese: il tasso non è calcolabile.</p>}
        </div>
      )}
    </div>
  )
}
