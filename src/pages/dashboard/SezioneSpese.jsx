import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, inCentesimi } from '../../lib/numeri'
import { dataBreve, meseCorrente, nomeMese, spostaMese } from '../../lib/date'
import BarreOrizzontali from '../../components/grafici/BarreOrizzontali'
import Colonne from '../../components/grafici/Colonne'

const NESSUNA = 'nessuna'
const nomeMeseBreve = (m) => new Date(2026, m, 15).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')

// Somma le quote personali raggruppando per chiave; restituisce le voci ordinate.
function raggruppa(spese, chiave, nome) {
  const totali = new Map()
  for (const s of spese) {
    const k = s[chiave] ?? NESSUNA
    totali.set(k, (totali.get(k) ?? 0) + inCentesimi(String(s.quota_personale)))
  }
  return [...totali.entries()]
    .map(([id, c]) => ({ id, etichetta: nome(id), valore: c / 100 }))
    .sort((a, b) => b.valore - a.valore)
}

// Spese per categoria (SPEC 3.2): vista mese o anno, con discesa macro → categoria → micro.
export default function SezioneSpese({ albero }) {
  const [vista, setVista] = useState('mese')
  const [mese, setMese] = useState(meseCorrente)
  const [filtro, setFiltro] = useState({}) // { macroId, catId, microId }
  const [spese, setSpese] = useState([])
  const [tutte, setTutte] = useState(false)
  const [errore, setErrore] = useState('')
  const anno = mese.slice(0, 4)

  useEffect(() => {
    supabase
      .from('transazioni')
      .select('id, data, nota, quota_personale, macrocategoria_id, categoria_id, microcategoria_id')
      .eq('tipo', 'spesa')
      .gte('data', `${anno}-01-01`)
      .lte('data', `${anno}-12-31`)
      .order('data', { ascending: false })
      .then(({ data, error }) => (error ? setErrore(messaggioErrore(error)) : setSpese(data)))
  }, [anno])

  const nome = (id, vuoto) => (id === NESSUNA ? vuoto : albero.mappa[id]?.nome ?? '?')

  // spese dell'anno che rispettano il filtro di categoria
  const perCategoria = useMemo(
    () =>
      spese.filter(
        (s) =>
          (!filtro.macroId || s.macrocategoria_id === filtro.macroId) &&
          (!filtro.catId || (s.categoria_id ?? NESSUNA) === filtro.catId) &&
          (!filtro.microId || (s.microcategoria_id ?? NESSUNA) === filtro.microId),
      ),
    [spese, filtro],
  )
  const delPeriodo = vista === 'mese' ? perCategoria.filter((s) => s.data.startsWith(mese)) : perCategoria
  const totale = delPeriodo.reduce((t, s) => t + inCentesimi(String(s.quota_personale)), 0) / 100

  // livello del grafico a barre secondo il filtro
  const perBarre = delPeriodo
  let barre
  let scegli
  if (!filtro.macroId) {
    barre = raggruppa(perBarre, 'macrocategoria_id', (id) => nome(id))
    scegli = (v) => setFiltro({ macroId: v.id })
  } else if (!filtro.catId) {
    barre = raggruppa(perBarre, 'categoria_id', (id) => nome(id, 'Senza categoria'))
    scegli = (v) => setFiltro({ ...filtro, catId: v.id })
  } else if (filtro.catId !== NESSUNA) {
    barre = raggruppa(perBarre, 'microcategoria_id', (id) => nome(id, 'Senza microcategoria'))
    scegli = filtro.microId ? null : (v) => setFiltro({ ...filtro, microId: v.id })
  } else {
    barre = []
  }

  const colonne = Array.from({ length: 12 }, (_, i) => {
    const am = `${anno}-${String(i + 1).padStart(2, '0')}`
    const c = perCategoria.filter((s) => s.data.startsWith(am)).reduce((t, s) => t + inCentesimi(String(s.quota_personale)), 0)
    return { id: am, etichetta: nomeMeseBreve(i), etichettaLunga: nomeMese(am), valore: c / 100 }
  })

  const briciole = [
    { etichetta: 'Tutte', filtro: {} },
    filtro.macroId && { etichetta: nome(filtro.macroId), filtro: { macroId: filtro.macroId } },
    filtro.catId && { etichetta: nome(filtro.catId, 'Senza categoria'), filtro: { macroId: filtro.macroId, catId: filtro.catId } },
    filtro.microId && { etichetta: nome(filtro.microId, 'Senza microcategoria'), filtro },
  ].filter(Boolean)

  const elenco = tutte ? delPeriodo : delPeriodo.slice(0, 10)

  return (
    <div className="scheda sezione-spese">
      <div className="intestazione-scheda">
        <h2>Spese</h2>
        <div className="interruttore-vista">
          <button className={vista === 'mese' ? 'attivo' : ''} onClick={() => setVista('mese')}>Mese</button>
          <button className={vista === 'anno' ? 'attivo' : ''} onClick={() => setVista('anno')}>Anno</button>
        </div>
      </div>
      <div className="selettore-mese">
        <button className="piccolo" onClick={() => setMese((m) => spostaMese(m, vista === 'mese' ? -1 : -12))} aria-label="Periodo precedente">‹</button>
        <strong>{vista === 'mese' ? nomeMese(mese) : anno}</strong>
        <button className="piccolo" onClick={() => setMese((m) => spostaMese(m, vista === 'mese' ? 1 : 12))} aria-label="Periodo successivo">›</button>
      </div>
      {errore && <p className="errore">{errore}</p>}

      <nav className="briciole" aria-label="Filtro categoria">
        {briciole.map((b, i) =>
          i === briciole.length - 1 ? (
            <span key={i}>{b.etichetta}</span>
          ) : (
            <span key={i}>
              <button className="link" onClick={() => setFiltro(b.filtro)}>{b.etichetta}</button> ›{' '}
            </span>
          ),
        )}
      </nav>
      <p className="totale-periodo">Totale (tua quota): <strong>{euro(totale)}</strong></p>

      {vista === 'anno' && (
        <Colonne
          voci={colonne}
          formatta={euro}
          onScegli={(v) => { setMese(v.id); setVista('mese') }}
        />
      )}

      {barre.length > 0 && <BarreOrizzontali voci={barre} formatta={euro} onScegli={scegli ?? undefined} />}
      {!delPeriodo.length && <p className="nota">Nessuna spesa in questo periodo.</p>}

      {delPeriodo.length > 0 && (
        <>
          <h3>Elenco spese</h3>
          <div className="elenco-movimenti">
            {elenco.map((s) => (
              <div key={s.id} className="movimento statico">
                <span className="movimento-testo">
                  <strong>{s.nota || nome(s.categoria_id ?? s.macrocategoria_id)}</strong>
                  <span className="nota">
                    {dataBreve(s.data)} · {[s.macrocategoria_id, s.categoria_id, s.microcategoria_id].filter(Boolean).map((id) => nome(id)).join(' > ')}
                  </span>
                </span>
                <span className="importo">{euro(s.quota_personale)}</span>
              </div>
            ))}
          </div>
          {delPeriodo.length > 10 && (
            <button className="piccolo" onClick={() => setTutte((x) => !x)}>
              {tutte ? 'Mostra meno' : `Mostra tutte (${delPeriodo.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
