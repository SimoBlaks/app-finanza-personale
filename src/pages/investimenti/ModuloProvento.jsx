import { useState } from 'react'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { useConferma } from '../../components/Conferma'
import { euro, leggiNumero, numero, oggiISO, perCampo } from '../../lib/numeri'

const tipoPredefinito = (a) => (a?.tipologia === 'obbligazione' ? 'cedola' : 'dividendo')
const tasseDa = (lordo, a) => (lordo && a ? (Math.round(Number(lordo) * Number(a.aliquota_tassa)) / 100).toFixed(2).replace('.', ',') : '')

// Dividendo o cedola incassati: lordo e tasse, il netto lo calcola il database.
// Le tasse si propongono con l'aliquota dell'asset finché non le si modifica a mano.
export default function ModuloProvento({ provento, asset, posizioni, onFine }) {
  const [f, setF] = useState({
    data: provento?.data ?? oggiISO(),
    asset_id: provento?.asset_id ?? '',
    tipo: provento?.tipo ?? 'dividendo',
    lordo: provento ? perCampo(provento.importo_lordo) : '',
    tasse: provento ? perCampo(provento.tasse) : '',
    nota: provento?.nota ?? '',
  })
  const [tasseAMano, setTasseAMano] = useState(!!provento)
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const conferma = useConferma()

  const posseduto = (id) => Number(posizioni.find((p) => p.asset_id === id)?.quantita ?? 0) > 0
  const scelte = asset.filter((a) => a.attivo || posseduto(a.id) || a.id === f.asset_id)
  const scelto = asset.find((a) => a.id === f.asset_id)

  function scegliAsset(id) {
    const a = asset.find((x) => x.id === id)
    setF((x) => ({ ...x, asset_id: id, tipo: tipoPredefinito(a), tasse: tasseAMano ? x.tasse : tasseDa(leggiNumero(x.lordo), a) }))
  }
  function cambiaLordo(testo) {
    setF((x) => ({ ...x, lordo: testo, tasse: tasseAMano ? x.tasse : tasseDa(leggiNumero(testo), scelto) }))
  }

  const lordo = leggiNumero(f.lordo)
  const tasse = leggiNumero(f.tasse) ?? '0'
  const netto = lordo ? Number(lordo) - Number(tasse) : null

  async function salva(e) {
    e.preventDefault()
    setErrore('')
    if (!f.asset_id) return setErrore('Scegli l\'asset.')
    if (!f.data) return setErrore('Indica la data.')
    if (!lordo || Number(lordo) <= 0) return setErrore('L\'importo lordo deve essere maggiore di zero.')
    if (leggiNumero(f.tasse || '0') === null || Number(tasse) < 0) return setErrore('Tasse non valide.')
    if (Number(tasse) > Number(lordo)) return setErrore('Le tasse non possono superare l\'importo lordo.')

    const dati = { data: f.data, tipo: f.tipo, asset_id: f.asset_id, importo_lordo: lordo, tasse, nota: f.nota.trim() || null }
    setInvio(true)
    const { error } = provento
      ? await supabase.from('proventi_investimento').update(dati).eq('id', provento.id)
      : await supabase.from('proventi_investimento').insert(dati)
    setInvio(false)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  async function elimina() {
    if (!(await conferma({ titolo: provento.tipo === 'cedola' ? 'Eliminare questa cedola?' : 'Eliminare questo dividendo?', conferma: 'Elimina', pericolo: true }))) return
    const { error } = await supabase.from('proventi_investimento').delete().eq('id', provento.id)
    if (error) return setErrore(messaggioErrore(error))
    onFine()
  }

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <h2>{provento ? 'Modifica dividendo / cedola' : 'Dividendo o cedola'}</h2>
      <div className="interruttore-tipo">
        <button type="button" className={f.tipo === 'dividendo' ? 'selezionato incasso' : ''} onClick={() => setF((x) => ({ ...x, tipo: 'dividendo' }))}>Dividendo</button>
        <button type="button" className={f.tipo === 'cedola' ? 'selezionato incasso' : ''} onClick={() => setF((x) => ({ ...x, tipo: 'cedola' }))}>Cedola</button>
      </div>
      <div className="griglia">
        <label>
          Asset
          <select value={f.asset_id} onChange={(e) => scegliAsset(e.target.value)}>
            <option value="">Scegli…</option>
            {scelte.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </label>
        <label>Data di incasso<input type="date" value={f.data} onChange={(e) => setF((x) => ({ ...x, data: e.target.value }))} /></label>
        <label>Importo lordo (€)<input inputMode="decimal" value={f.lordo} onChange={(e) => cambiaLordo(e.target.value)} /></label>
        <label>
          Tasse (€){scelto && !tasseAMano && <span className="nota"> calcolate al {numero(scelto.aliquota_tassa)}%, modificabili</span>}
          <input inputMode="decimal" value={f.tasse} onChange={(e) => { setTasseAMano(true); setF((x) => ({ ...x, tasse: e.target.value })) }} />
        </label>
        <label>Nota (facoltativa)<input value={f.nota} onChange={(e) => setF((x) => ({ ...x, nota: e.target.value }))} /></label>
      </div>
      {netto !== null && <p className="nota">Netto incassato sul conto: <strong>{euro(netto)}</strong></p>}
      <p className="nota">Aumenta la liquidità ma non conta tra le entrate né nel tasso di risparmio.</p>

      {errore && <p className="errore">{errore}</p>}
      <div className="azioni-modulo">
        {provento && <button type="button" className="pericolo" onClick={elimina}>Elimina</button>}
        <button type="button" onClick={onFine}>Annulla</button>
        <button className="primario" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}
