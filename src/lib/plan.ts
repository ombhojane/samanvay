import type { Block, Corridor, Task, Train } from './types'

export const SETUP_BUFFER = 15 // min kept free inside a block for protection/setup

export interface Segment {
  t0: number
  t1: number
  km0: number
  km1: number
}

/** A train's movement as line segments (travel + dwell), in minutes × km. */
export function trainSegments(train: Train): Segment[] {
  const segs: Segment[] = []
  const stops = train.stops
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]
    if (s.dep > s.arr) segs.push({ t0: s.arr, t1: s.dep, km0: s.km, km1: s.km })
    if (i + 1 < stops.length) {
      const n = stops[i + 1]
      // guard against midnight wrap in generated data
      if (n.arr >= s.dep) segs.push({ t0: s.dep, t1: n.arr, km0: s.km, km1: n.km })
    }
  }
  return segs
}

/** Time interval during which a segment is inside [kmA, kmB], or null. */
function segmentInRange(seg: Segment, kmA: number, kmB: number): [number, number] | null {
  const lo = Math.min(seg.km0, seg.km1)
  const hi = Math.max(seg.km0, seg.km1)
  if (hi < kmA || lo > kmB) return null
  if (seg.km0 === seg.km1) return [seg.t0, seg.t1] // dwell inside range
  const tAt = (km: number) => seg.t0 + ((km - seg.km0) / (seg.km1 - seg.km0)) * (seg.t1 - seg.t0)
  const kEnter = Math.min(Math.max(seg.km0, kmA), kmB)
  const kExit = Math.min(Math.max(seg.km1, kmA), kmB)
  const t1 = tAt(kEnter)
  const t2 = tAt(kExit)
  return [Math.min(t1, t2), Math.max(t1, t2)]
}

export interface FreeWindow {
  kmA: number
  kmB: number
  fromCode: string
  toCode: string
  start: number
  end: number
}

/** Per adjacent-station section, intervals of the day with no train inside. */
export function freeWindows(corridor: Corridor, trains: Train[], minLen = 40): FreeWindow[] {
  const out: FreeWindow[] = []
  const segsByTrain = trains.map(trainSegments)
  for (let i = 0; i + 1 < corridor.stations.length; i++) {
    const a = corridor.stations[i]
    const b = corridor.stations[i + 1]
    const busy: [number, number][] = []
    for (const segs of segsByTrain)
      for (const seg of segs) {
        const iv = segmentInRange(seg, a.km, b.km)
        if (iv && iv[1] > iv[0]) busy.push(iv)
      }
    busy.sort((x, y) => x[0] - y[0])
    const merged: [number, number][] = []
    for (const iv of busy) {
      const last = merged[merged.length - 1]
      if (last && iv[0] <= last[1] + 2) last[1] = Math.max(last[1], iv[1])
      else merged.push([...iv])
    }
    let cursor = 0
    for (const [s, e] of [...merged, [1440, 1440] as [number, number]]) {
      const sc = Math.min(s, 1440)
      if (sc - cursor >= minLen)
        out.push({ kmA: a.km, kmB: b.km, fromCode: a.code, toCode: b.code, start: cursor, end: sc })
      cursor = Math.max(cursor, e)
      if (cursor >= 1440) break
    }
  }
  return out
}

/** Merged intervals when any train occupies the km range — for density strips. */
export function busyIntervals(trains: Train[], kmA: number, kmB: number): [number, number][] {
  const busy: [number, number][] = []
  for (const train of trains)
    for (const seg of trainSegments(train)) {
      const iv = segmentInRange(seg, kmA, kmB)
      if (iv && iv[1] > iv[0]) busy.push(iv)
    }
  busy.sort((x, y) => x[0] - y[0])
  const merged: [number, number][] = []
  for (const iv of busy) {
    const last = merged[merged.length - 1]
    if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1])
    else merged.push([...iv])
  }
  return merged
}

export interface Conflict {
  train: Train
  at: number // minutes — when it enters the block section
}

export function stationKm(corridor: Corridor, code: string): number {
  return corridor.stations.find((s) => s.code === code)?.km ?? 0
}

/** Trains whose path crosses the block's section during its window. */
export function blockConflicts(block: Block, corridor: Corridor, trains: Train[]): Conflict[] {
  const kmA = Math.min(stationKm(corridor, block.from), stationKm(corridor, block.to))
  const kmB = Math.max(stationKm(corridor, block.from), stationKm(corridor, block.to))
  const out: Conflict[] = []
  for (const train of trains) {
    if (train.corridorId !== block.corridorId) continue
    let hit: number | null = null
    for (const seg of trainSegments(train)) {
      const iv = segmentInRange(seg, kmA, kmB)
      if (iv && iv[1] > block.start && iv[0] < block.end) {
        hit = hit === null ? Math.max(iv[0], block.start) : Math.min(hit, Math.max(iv[0], block.start))
      }
    }
    if (hit !== null) out.push({ train, at: hit })
  }
  return out.sort((a, b) => a.at - b.at)
}

// ---------------------------------------------------------------- urgency

