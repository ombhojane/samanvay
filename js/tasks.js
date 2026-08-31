// Page 2 — Maintenance task queue.

const DEPTS = ['All', 'Engineering', 'S&T', 'Traction']

let DATA = null
let ctx = getCtx()
let bucket = 'all'
let dept = 'All'
let selIdx = 0
let rows = []

const deptTag = (d) => (d === 'Engineering' ? 'ENG' : d === 'S&T' ? 'S&T' : 'TRD')

function dueCell(task) {
  const od = overdueDays(task, ctx.date)
  const dd = daysUntilDue(task, ctx.date)
  if (od > 0) return `<span class="num">${task.dueDate.slice(5)} <span class="overdue-txt">${od}d overdue</span></span>`
  if (dd <= 2)
    return `<span class="num">${task.dueDate.slice(5)} <span class="due-soon-txt">due ${dd === 0 ? 'today' : `in ${dd}d`}</span></span>`
  return `<span class="num unit">${task.dueDate.slice(5)}</span>`
}

function corridorTasks() {
  return DATA.tasks
    .filter((t) => t.corridorId === ctx.corridorId)
    .sort((a, b) => urgency(b, ctx.date) - urgency(a, ctx.date))
}

function computeRows() {
  const assignments = getAssignments()
  return corridorTasks().filter((t) => {
    if (dept !== 'All' && t.department !== dept) return false
    switch (bucket) {
      case 'critical': return isCritical(t, ctx.date)
      case 'overdue': return overdueDays(t, ctx.date) > 0
      case 'week': return overdueDays(t, ctx.date) === 0 && daysUntilDue(t, ctx.date) <= 7
      case 'scheduled': return !!assignments[t.id]
      default: return true
    }
  })
}

function render() {
  const assignments = getAssignments()
  const all = corridorTasks()
  const counts = {
    all: all.length,
    critical: all.filter((t) => isCritical(t, ctx.date)).length,
    overdue: all.filter((t) => overdueDays(t, ctx.date) > 0).length,
    week: all.filter((t) => overdueDays(t, ctx.date) === 0 && daysUntilDue(t, ctx.date) <= 7).length,
    scheduled: all.filter((t) => assignments[t.id]).length,
  }

  const buckets = [
    ['all', 'All', ''],
    ['critical', 'Critical', 'danger'],
    ['overdue', 'Overdue', 'warn'],
    ['week', 'Due 7 days', ''],
    ['scheduled', 'Scheduled', ''],
  ]
  document.getElementById('bucket-chips').innerHTML = buckets
    .map(
      ([key, label, cls]) =>
        `<button class="chip ${cls} ${bucket === key ? 'on' : ''}" data-bucket="${key}">${label} <span class="count">${counts[key]}</span></button>`,
    )
    .join('')
  document.getElementById('dept-seg').innerHTML = DEPTS.map(
    (d) => `<button data-dept="${esc(d)}" class="${dept === d ? 'on' : ''}">${esc(d)}</button>`,
  ).join('')

  rows = computeRows()
  selIdx = Math.min(selIdx, Math.max(0, rows.length - 1))

  document.getElementById('task-rows').innerHTML = rows
    .map((t, i) => {
      const crit = isCritical(t, ctx.date)
      const od = overdueDays(t, ctx.date) > 0
      const asg = assignments[t.id]
      return `<tr data-i="${i}" class="${i === selIdx ? 'sel' : ''}">
        <td><span class="dot ${crit ? 'red' : od ? 'amber' : 'none'}"></span></td>
        <td class="tid">${esc(t.id)}</td>
        <td class="desc">${esc(t.workType)}</td>
        <td><span class="dept">${deptTag(t.department)}</span></td>
        <td class="num unit">${t.from === t.to ? esc(t.from) : `${esc(t.from)}–${esc(t.to)}`}</td>
        <td class="r num">${t.durationMin} <span class="unit">min</span></td>
        <td>${dueCell(t)}</td>
        <td class="${t.risk === 'High' ? '' : 'unit'}">${t.risk}</td>
        <td>${asg ? `<span class="state ok num">→ ${esc(asg.blockId)} · ${asg.date.slice(5)}</span>` : '<span class="state muted">Pending</span>'}</td>
      </tr>`
    })
    .join('')
  document.getElementById('empty').style.display = rows.length === 0 ? '' : 'none'
}

