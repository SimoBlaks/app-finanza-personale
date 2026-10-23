import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro, inCentesimi, oggiISO } from '../../lib/numeri'
import { dataBreve, meseCorrente, nomeMese } from '../../lib/date'
import { caricaAlbero, percorso } from '../../lib/categorie'
import { fattore } from '../../lib/investimenti'
import { liquiditaMensile, patrimonioMensile } from '../../lib/patrimonio'
import ColonneDoppie from '../../components/grafici/ColonneDoppie'
import BarreOrizzontali from '../../components/grafici/BarreOrizzontali'
import Variazione from '../../components/Variazione'

const meseBreve = (am) => new Date(`${am}-15T12:00:00`).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '')
const cent = (v) => inCentesimi(String(v ?? 0))
const percento = (x) => `${x.toLocaleString('it-IT', { maximumFractionDigits: 1, useGrouping: 'always' })}%`

// Tutte le righe di una richiesta, a pagine da 1000 (il limite delle API).
async function tutteLeRighe(richiesta) {
  const righe = []
  for (let da = 0; ; da += 1000) {
    const { data, error } = await richiesta().range(da, da + 999)
    if (error) return { error }
    righe.push(...data)
    if (data.length < 1000) return { data: righe }
  }
}

// Riepilogo di un anno (vedi DECISIONI.md): entrate, uscite e risparmio confrontati con l'anno prima,
// mese per mese, categorie e spese principali, investimenti e spese condivise.
export default function Riepilogo() {
  const [anno, setAnno] = useState(() => Number(oggiISO().slice(0, 4)))
  const [base, setBase] = useState(null) // dati che non dipendono dall'anno
  const [movimenti, setMovimenti] = useState(null) // transazioni dell'anno e di quello prima
  const [errore, setErrore] = useState('')

  useEffect(() => {
    ;(async () => {
      const [liq, mensile, asset, operazioni, storico, condivise, rimborsi, proventi, persone, albero] = await Promise.all([
        supabase.from('liquidita').select('*').maybeSingle(),
        supabase.from('riepilogo_mensile').select('mese, movimento_liquidita').order('mese'),
        supabase.from('asset').select('*'),
        supabase.from('operazioni_investimento').select('*'),
        supabase.from('prezzi_storici').select('asset_id, data, prezzo_chiusura'),
        supabase.from('transazioni').select('data, pagata_da, importo_totale, quota_personale').eq('condivisa', true),
        supabase.from('pagamenti_saldo').select('data, direzione, importo, persona_id'),
        supabase.from('proventi_investimento').select('data, importo_netto, tasse'),
        supabase.from('persone').select('id, nome'),
        caricaAlbero(),
      ])
      const err = liq.error || mensile.error || asset.error || operazioni.error || storico.error || condivise.error || rimborsi.error ||
        proventi.error || persone.error || albero.errore
      if (err) return setErrore(messaggioErrore(err))
      setBase({
        liquidita: liq.data, mensile: mensile.data, asset: asset.data, operazioni: operazioni.data, storico: storico.data,
        condivise: condivise.data, rimborsi: rimborsi.data, proventi: proventi.data, persone: persone.data, albero,
      })
    })()
  }, [])

  useEffect(() => {
    setMovimenti(null)
    tutteLeRighe(() =>
      supabase
        .from('transazioni')
        .select('id, data, tipo, nota, importo_totale, quota_personale, macrocategoria_id, categoria_id, microcategoria_id, condivisa, persona_id')
        .gte('data', `${anno - 1}-01-01`)
        .lte('data', `${anno}-12-31`)
        .order('id'),
    ).then(({ data, error }) => (error ? setErrore(messaggioErrore(error)) : setMovimenti(data)))
  }, [anno])

  // patrimonio a fine mese (stessa regola del grafico della dashboard)
  const patrimonio = useMemo(() => {
    if (!base) return null
    const liquidita = liquiditaMensile(base.liquidita, base.mensile, meseCorrente())
    return patrimonioMensile({
      liquidita, asset: base.asset, operazioni: base.operazioni, prezzi: base.storico,
      condivise: base.condivise, rimborsi: base.rimborsi, oggi: oggiISO(),
    })
  }, [base])

  const annoOggi = Number(oggiISO().slice(0, 4))
  const primoAnno = base ? Number((base.liquidita?.data_saldo_iniziale ?? base.mensile[0]?.mese ?? oggiISO()).slice(0, 4)) : annoOggi
  // titolo e frecce restano fermi mentre si carica un altro anno
  const titolo = (
    <>
      <div className="intestazione-scheda">
        <h1>Riepilogo {anno}</h1>
        <Link to="/" className="piccolo-link">‹ Dashboard</Link>
      </div>
      <div className="selettore-mese">
        <button className="piccolo" onClick={() => setAnno((a) => a - 1)} disabled={!base || anno <= primoAnno} aria-label="Anno precedente">‹</button>
        <strong>{anno}{anno === annoOggi && <span className="fino-a-oggi"> (fino a oggi)</span>}</strong>
        <button className="piccolo" onClick={() => setAnno((a) => a + 1)} disabled={anno >= annoOggi} aria-label="Anno successivo">›</button>
      </div>
    </>
  )
  if (!base || !movimenti) return <section className="riepilogo">{titolo}{errore ? <p className="errore">{errore}</p> : <p className="caricamento">Caricamento…</p>}</section>

  const diAnno = (a) => movimenti.filter((t) => t.data.startsWith(String(a)))
  const quest = diAnno(anno)
  const prima = diAnno(anno - 1)
  const totali = (righe) => {
    const entrate = righe.filter((t) => t.tipo === 'incasso').reduce((s, t) => s + cent(t.quota_personale), 0) / 100
    const uscite = righe.filter((t) => t.tipo === 'spesa').reduce((s, t) => s + cent(t.quota_personale), 0) / 100
    return { entrate, uscite, risparmio: entrate - uscite, tasso: entrate > 0 ? ((entrate - uscite) / entrate) * 100 : null }
  }
  const t = totali(quest)
  const tp = totali(prima)
  const haAnnoPrima = anno - 1 >= primoAnno

  // patrimonio: da fine anno precedente (o dall'inizio dei dati) a fine anno (o a oggi)
  const puntoA = (am) => [...patrimonio].reverse().find((p) => p.id <= am)
  const fine = puntoA(`${anno}-12`)
  const inizio = puntoA(`${anno - 1}-12`) ?? patrimonio[0]

  // mese per mese (per l'anno in corso fino al mese attuale)
  const ultimoMese = anno === annoOggi ? Number(meseCorrente().slice(5, 7)) : 12
  const mesi = Array.from({ length: ultimoMese }, (_, i) => {
    const am = `${anno}-${String(i + 1).padStart(2, '0')}`
    const tm = totali(quest.filter((x) => x.data.startsWith(am)))
    return { id: am, etichetta: meseBreve(am), etichettaLunga: nomeMese(am), a: tm.entrate, b: tm.uscite, risparmio: tm.risparmio }
  })
  const mesiConDati = mesi.filter((m) => m.a || m.b)
  const meseMigliore = mesiConDati.length ? mesiConDati.reduce((x, y) => (y.risparmio > x.risparmio ? y : x)) : null
  const mesePiuCaro = mesiConDati.length ? mesiConDati.reduce((x, y) => (y.b > x.b ? y : x)) : null

  // categorie di spesa (macro) e confronto con l'anno prima
  const perMacro = (righe) => {
    const m = new Map()
    for (const x of righe.filter((r) => r.tipo === 'spesa')) m.set(x.macrocategoria_id, (m.get(x.macrocategoria_id) ?? 0) + cent(x.quota_personale))
    return m
  }
  const macroQuest = perMacro(quest)
  const macroPrima = perMacro(prima)
  const categorie = [...macroQuest.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 10)
    .map(([id, c]) => ({
      id,
      etichetta: `${base.albero.mappa[id]?.nome ?? '?'} · ${percento(t.uscite ? (c / 100 / t.uscite) * 100 : 0)}`,
      valore: c / 100,
      extra: haAnnoPrima ? <Variazione attuale={c / 100} prima={(macroPrima.get(id) ?? 0) / 100} tipo="spesa" /> : null,
    }))

  const speseGrandi = quest.filter((x) => x.tipo === 'spesa').sort((x, y) => cent(y.quota_personale) - cent(x.quota_personale)).slice(0, 5)

  // investimenti dell'anno
  const perId = Object.fromEntries(base.asset.map((a) => [a.id, a]))
  const opsAnno = base.operazioni.filter((o) => o.data.startsWith(String(anno)))
  const versato = opsAnno.filter((o) => o.tipo === 'acquisto').reduce((s, o) => s + Number(o.quantita) * Number(o.prezzo) * fattore(perId[o.asset_id]) + Number(o.spese), 0)
  const vendite = opsAnno.filter((o) => o.tipo === 'vendita')
  const incassato = vendite.reduce((s, o) => s + Number(o.liquidita_incassata), 0)
  const plusvalenze = vendite.reduce((s, o) => s + Number(o.plusvalore), 0)
  const proventiAnno = base.proventi.filter((p) => p.data.startsWith(String(anno)))
  const proventiNetti = proventiAnno.reduce((s, p) => s + Number(p.importo_netto), 0)
  const tasseInvestimenti = vendite.reduce((s, o) => s + Number(o.tasse), 0) + proventiAnno.reduce((s, p) => s + Number(p.tasse), 0)
  const conInvestimenti = opsAnno.length > 0 || proventiAnno.length > 0

  // spese condivise e rimborsi per persona
  const nomePersona = (id) => base.persone.find((p) => p.id === id)?.nome ?? '?'
  const perPersona = new Map()
  const voce = (id) => perPersona.get(id) ?? perPersona.set(id, { totale: 0, mia: 0, ricevuti: 0, pagati: 0 }).get(id)
  for (const x of quest.filter((r) => r.condivisa)) {
    const v = voce(x.persona_id)
    v.totale += cent(x.importo_totale)
    v.mia += cent(x.quota_personale)
  }
  for (const r of base.rimborsi.filter((r) => r.data.startsWith(String(anno)))) {
    const v = voce(r.persona_id)
    if (r.direzione === 'ricevuto') v.ricevuti += cent(r.importo)
    else v.pagati += cent(r.importo)
  }

  const confronto = (attuale, precedente, tipo) => (haAnnoPrima ? <Variazione attuale={attuale} prima={precedente} tipo={tipo} /> : null)

  return (
    <section className="riepilogo">
      {titolo}
      {errore && <p className="errore">{errore}</p>}

      <div className="riepilogo-kpi">
        <div className="scheda"><span className="nota">Entrate</span><strong className="importo incasso">{euro(t.entrate)}</strong>{confronto(t.entrate, tp.entrate, 'incasso')}</div>
        <div className="scheda"><span className="nota">Uscite (tua quota)</span><strong className="importo spesa">{euro(t.uscite)}</strong>{confronto(t.uscite, tp.uscite, 'spesa')}</div>
        <div className="scheda"><span className="nota">Risparmiato</span><strong className="importo">{euro(t.risparmio)}</strong>{confronto(t.risparmio, tp.risparmio, 'incasso')}</div>
        <div className="scheda">
          <span className="nota">Tasso di risparmio</span>
          <strong className="importo">{t.tasso === null ? '—' : percento(t.tasso)}</strong>
          {haAnnoPrima && tp.tasso !== null && t.tasso !== null && (
            <span className={`variazione-voce ${t.tasso >= tp.tasso ? 'meglio' : 'peggio'}`}>
              {t.tasso >= tp.tasso ? '▲' : '▼'} {Math.abs(t.tasso - tp.tasso).toLocaleString('it-IT', { maximumFractionDigits: 1, useGrouping: 'always' })} punti percentuali
            </span>
          )}
        </div>
      </div>
      {haAnnoPrima && <p className="nota">Le frecce confrontano con il {anno - 1}{anno === annoOggi ? ' intero' : ''}.</p>}

      {fine && inizio && (
        <div className="scheda">
          <h2>Patrimonio</h2>
          <dl className="dati">
            <dt>{inizio.id === `${anno - 1}-12` ? `A fine ${anno - 1}` : `All'inizio dei dati (${nomeMese(inizio.id)})`}</dt><dd>{euro(inizio.valore)}</dd>
            <dt>{fine.id === `${anno}-12` ? `A fine ${anno}` : `Oggi (${nomeMese(fine.id)})`}</dt><dd>{euro(fine.valore)}</dd>
            <dt><strong>Variazione</strong></dt><dd className={fine.valore >= inizio.valore ? 'ok' : 'perdita'}><strong>{fine.valore >= inizio.valore ? '+' : '−'}{euro(Math.abs(fine.valore - inizio.valore))}</strong></dd>
          </dl>
          <p className="nota">Investimenti valutati all'ultimo prezzo inserito fino a quella data, altrimenti al costo di acquisto (PMC).</p>
        </div>
      )}

      <div className="scheda">
        <h2>Mese per mese</h2>
        <ColonneDoppie
          mesi={mesi}
          serie={[
            { chiave: 'a', etichetta: 'Entrate', colore: 'var(--entrate)' },
            { chiave: 'b', etichetta: 'Uscite', colore: 'var(--uscite)' },
          ]}
          formatta={euro}
        />
        {meseMigliore && (
          <p className="nota">
            Mese con più risparmio: <strong>{nomeMese(meseMigliore.id)}</strong> ({euro(meseMigliore.risparmio)}) · mese con più uscite:{' '}
            <strong>{nomeMese(mesePiuCaro.id)}</strong> ({euro(mesePiuCaro.b)})
          </p>
        )}
      </div>

      <div className="scheda">
        <h2>Dove sono andati i soldi</h2>
        <BarreOrizzontali voci={categorie} formatta={euro} vuoto="Nessuna spesa in questo anno." />
      </div>

      {speseGrandi.length > 0 && (
        <div className="scheda">
          <h2>Le spese più grandi</h2>
          <div className="elenco-movimenti">
            {speseGrandi.map((s) => (
              <div key={s.id} className="movimento statico">
                <span className="movimento-testo">
                  <strong>{s.nota || percorso(base.albero, s.macrocategoria_id, s.categoria_id)}</strong>
                  <span className="nota">{dataBreve(s.data)} · {percorso(base.albero, s.macrocategoria_id, s.categoria_id, s.microcategoria_id)}</span>
                </span>
                <span className="importo spesa">{euro(s.quota_personale)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {conInvestimenti && (
        <div className="scheda">
          <h2>Investimenti</h2>
          <dl className="dati">
            <dt>Versato (acquisti con spese)</dt><dd>{euro(versato)}</dd>
            <dt>Incassato dalle vendite (netto)</dt><dd>{euro(incassato)}</dd>
            {vendite.length > 0 && <><dt>{plusvalenze >= 0 ? 'Plusvalenze realizzate' : 'Minusvalenze realizzate'}</dt><dd className={plusvalenze >= 0 ? 'ok' : 'perdita'}>{euro(plusvalenze)}</dd></>}
            <dt>Dividendi e cedole netti</dt><dd>{euro(proventiNetti)}</dd>
            <dt>Tasse pagate</dt><dd>{euro(tasseInvestimenti)}</dd>
          </dl>
        </div>
      )}

      {perPersona.size > 0 && (
        <div className="scheda">
          <h2>Spese condivise</h2>
          {[...perPersona.entries()].map(([id, v]) => (
            <dl key={id} className="dati riquadro-persona">
              <dt><strong>{nomePersona(id)}</strong></dt><dd />
              {v.totale > 0 && <><dt>Spese divise (totale)</dt><dd>{euro(v.totale / 100)}</dd><dt>Di cui tua quota</dt><dd>{euro(v.mia / 100)}</dd></>}
              {v.ricevuti > 0 && <><dt>Rimborsi ricevuti</dt><dd>{euro(v.ricevuti / 100)}</dd></>}
              {v.pagati > 0 && <><dt>Rimborsi pagati</dt><dd>{euro(v.pagati / 100)}</dd></>}
            </dl>
          ))}
        </div>
      )}
    </section>
  )
}