export function overdueDays(task: Task, refDate: string): number {
  const ms = new Date(refDate + 'T00:00:00').getTime() - new Date(task.dueDate + 'T00:00:00').getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

export function isCritical(task: Task, refDate: string): boolean {
  return task.risk === 'High' && (overdueDays(task, refDate) > 0 || daysUntilDue(task, refDate) <= 2)
}

export function daysUntilDue(task: Task, refDate: string): number {
  const ms = new Date(task.dueDate + 'T00:00:00').getTime() - new Date(refDate + 'T00:00:00').getTime()
  return Math.round(ms / 86400000)
}

const riskWeight = { High: 3, Medium: 2, Low: 1 }

/** Sort key: higher = more urgent. Internal only — the UI shows facts, not scores. */
export function urgency(task: Task, refDate: string): number {
  return riskWeight[task.risk] * 10 + overdueDays(task, refDate) * 4 - Math.max(0, daysUntilDue(task, refDate))
}

// ---------------------------------------------------------------- feasibility

export interface Feasibility {
  ok: boolean
  reasons: string[] // why not, when !ok
}

export function isFeasible(
  task: Task,
  block: Block,
  corridor: Corridor,
  alreadyAssignedMin: number,
): Feasibility {
  const reasons: string[] = []
  if (task.corridorId !== block.corridorId) reasons.push('different corridor')
  const tA = Math.min(stationKm(corridor, task.from), stationKm(corridor, task.to))
  const tB = Math.max(stationKm(corridor, task.from), stationKm(corridor, task.to))
  const bA = Math.min(stationKm(corridor, block.from), stationKm(corridor, block.to))
  const bB = Math.max(stationKm(corridor, block.from), stationKm(corridor, block.to))
  if (tB < bA || tA > bB) reasons.push(`work site ${task.from}–${task.to} outside block section`)
  if (task.department === 'Traction' && block.type !== 'power')
    reasons.push('OHE work needs a power block')
  const capacity = block.end - block.start - SETUP_BUFFER
  const left = capacity - alreadyAssignedMin
  if (task.durationMin > left)
    reasons.push(
      alreadyAssignedMin > 0
        ? `needs ${task.durationMin}m, only ${Math.max(0, left)}m left in window`
        : `needs ${task.durationMin}m, window has ${Math.max(0, left)}m usable`,
    )
  return { ok: reasons.length === 0, reasons }
}

// ---------------------------------------------------------------- recommendation

export interface BlockPlanInfo {
  block: Block
  conflicts: Conflict[]
  assigned: Task[]
  assignedMin: number
  capacityMin: number
  utilization: number // 0..1 of usable capacity
}

export interface Recommendation {
  block: Block
  picks: Task[]
  facts: string[]
  criticalCovered: number
  utilization: number
  conflictCount: number
}

/** Greedy pack of unassigned tasks into a block, most urgent first. */
export function packBlock(
  block: Block,
  corridor: Corridor,
  candidates: Task[],
  refDate: string,
  alreadyMin = 0,
): Task[] {
  const sorted = [...candidates].sort((a, b) => urgency(b, refDate) - urgency(a, refDate))
  const picks: Task[] = []
  let used = alreadyMin
  for (const t of sorted) {
    if (isFeasible(t, block, corridor, used).ok) {
      picks.push(t)
      used += t.durationMin
    }
  }
  return picks
}

export function recommend(
  blocks: Block[],
  corridor: Corridor,
  trains: Train[],
  unassigned: Task[],
  refDate: string,
  assignedMinByBlock: Record<string, number>,
): Recommendation[] {
  const recs: Recommendation[] = []
  for (const block of blocks) {
    const already = assignedMinByBlock[block.id] ?? 0
    const picks = packBlock(block, corridor, unassigned, refDate, already)
    if (picks.length === 0) continue
    const conflicts = blockConflicts(block, corridor, trains)
    if (conflicts.length > 0) continue // never suggest a window that touches running trains
    const capacity = block.end - block.start - SETUP_BUFFER
    const mins = picks.reduce((s, t) => s + t.durationMin, 0)
    const util = Math.min(1, (already + mins) / capacity)
    const crit = picks.filter((t) => isCritical(t, refDate)).length
    const depts = [...new Set(picks.map((t) => t.department))]
    const facts: string[] = []
    facts.push(`fits ${picks.map((t) => t.id).join(' + ')}`)
    if (crit > 0) facts.push(`clears ${crit} critical`)
    if (depts.length > 1) facts.push(`bundles ${depts.join(' + ')}`)
    facts.push(
      conflicts.length === 0 ? 'zero train conflicts' : `${conflicts.length} train conflicts`,
    )
    facts.push(`${Math.round(util * 100)}% of window used`)
    recs.push({ block, picks, facts, criticalCovered: crit, utilization: util, conflictCount: conflicts.length })
  }
  // a window that touches running trains is never recommended above a clean one
  return recs.sort(
    (a, b) =>
      a.conflictCount - b.conflictCount ||
      b.criticalCovered - a.criticalCovered ||
      b.utilization - a.utilization ||
      a.block.start - b.block.start,
  )
}