function openTaskDrawer(t) {
  const assignments = getAssignments()
  const od = overdueDays(t, ctx.date)
  const facts = []
  if (od > 0) facts.push(`<li class="alert">Overdue by ${od} day${od > 1 ? 's' : ''}</li>`)
  if (t.risk === 'High') facts.push('<li class="alert">High safety risk if deferred</li>')
  if (od === 0 && daysUntilDue(t, ctx.date) <= 7) facts.push('<li>Falls due within this planning week</li>')
  facts.push(
    `<li>Occupies the ${t.from === t.to ? esc(t.from) : `${esc(t.from)}–${esc(t.to)}`} section for ${fmtDur(t.durationMin)}</li>`,
  )
  if (t.department === 'Traction') facts.push('<li>Requires a power block (OHE dead)</li>')
  facts.push(
    assignments[t.id]
      ? `<li>Scheduled in ${esc(assignments[t.id].blockId)} on ${assignments[t.id].date}</li>`
      : '<li>Not yet placed in any block window</li>',
  )

  const el = openDrawer({
    title: esc(t.workType),
    badge: `<span class="state muted num">${esc(t.id)}</span>`,
    body: `
      <dl class="kv">
        <dt>Description</dt><dd>${esc(t.description)}</dd>
        <dt>Source</dt><dd>${t.source} · ${esc(t.department)}</dd>
        <dt>Asset</dt><dd class="num">${esc(t.assetId)}</dd>
        <dt>Section</dt><dd class="num">${t.from === t.to ? esc(t.from) : `${esc(t.from)} – ${esc(t.to)}`}</dd>
        <dt>Duration</dt><dd class="num">${fmtDur(t.durationMin)}</dd>
        <dt>Due</dt><dd>${dueCell(t)}</dd>
        <dt>Safety risk</dt><dd class="${t.risk === 'High' ? 'state critical' : ''}">${t.risk}</dd>
      </dl>
      <div class="facts">
        <h4>Assessment</h4>
        <ul>${facts.join('')}</ul>
      </div>`,
    footer: `
      <button class="btn primary" id="find-window">Find a window →</button>
      <button class="btn quiet" id="drawer-close2">Close</button>`,
  })
  el.querySelector('#find-window').addEventListener('click', () => (location.href = `plan.html?task=${t.id}`))
  el.querySelector('#drawer-close2').addEventListener('click', closeDrawer)
}

document.getElementById('bucket-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-bucket]')
  if (!btn) return
  bucket = btn.dataset.bucket
  selIdx = 0
  render()
})
document.getElementById('dept-seg').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-dept]')
  if (!btn) return
  dept = btn.dataset.dept
  selIdx = 0
  render()
})
document.getElementById('task-rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-i]')
  if (!tr) return
  selIdx = +tr.dataset.i
  render()
  openTaskDrawer(rows[selIdx])
})

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
  if (e.key === 'j') {
    selIdx = Math.min(rows.length - 1, selIdx + 1)
    render()
  }
  if (e.key === 'k') {
    selIdx = Math.max(0, selIdx - 1)
    render()
  }
  if (e.key === 'Enter' && rows[selIdx]) openTaskDrawer(rows[selIdx])
  if (e.key === 'f' && rows[selIdx]) location.href = `plan.html?task=${rows[selIdx].id}`
})

loadData()
  .then((data) => {
    DATA = data
    document.getElementById('loading').remove()
    document.getElementById('page').style.display = ''
    ctx = initTopbar(data, (newCtx) => {
      ctx = newCtx
      selIdx = 0
      closeDrawer()
      render()
    })
    render()
  })
  .catch(console.error)
