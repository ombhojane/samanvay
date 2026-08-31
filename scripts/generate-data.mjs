// Generates the demo datasets for Samanvay.
// Deterministic (seeded) so the demo is reproducible: node scripts/generate-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = new URL('../public/data/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// seeded PRNG (mulberry32)
let s = 20260901
const rnd = () => {
  s |= 0; s = (s + 0x6D2B79F5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const between = (a, b) => a + rnd() * (b - a)

// GTFS-style: times past midnight stay unwrapped ("25:10"), so a single
// service day stays monotonic and gap math matches what consumers compute.
const hhmm = (min) => {
  min = Math.max(0, Math.round(min))
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------- corridors
const corridors = [
  {
    id: 'C2', name: 'CSMT – Lonavala', division: 'Mumbai',
    stations: [
      ['CSMT', 'Mumbai CSMT', 0, 'major'],
      ['DR', 'Dadar', 9, 'minor'],
      ['TNA', 'Thane', 34, 'major'],
      ['DI', 'Dombivli', 49, 'minor'],
      ['KYN', 'Kalyan', 54, 'major'],
      ['BUD', 'Badlapur', 68, 'minor'],
      ['KJT', 'Karjat', 100, 'major'],
      ['KAD', 'Khandala', 123, 'minor'],
      ['LNL', 'Lonavala', 128, 'major'],
    ],
  },
  {
    id: 'C1', name: 'Kalyan – Kasara', division: 'Mumbai',
    stations: [
      ['KYN', 'Kalyan', 0, 'major'],
      ['TLA', 'Titwala', 13, 'minor'],
      ['ASO', 'Asangaon', 32, 'minor'],
      ['KSRA', 'Kasara', 67, 'major'],
    ],
  },
]

let corridorRows = ['corridor_id,corridor_name,division,station_code,station_name,km,tier']
for (const c of corridors)
  for (const [code, name, km, tier] of c.stations)
    corridorRows.push(`${c.id},${c.name},${c.division},${code},${name},${km},${tier}`)
writeFileSync(OUT + 'Corridors.csv', corridorRows.join('\n'))

// ---------------------------------------------------------------- timetable
// speeds km/h, dwell minutes
const TYPES = {
  Express:   { speed: 68, dwell: 2, stops: 'major' },
  Passenger: { speed: 46, dwell: 1, stops: 'all' },
  Suburban:  { speed: 42, dwell: 1, stops: 'all' },
  Goods:     { speed: 34, dwell: 4, stops: 'major' },
}

const ttRows = ['corridor_id,train_no,train_name,train_type,direction,station_code,km,arr,dep']
let trainSeq = 0
const genTrains = [] // {corridorId, stops:[{km, arr, dep}]} — for deriving real gaps

function addTrain(corridor, type, dir, startMin, opts = {}) {
  const cfg = TYPES[type]
  const stations = dir === 'down' ? corridor.stations : [...corridor.stations].reverse()
  const limitKm = opts.limitKm ?? Infinity
  const kms = stations.map((st) => st[2])
  const no = opts.no ?? `${type === 'Goods' ? 'G' : ''}${11000 + ++trainSeq * 7 + Math.floor(rnd() * 5)}`
  const name = opts.name ?? `${type} ${no}`
  let t = startMin
  let prevKm = null
  const rows = []
  const stops = []
  for (const [code, , km, tier] of stations) {
    if (Math.abs(km - kms[0]) > limitKm) break
    if (cfg.stops === 'major' && tier !== 'major' && km !== kms[0]) {
      continue // passes through, no row (path interpolates)
    }
    if (prevKm !== null) t += (Math.abs(km - prevKm) / cfg.speed) * 60 * between(0.95, 1.1)
    const arr = t
    const dep = arr + (km === kms[0] ? 0 : cfg.dwell)
    rows.push(`${corridor.id},${no},${name},${type},${dir},${code},${km},${hhmm(arr)},${hhmm(dep)}`)
    stops.push({ km, arr, dep })
    t = dep
    prevKm = km
  }
  ttRows.push(...rows)
  genTrains.push({ corridorId: corridor.id, stops })
}

const C2 = corridors[0], C1 = corridors[1]

// Expresses through the day, both directions
const expressNames = ['Deccan Exp', 'Pragati Exp', 'Indrayani Exp', 'Sinhagad Exp', 'Sahyadri Exp', 'Koyna Exp']
;[315, 435, 555, 690, 1020, 1140].forEach((t, i) =>
  addTrain(C2, 'Express', 'down', t + between(-10, 10), { name: expressNames[i] }))
;[350, 470, 610, 790, 1065, 1185].forEach((t, i) =>
  addTrain(C2, 'Express', 'up', t + between(-10, 10), { name: expressNames[(i + 3) % 6] }))

// Passengers — full corridor. Note the deliberate midday lull 10:45–13:30 beyond Kalyan.
;[270, 390, 510, 630, 840, 960, 1080, 1200].forEach((t) =>
  addTrain(C2, 'Passenger', 'down', t + between(-8, 8)))
;[300, 420, 540, 660, 870, 990, 1110, 1230].forEach((t) =>
  addTrain(C2, 'Passenger', 'up', t + between(-8, 8)))

// Suburban shuttles CSMT–Kalyan (54 km), dense in peaks
const peaks = [
  [285, 420, 22], // 04:45–07:00 every ~22
  [420, 630, 15], // 07:00–10:30 every 15
  [630, 990, 30], // 10:30–16:30 every 30
  [990, 1230, 16], // 16:30–20:30 every 16
  [1230, 1400, 30],
]
for (const [a, b, gap] of peaks)
  for (let t = a; t < b; t += gap * between(0.9, 1.15)) {
    addTrain(C2, 'Suburban', 'down', t, { limitKm: 54 })
    addTrain(C2, 'Suburban', 'up', t + between(0, 10), { limitKm: 54 })
  }

// Goods forecast (from COA): shoulders of the night + a couple midday,
// keeping the core 00:45–04:30 corridor free for maintenance
;[285, 630, 795, 1290, 1355].forEach((t) => addTrain(C2, 'Goods', 'down', t + between(-15, 15)))
;[300, 700, 1330].forEach((t) => addTrain(C2, 'Goods', 'up', t + between(-15, 15)))

// C1: lighter service
;[330, 540, 780, 1050, 1260].forEach((t) => addTrain(C1, 'Passenger', 'down', t + between(-8, 8)))
;[400, 620, 860, 1130, 1330].forEach((t) => addTrain(C1, 'Passenger', 'up', t + between(-8, 8)))
;[360, 660, 1170].forEach((t) => addTrain(C1, 'Express', 'down', t))
;[430, 730, 1240].forEach((t) => addTrain(C1, 'Express', 'up', t))
;[90, 870, 1350].forEach((t) => addTrain(C1, 'Goods', 'down', t + between(-15, 15)))

writeFileSync(OUT + 'Train_Timetable.csv', ttRows.join('\n'))

// ---------------------------------------------------------------- maintenance tasks
// Shared columns so the app can merge the three sources into one queue.
const header = 'task_id,asset_id,department,work_type,description,corridor_id,from_station,to_station,duration_min,due_date,safety_risk,status'
const day = (d) => `2026-09-${String(d).padStart(2, '0')}`
const aug = (d) => `2026-08-${String(d).padStart(2, '0')}`

const tms = [header,
  `T-142,TRK-C2-08,Engineering,Rail defect repair,Rail fracture suspect — USFD flagged between Thane and Dombivli,C2,TNA,DI,120,${aug(29)},High,Pending`,
  `T-118,TRK-C2-03,Engineering,Track inspection,Push-trolley inspection Dadar–Thane,C2,DR,TNA,60,${day(3)},Medium,Pending`,
  `T-131,TRK-C2-12,Engineering,Deep screening,Ballast deep screening Badlapur yard approach,C2,BUD,BUD,180,${day(6)},Medium,Pending`,
  `T-127,TRK-C2-15,Engineering,Rail grinding,Rail grinding Karjat–Khandala ghat section,C2,KJT,KAD,150,${day(5)},High,Pending`,
  `T-109,TRK-C2-01,Engineering,Points renewal,Turnout renewal at CSMT yard point 72B,C2,CSMT,CSMT,240,${day(9)},Medium,Pending`,
  `T-151,TRK-C2-19,Engineering,Welding,AT welding of joints Dombivli–Kalyan,C2,DI,KYN,90,${aug(31)},High,Pending`,
  `T-102,TRK-C1-04,Engineering,Track inspection,Curve realignment check Titwala–Asangaon,C1,TLA,ASO,75,${day(4)},Low,Pending`,
  `T-115,TRK-C1-07,Engineering,Fencing,Boundary fencing repair near Kasara,C1,ASO,KSRA,120,${day(11)},Low,Pending`,
  `T-160,TRK-C2-22,Engineering,Bridge inspection,Girder bridge 214 underside inspection,C2,KYN,BUD,90,${day(7)},Medium,Pending`,
  `T-166,TRK-C2-25,Engineering,Destressing,LWR destressing Khandala–Lonavala,C2,KAD,LNL,180,${day(12)},Low,Pending`,
]
writeFileSync(OUT + 'TMS.csv', tms.join('\n'))

const smms = [header,
  `S-72,SIG-C2-31,S&T,Signal inspection,Distant signal visibility check Thane home,C2,TNA,TNA,60,${day(1)},High,Pending`,
  `S-64,SIG-C2-18,S&T,Point machine overhaul,Point machine 63A overhaul at Kalyan,C2,KYN,KYN,90,${aug(30)},High,Pending`,
  `S-81,SIG-C2-44,S&T,Track circuit,Track circuit bonding renewal Dadar–Thane,C2,DR,TNA,75,${day(5)},Medium,Pending`,
  `S-58,SIG-C2-09,S&T,Cable check,Signalling cable meggering CSMT–Dadar,C2,CSMT,DR,30,${day(6)},Low,Pending`,
  `S-90,SIG-C2-52,S&T,Axle counter,Axle counter reset & calibration Karjat,C2,KJT,KJT,45,${day(4)},Medium,Pending`,
  `S-95,SIG-C1-12,S&T,Signal inspection,LED signal lamp replacement Titwala,C1,TLA,TLA,40,${day(3)},Medium,Pending`,
  `S-77,SIG-C1-08,S&T,Interlocking test,Route interlocking test Kasara,C1,KSRA,KSRA,120,${day(8)},High,Pending`,
  `S-99,SIG-C2-60,S&T,Cable check,Location box moisture inspection Badlapur,C2,BUD,BUD,30,${day(10)},Low,Pending`,
]
writeFileSync(OUT + 'SMMS.csv', smms.join('\n'))

const tdms = [header,
  `O-31,OHE-C2-21,Traction,OHE maintenance,Contact wire wear measurement Thane–Kalyan,C2,TNA,KYN,90,${day(2)},High,Pending`,
  `O-27,OHE-C2-14,Traction,Tension check,ATD tension check Karjat ghat,C2,KJT,KAD,60,${day(4)},Medium,Pending`,
  `O-44,OHE-C2-35,Traction,Insulator cleaning,Insulator cleaning & inspection Dombivli–Kalyan,C2,DI,KYN,120,${day(7)},Medium,Pending`,
  `O-19,PSI-C2-05,Traction,PSI maintenance,Switching station SP-4 breaker service Kalyan,C2,KYN,KYN,150,${aug(31)},High,Pending`,
  `O-52,OHE-C2-41,Traction,Mast painting,OHE mast corrosion treatment Khandala,C2,KAD,LNL,180,${day(13)},Low,Pending`,
  `O-38,OHE-C1-16,Traction,OHE maintenance,Dropper adjustment Asangaon–Kasara,C1,ASO,KSRA,90,${day(5)},Medium,Pending`,
  `O-46,OHE-C1-19,Traction,Earthing check,Structure earthing continuity Titwala,C1,TLA,TLA,45,${day(9)},Low,Pending`,
]
writeFileSync(OUT + 'TDMS.csv', tdms.join('\n'))

// ---------------------------------------------------------------- candidate blocks (from COA)
// COA derives candidate windows from real gaps in the timetable: for each
// major-to-major span, times when no train occupies any part of the span.
function freeGaps(corridorId, kmA, kmB, minLen = 75) {
  const busy = []
  for (const tr of genTrains) {
    if (tr.corridorId !== corridorId) continue
    const st = tr.stops
    for (let i = 0; i < st.length; i++) {
      const a = st[i]
      const segs = []
      if (a.dep > a.arr) segs.push([a.arr, a.dep, a.km, a.km])
      if (i + 1 < st.length) segs.push([a.dep, st[i + 1].arr, a.km, st[i + 1].km])
      for (const [t0, t1, k0, k1] of segs) {
        const lo = Math.min(k0, k1), hi = Math.max(k0, k1)
        if (hi < kmA || lo > kmB || t1 <= t0) continue
        let s0 = t0, s1 = t1
        if (k0 !== k1) {
          const tAt = (km) => t0 + ((km - k0) / (k1 - k0)) * (t1 - t0)
          const ta = tAt(Math.min(Math.max(k0, kmA), kmB))
          const tb = tAt(Math.min(Math.max(k1, kmA), kmB))
          s0 = Math.min(ta, tb); s1 = Math.max(ta, tb)
        }
        if (s1 > 0 && s0 < 1440) busy.push([Math.max(0, s0), Math.min(1440, s1)])
      }
    }
  }
  busy.sort((x, y) => x[0] - y[0])
  const merged = []
  for (const iv of busy) {
    const last = merged[merged.length - 1]
    if (last && iv[0] <= last[1] + 3) last[1] = Math.max(last[1], iv[1])
    else merged.push([...iv])
  }
  const free = []
  let cur = 0
  for (const [a, b] of [...merged, [1440, 1440]]) {
    if (a - cur >= minLen) free.push([cur, a])
    cur = Math.max(cur, b)
  }
  return free
}

const spans = {
  C2: [['CSMT', 'TNA'], ['TNA', 'KYN'], ['KYN', 'KJT'], ['KJT', 'LNL']],
  C1: [['KYN', 'ASO'], ['ASO', 'KSRA']],
}
const kmOf = {}
for (const c of corridors) for (const [code, , km] of c.stations) kmOf[`${c.id}:${code}`] = km

const blockRows = ['block_id,corridor_id,date,from_station,to_station,start,end,block_type']
let bseq = 100
for (let d = 1; d <= 28; d++) {
  for (const cid of ['C2', 'C1']) {
    let si = 0
    for (const [from, to] of spans[cid]) {
      const gaps = freeGaps(cid, kmOf[`${cid}:${from}`], kmOf[`${cid}:${to}`])
      for (const [g0, g1] of gaps) {
        if (rnd() < 0.2) continue // COA doesn't offer every window every day
        const start = g0 + 5 + Math.floor(rnd() * 8)
        const end = Math.min(g1 - 5, start + 240)
        if (end - start < 60) continue
        // alternate traffic/power so OHE work has somewhere to go
        const type = (si + d) % 2 === 0 ? 'power' : 'traffic'
        blockRows.push(`B-${++bseq},${cid},${day(d)},${from},${to},${hhmm(start)},${hhmm(end)},${type}`)
      }
      si++
    }
    // one deliberately over-optimistic COA request per corridor/day, placed
    // mid-morning when the section is certainly occupied, so the planner
    // always has a real conflict to flag
    const [cf, ct] = spans[cid][0]
    blockRows.push(`B-${++bseq},${cid},${day(d)},${cf},${ct},09:35,11:05,traffic`)
  }
}
writeFileSync(OUT + 'Blocks.csv', blockRows.join('\n'))

console.log('Wrote', OUT)
console.log('timetable rows:', ttRows.length - 1, '| blocks:', blockRows.length - 1)
