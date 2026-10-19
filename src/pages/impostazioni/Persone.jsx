import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import RigaVoce from '../../components/RigaVoce'
import AggiungiVoce from '../../components/AggiungiVoce'

export default function Persone() {
  const [persone, setPersone] = useState([])
  const [archiviate, setArchiviate] = useState(false)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    const { data, error } = await supabase.from('persone').select('*').order('nome')
    if (error) return setErrore(messaggioErrore(error))
    setPersone(data)
  }, [])

  useEffect(() => { carica() }, [carica])

  async function esegui(richiesta) {
    const { error } = await richiesta
    if (error) return messaggioErrore(error)
    await carica()
    return ''
  }

  return (
    <div className="scheda">
      <div className="intestazione-scheda">
        <h2>Persone</h2>
        <label className="interruttore">
          <input type="checkbox" checked={archiviate} onChange={(e) => setArchiviate(e.target.checked)} />
          Mostra archiviate
        </label>
      </div>
      <p className="nota">Le persone con cui dividi le spese. Compaiono nel menù "Con chi dividere".</p>
      {errore && <p className="errore">{errore}</p>}
      {persone.filter((p) => archiviate || p.attiva).map((p) => (
        <RigaVoce
          key={p.id}
          nome={p.nome}
          attiva={p.attiva}
          onRinomina={(nome) => esegui(supabase.from('persone').update({ nome }).eq('id', p.id))}
          onArchivia={() => esegui(supabase.from('persone').update({ attiva: !p.attiva }).eq('id', p.id))}
          onElimina={() => esegui(supabase.from('persone').delete().eq('id', p.id))}
        />
      ))}
      <AggiungiVoce segnaposto="Nome della persona" onAggiungi={(nome) => esegui(supabase.from('persone').insert({ nome }))} />
    </div>
  )
}
