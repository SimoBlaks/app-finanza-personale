import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { caricaAlbero, percorso } from '../../lib/categorie'
import SceltaCategoria from '../../components/SceltaCategoria'
import { useConferma } from '../../components/Conferma'
import { nomeScorciatoia, scorciatoiaAttiva, tipiTransazione } from '../../lib/scorciatoie'

// Scorciatoie di categoria: pulsanti nella schermata di una nuova transazione (vedi DECISIONI.md).
export default function Scorciatoie() {
  const [albero, setAlbero] = useState(null)
  const [scorciatoie, setScorciatoie] = useState([])
  const [modulo, setModulo] = useState(null) // null | { id?, tipo, categoria, nome }
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const conferma = useConferma()

  const carica = useCallback(async () => {
    const [a, s] = await Promise.all([caricaAlbero(), supabase.from('scorciatoie_categoria').select('*').order('ordine').order('created_at')])
    if (a.errore || s.error) return setErrore(messaggioErrore(a.errore || s.error))
    setAlbero(a)
    setScorciatoie(s.data)
  }, [])

  useEffect(() => { carica() }, [carica])

  async function esegui(...richieste) {
    setErrore('')
    for (const r of richieste) {
      const { error } = await r
      if (error) return setErrore(messaggioErrore(error))
    }
    await carica()
  }

  async function salva(e) {
    e.preventDefault()
    if (!modulo.categoria.macroId) return setErrore('Scegli almeno la macrocategoria.')
    const dati = {
      tipo: modulo.tipo,
      macrocategoria_id: modulo.categoria.macroId,
      categoria_id: modulo.categoria.catId || null,
      microcategoria_id: modulo.categoria.microId || null,
      nome: modulo.nome.trim() || null,
      nota: modulo.nota.trim() || null,
    }
    const ultimo = Math.max(0, ...scorciatoie.map((s) => s.ordine))
    setInvio(true)
    await esegui(
      modulo.id
        ? supabase.from('scorciatoie_categoria').update(dati).eq('id', modulo.id)
        : supabase.from('scorciatoie_categoria').insert({ ...dati, ordine: ultimo + 1 }),
    )
    setInvio(false)
    setModulo(null)
  }

  // sposta su o giù scambiando la posizione con la vicina (riassegna 1..n per evitare pari merito)
  function sposta(indice, verso) {
    const nuovo = [...scorciatoie]
    const [voce] = nuovo.splice(indice, 1)
    nuovo.splice(indice + verso, 0, voce)
    esegui(...nuovo.map((s, i) => (s.ordine === i + 1 ? null : supabase.from('scorciatoie_categoria').update({ ordine: i + 1 }).eq('id', s.id))).filter(Boolean))
  }

  async function elimina(s) {
    if (!(await conferma({ titolo: `Eliminare la scorciatoia "${nomeScorciatoia(albero, s)}"?`, conferma: 'Elimina', pericolo: true }))) return
    esegui(supabase.from('scorciatoie_categoria').delete().eq('id', s.id))
  }

  if (!albero) return <div className="scheda">{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</div>

  if (modulo)
    return (
      <form className="scheda modulo" onSubmit={salva}>
        <h2>{modulo.id ? 'Modifica scorciatoia' : 'Nuova scorciatoia'}</h2>
        <div className="interruttore-tipo" role="radiogroup">
          {Object.entries(tipiTransazione).map(([t, etichetta]) => (
            <button type="button" key={t} className={modulo.tipo === t ? `selezionato ${t}` : ''} onClick={() => setModulo((m) => ({ ...m, tipo: t }))}>
              {etichetta}
            </button>
          ))}
        </div>
        <div>
          <span className="etichetta-campo">Categoria</span>
          <SceltaCategoria albero={albero} valore={modulo.categoria} onChange={(v) => setModulo((m) => ({ ...m, categoria: v }))} />
        </div>
        <label>
          Nome del pulsante (facoltativo)
          <input
            value={modulo.nome}
            onChange={(e) => { const nome = e.target.value; setModulo((m) => ({ ...m, nome })) }}
            placeholder={modulo.categoria.macroId ? nomeScorciatoia(albero, { macrocategoria_id: modulo.categoria.macroId, categoria_id: modulo.categoria.catId, microcategoria_id: modulo.categoria.microId }) : 'Es. Supermercato'}
          />
        </label>
        <label>
          Nota da compilare (facoltativa)
          <input
            value={modulo.nota}
            onChange={(e) => { const nota = e.target.value; setModulo((m) => ({ ...m, nota })) }}
            placeholder="Es. Spesa all'Esselunga"
          />
        </label>
        <p className="nota">Usando la scorciatoia, la nota della transazione si compila con questo testo; puoi comunque modificarla.</p>
        {errore && <p className="errore">{errore}</p>}
        <div className="azioni-modulo">
          <button type="button" onClick={() => { setErrore(''); setModulo(null) }}>Annulla</button>
          <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
        </div>
      </form>
    )

  return (
    <div className="scheda">
      <div className="intestazione-scheda">
        <h2>Scorciatoie</h2>
        <button className="piccolo" onClick={() => setModulo({ tipo: 'spesa', categoria: {}, nome: '', nota: '' })}>+ Nuova scorciatoia</button>
      </div>
      <p className="nota">
        Pulsanti che compaiono in alto quando registri una nuova transazione: un tocco imposta il tipo, la categoria e, se l'hai scritta, la nota. Usa le frecce per mettere prima quelle che usi di più.
      </p>
      {errore && <p className="errore">{errore}</p>}
      {!scorciatoie.length && <p className="nota">Nessuna scorciatoia.</p>}
      {scorciatoie.map((s, i) => (
        <div key={s.id} className="riga-voce">
          <div className="riga-principale">
            <span className="riga-nome">
              <strong>{nomeScorciatoia(albero, s)}</strong>
              <span className="etichetta">{tipiTransazione[s.tipo]}</span>
              {!scorciatoiaAttiva(albero, s) && <span className="etichetta attenzione">categoria archiviata</span>}
              <span className="nota percorso-scorciatoia">
                {percorso(albero, s.macrocategoria_id, s.categoria_id, s.microcategoria_id)}{s.nota && ` · nota: "${s.nota}"`}
              </span>
            </span>
            <span className="riga-azioni">
              <button className="piccolo" onClick={() => sposta(i, -1)} disabled={i === 0} aria-label="Sposta su">↑</button>
              <button className="piccolo" onClick={() => sposta(i, 1)} disabled={i === scorciatoie.length - 1} aria-label="Sposta giù">↓</button>
              <button
                className="piccolo"
                onClick={() => setModulo({ id: s.id, tipo: s.tipo, nome: s.nome ?? '', nota: s.nota ?? '', categoria: { macroId: s.macrocategoria_id, catId: s.categoria_id, microId: s.microcategoria_id } })}
              >
                Modifica
              </button>
              <button className="piccolo pericolo" onClick={() => elimina(s)}>Elimina</button>
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
