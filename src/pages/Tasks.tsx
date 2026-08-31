import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store'
import { daysUntilDue, isCritical, overdueDays, urgency } from '../lib/plan'
import { fmtDur } from '../lib/data'
import type { Task } from '../lib/types'
import Drawer from '../components/Drawer'

type Bucket = 'all' | 'critical' | 'overdue' | 'week' | 'scheduled'
const DEPTS = ['All', 'Engineering', 'S&T', 'Traction'] as const

function DueCell({ task, refDate }: { task: Task; refDate: string }) {
  const od = overdueDays(task, refDate)
  const dd = daysUntilDue(task, refDate)
  if (od > 0)
    return (
      <span className="num">
        {task.dueDate.slice(5)} <span className="overdue-txt">{od}d overdue</span>
      </span>
    )
  if (dd <= 2)
    return (
      <span className="num">
        {task.dueDate.slice(5)} <span className="due-soon-txt">due {dd === 0 ? 'today' : `in ${dd}d`}</span>
      </span>
    )
  return <span className="num unit">{task.dueDate.slice(5)}</span>
}

export default function Tasks() {
  const { data, corridor, date, assignments } = useApp()
  const navigate = useNavigate()
  const [bucket, setBucket] = useState<Bucket>('all')
  const [dept, setDept] = useState<(typeof DEPTS)[number]>('All')
  const [selIdx, setSelIdx] = useState(0)
  const [open, setOpen] = useState<Task | null>(null)

  const corridorTasks = useMemo(
    () =>
      (data?.tasks ?? [])
        .filter((t) => t.corridorId === corridor?.id)
        .sort((a, b) => urgency(b, date) - urgency(a, date)),
    [data, corridor, date],
  )

  const counts = useMemo(
    () => ({
      all: corridorTasks.length,
      critical: corridorTasks.filter((t) => isCritical(t, date)).length,
      overdue: corridorTasks.filter((t) => overdueDays(t, date) > 0).length,
      week: corridorTasks.filter((t) => overdueDays(t, date) === 0 && daysUntilDue(t, date) <= 7).length,
      scheduled: corridorTasks.filter((t) => assignments[t.id]).length,
    }),
    [corridorTasks, date, assignments],
  )

  const rows = useMemo(
    () =>
      corridorTasks.filter((t) => {
        if (dept !== 'All' && t.department !== dept) return false
        switch (bucket) {
          case 'critical': return isCritical(t, date)
          case 'overdue': return overdueDays(t, date) > 0
          case 'week': return overdueDays(t, date) === 0 && daysUntilDue(t, date) <= 7
          case 'scheduled': return !!assignments[t.id]
          default: return true
        }
      }),
    [corridorTasks, bucket, dept, date, assignments],
  )

  useEffect(() => setSelIdx(0), [bucket, dept, corridor?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'j') setSelIdx((i) => Math.min(rows.length - 1, i + 1))
      if (e.key === 'k') setSelIdx((i) => Math.max(0, i - 1))
      if (e.key === 'Enter' && rows[selIdx]) setOpen(rows[selIdx])
      if (e.key === 'f' && rows[selIdx]) navigate(`/plan?task=${rows[selIdx].id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selIdx, navigate])

  if (!data || !corridor) return <div className="loading">Merging TMS · SMMS · TDMS…</div>

  const deptTag = (d: Task['department']) => (d === 'Engineering' ? 'ENG' : d === 'S&T' ? 'S&T' : 'TRD')

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Maintenance tasks</h1>
      </div>

      <div className="filterbar">
        <div className="chips" role="group" aria-label="Status filter">
          <button className={`chip ${bucket === 'all' ? 'on' : ''}`} onClick={() => setBucket('all')}>
            All <span className="count">{counts.all}</span>
          </button>
          <button className={`chip danger ${bucket === 'critical' ? 'on' : ''}`} onClick={() => setBucket('critical')}>
            Critical <span className="count">{counts.critical}</span>
          </button>
          <button className={`chip warn ${bucket === 'overdue' ? 'on' : ''}`} onClick={() => setBucket('overdue')}>
            Overdue <span className="count">{counts.overdue}</span>
          </button>
          <button className={`chip ${bucket === 'week' ? 'on' : ''}`} onClick={() => setBucket('week')}>
            Due 7 days <span className="count">{counts.week}</span>
          </button>
          <button className={`chip ${bucket === 'scheduled' ? 'on' : ''}`} onClick={() => setBucket('scheduled')}>
            Scheduled <span className="count">{counts.scheduled}</span>
          </button>
        </div>
        <div className="divider" />
        <div className="seg" role="group" aria-label="Department filter">
          {DEPTS.map((d) => (
            <button key={d} className={dept === d ? 'on' : ''} onClick={() => setDept(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="tablewrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 20 }}></th>
              <th>Task</th>
              <th>Work</th>
              <th>Dept</th>
              <th>Section</th>
              <th className="r">Needs</th>
              <th>Due</th>
              <th>Risk</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const crit = isCritical(t, date)
              const od = overdueDays(t, date) > 0
              const asg = assignments[t.id]
              return (
                <tr key={t.id} className={i === selIdx ? 'sel' : ''} onClick={() => { setSelIdx(i); setOpen(t) }}>
                  <td><span className={`dot ${crit ? 'red' : od ? 'amber' : 'none'}`} /></td>
                  <td className="tid">{t.id}</td>
                  <td className="desc">{t.workType}</td>
                  <td><span className="dept">{deptTag(t.department)}</span></td>
                  <td className="num unit">{t.from === t.to ? t.from : `${t.from}–${t.to}`}</td>
                  <td className="r num">{t.durationMin} <span className="unit">min</span></td>
                  <td><DueCell task={t} refDate={date} /></td>
                  <td className={t.risk === 'High' ? '' : 'unit'}>{t.risk}</td>
                  <td>
                    {asg ? (
                      <span className="state ok num">→ {asg.blockId} · {asg.date.slice(5)}</span>
                    ) : (
                      <span className="state muted">Pending</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Nothing here — this queue is clear.</div>}
      </div>

      {open && (
        <Drawer
          title={open.workType}
          badge={<span className="state muted num">{open.id}</span>}
          onClose={() => setOpen(null)}
          footer={
            <>
              <button className="btn primary" onClick={() => navigate(`/plan?task=${open.id}`)}>
                Find a window →
              </button>
              <button className="btn quiet" onClick={() => setOpen(null)}>Close</button>
            </>
          }
        >
          <dl className="kv">
            <dt>Description</dt><dd>{open.description}</dd>
            <dt>Source</dt><dd>{open.source} · {open.department}</dd>
            <dt>Asset</dt><dd className="num">{open.assetId}</dd>
            <dt>Section</dt><dd className="num">{open.from === open.to ? open.from : `${open.from} – ${open.to}`}</dd>
            <dt>Duration</dt><dd className="num">{fmtDur(open.durationMin)}</dd>
            <dt>Due</dt><dd><DueCell task={open} refDate={date} /></dd>
            <dt>Safety risk</dt><dd className={open.risk === 'High' ? 'state critical' : ''}>{open.risk}</dd>
          </dl>
          <div className="facts">
            <h4>Assessment</h4>
            <ul>
              {overdueDays(open, date) > 0 && (
                <li className="alert">Overdue by {overdueDays(open, date)} day{overdueDays(open, date) > 1 ? 's' : ''}</li>
              )}
              {open.risk === 'High' && <li className="alert">High safety risk if deferred</li>}
              {overdueDays(open, date) === 0 && daysUntilDue(open, date) <= 7 && (
                <li>Falls due within this planning week</li>
              )}
              <li>Occupies the {open.from === open.to ? open.from : `${open.from}–${open.to}`} section for {fmtDur(open.durationMin)}</li>
              {open.department === 'Traction' && <li>Requires a power block (OHE dead)</li>}
              {assignments[open.id] ? (
                <li>Scheduled in {assignments[open.id].blockId} on {assignments[open.id].date}</li>
              ) : (
                <li>Not yet placed in any block window</li>
              )}
            </ul>
          </div>
        </Drawer>
      )}
    </div>
  )
}
