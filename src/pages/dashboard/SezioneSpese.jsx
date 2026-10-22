import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, inCentesimi } from '../../lib/numeri'
import { meseCorrente, nomeMese, spostaMese } from '../../lib/date'
import BarreOrizzontali from '../../components/grafici/BarreOrizzontali'
import Colonne from '../../components/grafici/Colonne'
import Ciambella from '../../components/grafici/Ciambella'
import { COLORE_ALTRO, mappaColori } from '../../components/grafici/colori'

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

// Spese o entrate per categoria (SPEC 3.2): vista mese o anno, con discesa macro → categoria → micro.
const tipi = { spesa: { titolo: 'Spese', singolare: 'spesa' }, incasso: { titolo: 'Entrate', singolare: 'entrata' } }

export default function SezioneSpese({ albero, meseIniziale }) {
  const [tipo, setTipo] = useState('spesa')
  const [vista, setVista] = useState('mese')
  const [mese, setMese] = useState(() => meseIniziale ?? meseCorrente())
  const [filtro, setFiltro] = useState({}) // { macroId, catId, microId }
  const [spese, setSpese] = useState([])
  const [errore, setErrore] = useState('')
  const anno = mese.slice(0, 4)

  useEffect(() => {
    supabase
      .from('transazioni')
      .select('id, data, quota_personale, macrocategoria_id, categoria_id, microcategoria_id')
      .eq('tipo', tipo)
      .gte('data', `${anno}-01-01`)
      .lte('data', `${anno}-12-31`)
      .order('data', { ascending: false })
      .then(({ data, error }) => (error ? setErrore(messaggioErrore(error)) : setSpese(data)))
  }, [anno, tipo])

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

  // Colore fisso per macrocategoria, deciso sulle spese dell'intero anno:
  // le 7 più grandi hanno un colore proprio, le altre finiscono in "Altro".
  const colori = useMemo(() => {
    const totali = new Map()
    for (const s of spese) totali.set(s.macrocategoria_id, (totali.get(s.macrocategoria_id) ?? 0) + Number(s.quota_personale))
    return mappaColori(totali, 7)
  }, [spese])
  const coloreMacro = filtro.macroId ? colori.get(filtro.macroId) : null

  // livello del grafico secondo il filtro: ciambella per le macro, barre per i livelli sotto
  const perBarre = delPeriodo
  let barre
  let scegli
  let fette = null
  if (!filtro.macroId) {
    const perMacro = raggruppa(perBarre, 'macrocategoria_id', (id) => nome(id))
    const conColore = perMacro.filter((v) => colori.get(v.id) !== COLORE_ALTRO)
    const altre = perMacro.filter((v) => colori.get(v.id) === COLORE_ALTRO)
    fette = conColore.map((v) => ({ ...v, colore: colori.get(v.id) }))
    if (altre.length) fette.push({ id: 'altro', etichetta: `Altro (${altre.map((a) => a.etichetta).join(', ')})`, valore: altre.reduce((t, a) => t + a.valore, 0), colore: COLORE_ALTRO })
    barre = []
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

  // cambiando tra spese ed entrate si riparte da "Tutte" le categorie
  function cambiaTipo(k) {
    if (k === tipo) return
    setSpese([])
    setFiltro({})
    setTipo(k)
  }

  return (
    <div className="scheda sezione-spese">
      <div className="intestazione-scheda">
        <div className="interruttore-vista sezione-tipo" role="group" aria-label="Spese o entrate">
          {Object.entries(tipi).map(([k, t]) => (
            <button key={k} className={tipo === k ? 'attivo' : ''} aria-pressed={tipo === k} onClick={() => cambiaTipo(k)}>{t.titolo}</button>
          ))}
        </div>
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
      {/* con la ciambella il totale è già al centro: si mostra solo scendendo nelle categorie */}
      {!fette?.length && delPeriodo.length > 0 && <p className="totale-periodo">Totale (tua quota): <strong>{euro(totale)}</strong></p>}

      {vista === 'anno' && (
        <Colonne
          voci={colonne}
          formatta={euro}
          onScegli={(v) => { setMese(v.id); setVista('mese') }}
        />
      )}

      {fette && fette.length > 0 && (
        <Ciambella voci={fette} formatta={euro} titoloCentro={vista === 'mese' ? 'Nel mese' : "Nell'anno"} onScegli={scegli} scegliibile={(v) => v.id !== 'altro'} />
      )}
      {barre.length > 0 && (
        <BarreOrizzontali voci={barre.map((b) => ({ ...b, colore: coloreMacro }))} formatta={euro} onScegli={scegli ?? undefined} />
      )}
      {!delPeriodo.length && <p className="nota">Nessuna {tipi[tipo].singolare} in questo periodo.</p>}
    </div>
  )
}
