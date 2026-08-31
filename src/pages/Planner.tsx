import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../store'
import { fmtDur, fmtMin } from '../lib/data'
import {
  SETUP_BUFFER,
  blockConflicts,
  busyIntervals,
  daysUntilDue,
  isCritical,
  isFeasible,
  overdueDays,
  recommend,
  stationKm,
  urgency,
} from '../lib/plan'
import type { Block, Task } from '../lib/types'

const deptTag = (d: Task['department']) => (d === 'Engineering' ? 'ENG' : d === 'S&T' ? 'S&T' : 'TRD')

/** 24 h strip: gray = trains occupy this block's section, teal frame = the window. */
function DayStrip({ block, busy }: { block: Block; busy: [number, number][] }) {
  const W = 100 // percent-based
  return (
    <svg viewBox="0 0 1440 22" preserveAspectRatio="none" style={{ width: `${W}%`, height: 22, display: 'block' }}>
      <rect x={0} y={8} width={1440} height={6} fill="var(--surface-2)" rx={2} />
      {busy.map(([a, b], i) => (
        <rect key={i} x={a} y={8} width={Math.max(2, b - a)} height={6} fill="var(--ink-4)" />
      ))}
      <rect
        x={block.start}
        y={3}
        width={block.end - block.start}
        height={16}
        fill="rgba(15,118,110,0.12)"
        stroke="var(--accent)"
        strokeWidth={1.5}
        rx={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export default function Planner() {
  const { data, corridor, corridorId, date, setDate, assignments, assign, unassign, clearPlan } = useApp()
  const [params, setParams] = useSearchParams()
  const [horizon, setHorizon] = useState<'day' | 'week' | 'month'>('day')
  const [selTask, setSelTask] = useState<string | null>(params.get('task'))
  const [dragTask, setDragTask] = useState<string | null>(null)
  const [dropState, setDropState] = useState<{ blockId: string; ok: boolean; reasons: string[] } | null>(null)
  const [recoHover, setRecoHover] = useState<string | null>(null) // blockId
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const trains = useMemo(
    () => (data ? data.trains.filter((t) => t.corridorId === corridorId) : []),
    [data, corridorId],
  )

  const dayBlocks = useMemo(
    () =>
      (data?.blocks ?? [])
        .filter((b) => b.corridorId === corridorId && b.date === date)
        .sort((a, b) => a.start - b.start),
    [data, corridorId, date],
  )

  const tasks = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.corridorId === corridorId),
    [data, corridorId],
  )
  const unassigned = useMemo(
    () => tasks.filter((t) => !assignments[t.id]).sort((a, b) => urgency(b, date) - urgency(a, date)),
    [tasks, assignments, date],
  )

  const assignedMinByBlock = useMemo(() => {
    const m: Record<string, number> = {}
    for (const [taskId, a] of Object.entries(assignments)) {
      const t = data?.tasks.find((t) => t.id === taskId)
      if (t) m[a.blockId] = (m[a.blockId] ?? 0) + t.durationMin
    }
    return m
  }, [assignments, data])

  const recos = useMemo(
    () =>
      corridor
        ? recommend(dayBlocks, corridor, trains, unassigned, date, assignedMinByBlock).slice(0, 4)
        : [],
    [dayBlocks, corridor, trains, unassigned, date, assignedMinByBlock],
  )

  if (!data || !corridor) return <div className="loading">Scoring candidate windows…</div>

  const taskById = (id: string) => data.tasks.find((t) => t.id === id)

  const tryAssign = (taskId: string, block: Block) => {
    const t = taskById(taskId)
    if (!t) return
    const feas = isFeasible(t, block, corridor, assignedMinByBlock[block.id] ?? 0)
    if (feas.ok) {
      assign(taskId, block.id, block.date)
      setSelTask(null)
      setParams({}, { replace: true })
      setToast(`${taskId} scheduled in ${block.id} · ${fmtMin(block.start)}–${fmtMin(block.end)}`)
    } else {
      setToast(`Cannot place ${taskId}: ${feas.reasons[0]}`)
    }
  }

  const applyReco = (blockId: string, picks: Task[]) => {
    const block = dayBlocks.find((b) => b.id === blockId)
    if (!block) return
    for (const t of picks) assign(t.id, block.id, block.date)
    setToast(`${picks.length} task${picks.length > 1 ? 's' : ''} scheduled in ${blockId}`)
    setRecoHover(null)
  }

  const selected = selTask ? taskById(selTask) : null

  // -------------------------------------------------- week / month views
  if (horizon !== 'day') {
    const n = horizon === 'week' ? 7 : 28
    const days = Array.from({ length: n }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Block plan</h1>
          <span className="page-note">
            {horizon === 'week' ? 'Week of 01 Sep' : 'September 2026'}
          </span>
          <span className="spacer" />
          <div className="seg">
            <button onClick={() => setHorizon('day')}>Day</button>
            <button className={horizon === 'week' ? 'on' : ''} onClick={() => setHorizon('week')}>Week</button>
            <button className={horizon === 'month' ? 'on' : ''} onClick={() => setHorizon('month')}>Month</button>
          </div>
        </div>
        <div className="week-grid">
          {days.map((d) => {
            const blocks = data.blocks.filter((b) => b.corridorId === corridorId && b.date === d)
            const cap = blocks.reduce((s, b) => s + (b.end - b.start - SETUP_BUFFER), 0)
            const used = Object.entries(assignments)
              .filter(([, a]) => a.date === d && blocks.some((b) => b.id === a.blockId))
              .reduce((s, [tid]) => s + (taskById(tid)?.durationMin ?? 0), 0)
            const util = cap ? used / cap : 0
            const dow = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })
            return (
              <div
                key={d}
                className={`day-card ${d === date ? 'today' : ''}`}
                onClick={() => {
                  setDate(d)
                  setHorizon('day')
                }}
              >
                <h4>{dow}</h4>
                <div className="d-num">{d.slice(8)}</div>
                <div className="d-meta num">
                  {blocks.length} windows · {fmtDur(cap)} offered
                  <br />
                  {used ? `${fmtDur(used)} planned` : 'nothing planned'}
                </div>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, util * 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // -------------------------------------------------- day view
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Block plan</h1>
        <span className="page-note num">{dayBlocks.length} windows offered</span>
        <span className="spacer" />
        {Object.keys(assignments).length > 0 && (
          <button className="btn quiet" onClick={() => { clearPlan(); setToast('Plan cleared') }}>
            Clear plan
          </button>
        )}
        <div className="seg">
          <button className="on">Day</button>
          <button onClick={() => setHorizon('week')}>Week</button>
          <button onClick={() => setHorizon('month')}>Month</button>
        </div>
      </div>

      <div className="plan-grid">
        {/* ------------------------------------------------ backlog tray */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Unassigned</span>
            <span className="panel-count">{unassigned.length}</span>
            <span className="panel-count" style={{ marginLeft: 'auto' }}>drag onto a window</span>
          </div>
          <div className="panel-body">
            {unassigned.map((t) => {
              const crit = isCritical(t, date)
              const od = overdueDays(t, date)
              return (
                <div
                  key={t.id}
                  className={`tray-task ${dragTask === t.id ? 'dragging' : ''} ${selTask === t.id ? 'sel' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', t.id)
                    setDragTask(t.id)
                  }}
                  onDragEnd={() => { setDragTask(null); setDropState(null) }}
                  onClick={() => setSelTask(selTask === t.id ? null : t.id)}
                >
                  <div className="t-top">
                    {crit ? <span className="dot red" /> : od > 0 ? <span className="dot amber" /> : null}
                    <span className="tid">{t.id}</span>
                    <span className="dept">{deptTag(t.department)}</span>
                    <span className="num" style={{ marginLeft: 'auto' }}>
                      {t.durationMin}<span className="unit">m</span>
                    </span>
                  </div>
                  <div className="t-desc">{t.workType} · {t.from === t.to ? t.from : `${t.from}–${t.to}`}</div>
                  <div className="t-meta num">
                    {od > 0 ? (
                      <span className="overdue-txt">{od}d overdue</span>
                    ) : (
                      <span>due {daysUntilDue(t, date)}d</span>
                    )}
                    {t.department === 'Traction' && <span>needs power block</span>}
                  </div>
                </div>
              )
            })}
            {unassigned.length === 0 && <div className="empty" style={{ padding: 24 }}>All tasks placed. Corridor is covered.</div>}
          </div>
        </div>

        {/* ------------------------------------------------ block windows */}
        <div>
          {dayBlocks.map((b) => {
            const kmA = Math.min(stationKm(corridor, b.from), stationKm(corridor, b.to))
            const kmB = Math.max(stationKm(corridor, b.from), stationKm(corridor, b.to))
            const busy = busyIntervals(trains, kmA, kmB)
            const conflicts = blockConflicts(b, corridor, trains)
            const cap = b.end - b.start - SETUP_BUFFER
            const usedMin = assignedMinByBlock[b.id] ?? 0
            const assignedTasks = Object.entries(assignments)
              .filter(([, a]) => a.blockId === b.id)
              .map(([tid]) => taskById(tid)!)
              .filter(Boolean)
            const reco = recos.find((r) => r.block.id === b.id)
            const ghost = recoHover === b.id && reco ? reco.picks : []
            const ghostMin = ghost.reduce((s, t) => s + t.durationMin, 0)
            const drop = dropState?.blockId === b.id ? dropState : null
            const selFeas = selected ? isFeasible(selected, b, corridor, usedMin) : null

            const names = (code: string) => corridor.stations.find((s) => s.code === code)?.name ?? code

            return (
              <div
                key={b.id}
                className={[
                  'block-card',
                  drop ? (drop.ok ? 'drop-ok' : 'drop-bad') : '',
                  recoHover === b.id ? 'reco-hover' : '',
                  selected && selFeas?.ok ? 'drop-ok' : '',
                ].join(' ')}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!dragTask) return
                  const t = taskById(dragTask)
                  if (!t) return
                  const feas = isFeasible(t, b, corridor, usedMin)
                  e.dataTransfer.dropEffect = feas.ok ? 'move' : 'none'
                  setDropState((cur) =>
                    cur?.blockId === b.id && cur.ok === feas.ok ? cur : { blockId: b.id, ok: feas.ok, reasons: feas.reasons },
                  )
                }}
                onDragLeave={() => setDropState((s) => (s?.blockId === b.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  setDropState(null)
                  setDragTask(null)
                  if (id) tryAssign(id, b)
                }}
              >
                <div className="block-head">
                  <span className="block-id">{b.id}</span>
                  <span className="block-sec">{names(b.from)} – {names(b.to)}</span>
                  <span className="block-type">{b.type} block</span>
                  <span className="block-time num">
                    {fmtMin(b.start)}–{fmtMin(b.end)} <span className="unit">· {fmtDur(b.end - b.start)}</span>
                  </span>
                </div>
                <div className="block-strip">
                  <DayStrip block={b} busy={busy} />
                </div>
                <div className="capacity">
                  <span className="num">
                    {usedMin + ghostMin > 0 ? `${usedMin + ghostMin} / ${cap} min` : `${cap} min usable`}
                  </span>
                  <div className="bar">
                    <div
                      className={`fill ${ghostMin ? 'ghosted' : ''}`}
                      style={{ width: `${Math.min(100, ((usedMin + ghostMin) / cap) * 100)}%` }}
                    />
                  </div>
                  <span className="unit num">{SETUP_BUFFER}m setup held back</span>
                </div>
                {conflicts.length > 0 && (
                  <div className="conflict-note">
                    ⚠ {conflicts.length} train{conflicts.length > 1 ? 's' : ''} cross this section in the window —{' '}
                    {conflicts.slice(0, 2).map((c) => `${c.train.name} at ${fmtMin(c.at)}`).join(', ')}
                    {conflicts.length > 2 ? '…' : ''}
                  </div>
                )}
                {(assignedTasks.length > 0 || ghost.length > 0) && (
                  <div className="assigned-row">
                    {assignedTasks.map((t) => (
                      <span key={t.id} className="task-chip num">
                        {t.id} · {t.durationMin}m
                        <button className="x" onClick={() => { unassign(t.id); setToast(`${t.id} back to queue`) }} aria-label={`Remove ${t.id}`}>
                          ×
                        </button>
                      </span>
                    ))}
                    {ghost.map((t) => (
                      <span key={t.id} className="task-chip ghost num">
                        {t.id} · {t.durationMin}m
                      </span>
                    ))}
                  </div>
                )}
                {drop && !drop.ok && <div className="drop-hint">{drop.reasons[0]}</div>}
                {selected && selFeas && (
                  <div style={{ padding: '0 14px 12px' }}>
                    {selFeas.ok ? (
                      <button className="btn" onClick={() => tryAssign(selected.id, b)}>
                        Assign {selected.id} here
                      </button>
                    ) : (
                      <span className="unit" style={{ fontSize: 'var(--fs-sm)' }}>
                        {selected.id}: {selFeas.reasons[0]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {dayBlocks.length === 0 && (
            <div className="panel"><div className="empty">COA offers no candidate windows on this corridor for {date}.</div></div>
          )}
        </div>

        {/* ------------------------------------------------ recommendations */}
        <div className="panel plan-reco-col">
          <div className="panel-head">
            <span className="panel-title">Suggested plan</span>
          </div>
          <div>
            {recos.map((r, i) => (
              <div
                key={r.block.id}
                className="reco-item"
                onMouseEnter={() => setRecoHover(r.block.id)}
                onMouseLeave={() => setRecoHover(null)}
              >
                <div className="reco-top">
                  <span className="reco-rank num">#{i + 1}</span>
                  <span className="block-id">{r.block.id}</span>
                  <span className="num unit">{fmtMin(r.block.start)}–{fmtMin(r.block.end)}</span>
                </div>
                <div className="reco-facts">
                  {r.facts.map((f, j) => (
                    <span key={j}>
                      {j > 0 && ' · '}
                      <span className={f.includes('zero train conflicts') || f.includes('critical') ? 'ok' : ''}>{f}</span>
                    </span>
                  ))}
                </div>
                <div className="reco-actions">
                  <button className="btn primary" onClick={() => applyReco(r.block.id, r.picks)}>
                    Apply
                  </button>
                  <span className="unit num" style={{ alignSelf: 'center', fontSize: 'var(--fs-sm)' }}>
                    hover to preview
                  </span>
                </div>
              </div>
            ))}
            {recos.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                {unassigned.length === 0 ? 'Everything is scheduled.' : 'No feasible pairing for the remaining tasks on this date.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
