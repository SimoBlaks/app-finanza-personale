// Disegna l'icona dell'app (portafoglio con due carte inclinate, vedi DECISIONI.md)
// e salva i PNG in public/. Nessuna dipendenza: forme calcolate punto per punto e PNG scritto a mano.
// Uso: node scripts/genera-icone.mjs
import fs from 'fs'
import zlib from 'zlib'

const colore = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const MENTA = colore('#2dd4bf')
const ORO = colore('#fdb022')
const BIANCO = colore('#ffffff')
const SCURO = colore('#0b5a54')
const CHIARO = colore('#14928a')

// Rettangolo arrotondato (x, y, larghezza, altezza, raggio), eventualmente ruotato di ang gradi
// attorno al suo centro, come rotate() negli SVG (in senso orario).
function dentroRett(px, py, { x, y, l, h, r, ang = 0 }) {
  const cx = x + l / 2
  const cy = y + h / 2
  const a = (-ang * Math.PI) / 180
  const lx = (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a)
  const ly = (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a)
  const dx = Math.max(Math.abs(lx) - (l / 2 - r), 0)
  const dy = Math.max(Math.abs(ly) - (h / 2 - r), 0)
  if (Math.abs(lx) > l / 2 || Math.abs(ly) > h / 2) return null
  return dx * dx + dy * dy <= r * r ? { lx, ly } : null
}

// Carta centrata in (cx, cy), 40×26, con la banda magnetica a 5 dal bordo alto.
const carta = (cx, cy, ang, tinta) => ({ cx, cy, ang, tinta })
const CARTE = [carta(46, 46, 28, MENTA), carta(58, 44, 40, ORO)]

// Colore del punto (x, y) nel disegno 100×100: forme dal fondo verso l'alto.
// Lo sfondo sfumato si calcola su (fx, fy), che nell'icona rimpicciolita restano le coordinate piene.
function punto(x, y, fx = x, fy = y) {
  const t = Math.min(Math.max((fx + fy) / 200, 0), 1)
  let c = CHIARO.map((v, i) => v + (SCURO[i] - v) * t)
  const sopra = (tinta, alfa = 1) => { c = c.map((v, i) => v + (tinta[i] - v) * alfa) }
  for (const k of CARTE) {
    const dentro = dentroRett(x, y, { x: k.cx - 20, y: k.cy - 13, l: 40, h: 26, r: 4, ang: k.ang })
    if (!dentro) continue
    sopra(k.tinta)
    if (dentro.ly >= -13 + 5 && dentro.ly <= -13 + 9) sopra(SCURO, 0.35)
  }
  if (dentroRett(x, y, { x: 20, y: 38, l: 60, h: 40, r: 8 })) sopra(BIANCO)
  if (dentroRett(x, y, { x: 58, y: 50, l: 22, h: 16, r: 5 })) sopra(ORO)
  if ((x - 66) ** 2 + (y - 58) ** 2 <= 9) sopra(BIANCO)
  return c
}

// Immagine lato×lato; scala < 1 rimpicciolisce il disegno attorno al centro (icona "maskable",
// dove i telefoni possono ritagliare i bordi). Ogni pixel è la media di 5×5 campioni.
function disegna(lato, scala = 1) {
  const N = 5
  const dati = Buffer.alloc(lato * (lato * 4 + 1))
  for (let py = 0; py < lato; py++) {
    dati[py * (lato * 4 + 1)] = 0
    for (let px = 0; px < lato; px++) {
      const somma = [0, 0, 0]
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = ((px + (sx + 0.5) / N) / lato) * 100
          const v = ((py + (sy + 0.5) / N) / lato) * 100
          // lo sfondo usa le coordinate piene, le forme quelle rimpicciolite
          const c = punto(50 + (u - 50) / scala, 50 + (v - 50) / scala, u, v)
          for (let i = 0; i < 3; i++) somma[i] += c[i]
        }
      }
      const o = py * (lato * 4 + 1) + 1 + px * 4
      for (let i = 0; i < 3; i++) dati[o + i] = Math.round(somma[i] / (N * N))
      dati[o + 3] = 255
    }
  }
  return png(lato, dati)
}

// PNG RGBA 8 bit a partire dalle righe già precedute dal byte di filtro.
function png(lato, righe) {
  const tabella = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = tabella[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const blocco = (tipo, dati) => {
    const lung = Buffer.alloc(4)
    lung.writeUInt32BE(dati.length)
    const corpo = Buffer.concat([Buffer.from(tipo), dati])
    const fine = Buffer.alloc(4)
    fine.writeUInt32BE(crc(corpo))
    return Buffer.concat([lung, corpo, fine])
  }
  const intestazione = Buffer.alloc(13)
  intestazione.writeUInt32BE(lato, 0)
  intestazione.writeUInt32BE(lato, 4)
  intestazione[8] = 8 // bit per canale
  intestazione[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocco('IHDR', intestazione),
    blocco('IDAT', zlib.deflateSync(righe, { level: 9 })),
    blocco('IEND', Buffer.alloc(0)),
  ])
}

const uscite = [
  ['public/icona-portafoglio-192.png', 192, 1],
  ['public/icona-portafoglio-512.png', 512, 1],
  ['public/icona-portafoglio-maskable-512.png', 512, 0.8],
  ['public/apple-touch-icon-portafoglio.png', 180, 1],
  ['public/favicon-portafoglio-32.png', 32, 1],
]
for (const [file, lato, scala] of uscite) {
  fs.writeFileSync(file, disegna(lato, scala))
  console.log(`${file} (${lato}×${lato})`)
}
