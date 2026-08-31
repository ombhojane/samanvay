import { csvParse } from 'd3-dsv'
import type { Block, Corridor, DataSet, Task, Train } from './types'

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const fmtMin = (min: number): string => {
  min = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export const fmtDur = (min: number): string => {
  min = Math.round(min)
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ''}`.trim() : `${min}m`
}

type Row = Record<string, string>

async function fetchCsv(name: string): Promise<Row[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!res.ok) throw new Error(`Failed to load ${name}`)
  return csvParse(await res.text()) as unknown as Row[]
}

function parseTasks(rows: Row[], source: Task['source']): Task[] {
  return rows.map((r) => ({
    id: r.task_id!,
    assetId: r.asset_id!,
    source,
    department: r.department as Task['department'],
    workType: r.work_type!,
    description: r.description!,
    corridorId: r.corridor_id!,
    from: r.from_station!,
    to: r.to_station!,
    durationMin: +r.duration_min!,
    dueDate: r.due_date!,
    risk: r.safety_risk as Task['risk'],
    status: r.status!,
  }))
}

export async function loadData(): Promise<DataSet> {
  const [corr, tt, tms, smms, tdms, blk] = await Promise.all([
    fetchCsv('Corridors.csv'),
    fetchCsv('Train_Timetable.csv'),
    fetchCsv('TMS.csv'),
    fetchCsv('SMMS.csv'),
    fetchCsv('TDMS.csv'),
    fetchCsv('Blocks.csv'),
  ])

  const corridors: Corridor[] = []
  for (const r of corr) {
    let c = corridors.find((c) => c.id === r.corridor_id)
    if (!c) {
      c = { id: r.corridor_id!, name: r.corridor_name!, division: r.division!, stations: [] }
      corridors.push(c)
    }
    c.stations.push({ code: r.station_code!, name: r.station_name!, km: +r.km!, tier: r.tier as 'major' | 'minor' })
  }
  for (const c of corridors) c.stations.sort((a, b) => a.km - b.km)

  const trains: Train[] = []
  for (const r of tt) {
    let t = trains.find((t) => t.no === r.train_no && t.corridorId === r.corridor_id)
    if (!t) {
      t = {
        no: r.train_no!,
        name: r.train_name!,
        type: r.train_type as Train['type'],
        direction: r.direction as Train['direction'],
        corridorId: r.corridor_id!,
        stops: [],
      }
      trains.push(t)
    }
    t.stops.push({ code: r.station_code!, km: +r.km!, arr: toMin(r.arr!), dep: toMin(r.dep!) })
  }

  const tasks = [...parseTasks(tms, 'TMS'), ...parseTasks(smms, 'SMMS'), ...parseTasks(tdms, 'TDMS')]

  const blocks: Block[] = blk.map((r) => ({
    id: r.block_id!,
    corridorId: r.corridor_id!,
    date: r.date!,
    from: r.from_station!,
    to: r.to_station!,
    start: toMin(r.start!),
    end: toMin(r.end!),
    type: r.block_type as Block['type'],
  }))

  return { corridors, trains, tasks, blocks }
}
