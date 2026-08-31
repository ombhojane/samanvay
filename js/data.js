// CSV loading + shared app context (corridor, date, plan assignments).

function parseCsv(text) {
  const lines = text.trim().split('\n')
  const cols = lines[0].split(',')
  return lines.slice(1).map((line) => {
    const cells = line.split(',')
    const row = {}
    cols.forEach((c, i) => (row[c] = (cells[i] || '').trim()))
    return row
  })
}

async function fetchCsv(name) {
  const res = await fetch(`data/${name}`)
  if (!res.ok) throw new Error(`Failed to load ${name}`)
  return parseCsv(await res.text())
}

function parseTasks(rows, source) {
  return rows.map((r) => ({
    id: r.task_id,
    assetId: r.asset_id,
    source,
    department: r.department,
    workType: r.work_type,
    description: r.description,
    corridorId: r.corridor_id,
    from: r.from_station,
    to: r.to_station,
    durationMin: +r.duration_min,
    dueDate: r.due_date,
    risk: r.safety_risk,
    status: r.status,
  }))
}

async function loadData() {
  const [corr, tt, tms, smms, tdms, blk] = await Promise.all([
    fetchCsv('Corridors.csv'),
    fetchCsv('Train_Timetable.csv'),
    fetchCsv('TMS.csv'),
    fetchCsv('SMMS.csv'),
    fetchCsv('TDMS.csv'),
    fetchCsv('Blocks.csv'),
  ])

  const corridors = []
  for (const r of corr) {
    let c = corridors.find((c) => c.id === r.corridor_id)
    if (!c) {
      c = { id: r.corridor_id, name: r.corridor_name, division: r.division, stations: [] }
      corridors.push(c)
    }
    c.stations.push({ code: r.station_code, name: r.station_name, km: +r.km, tier: r.tier })
  }
  for (const c of corridors) c.stations.sort((a, b) => a.km - b.km)

  const trains = []
  for (const r of tt) {
    let t = trains.find((t) => t.no === r.train_no && t.corridorId === r.corridor_id)
    if (!t) {
      t = {
        no: r.train_no,
        name: r.train_name,
        type: r.train_type,
        direction: r.direction,
        corridorId: r.corridor_id,
        stops: [],
      }
      trains.push(t)
    }
    t.stops.push({ code: r.station_code, km: +r.km, arr: toMin(r.arr), dep: toMin(r.dep) })
  }

  const tasks = [...parseTasks(tms, 'TMS'), ...parseTasks(smms, 'SMMS'), ...parseTasks(tdms, 'TDMS')]

  const blocks = blk.map((r) => ({
    id: r.block_id,
    corridorId: r.corridor_id,
    date: r.date,
    from: r.from_station,
    to: r.to_station,
    start: toMin(r.start),
    end: toMin(r.end),
    type: r.block_type,
  }))

  return { corridors, trains, tasks, blocks }
}

// ---------------------------------------------------------------- shared context

const CTX_KEY = 'samanvay-ctx-v1'
const PLAN_KEY = 'samanvay-plan-v1'
const DEFAULT_DATE = '2026-09-01'

function getCtx() {
  try {
    const c = JSON.parse(localStorage.getItem(CTX_KEY) || '{}')
    return { corridorId: c.corridorId || 'C2', date: c.date || DEFAULT_DATE }
  } catch {
    return { corridorId: 'C2', date: DEFAULT_DATE }
  }
}

function setCtx(patch) {
  const c = { ...getCtx(), ...patch }
  try {
    localStorage.setItem(CTX_KEY, JSON.stringify(c))
  } catch {}
  return c
}

function getAssignments() {
  try {
    return JSON.parse(localStorage.getItem(PLAN_KEY) || '{}')
  } catch {
    return {}
  }
}

function setAssignments(a) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(a))
  } catch {}
}
