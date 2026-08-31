// Page 3 — Block plan (day / week / month).

let DATA = null
let ctx = getCtx()
let horizon = 'day'
let selTask = new URLSearchParams(location.search).get('task')
let dragTaskId = null

const pageEl = document.getElementById('page')
const deptTag2 = (d) => (d === 'Engineering' ? 'ENG' : d === 'S&T' ? 'S&T' : 'TRD')

const corridor = () => DATA.corridors.find((c) => c.id === ctx.corridorId)
const trains = () => DATA.trains.filter((t) => t.corridorId === ctx.corridorId)
const taskById = (id) => DATA.tasks.find((t) => t.id === id)

const dayBlocks = () =>
  DATA.blocks
    .filter((b) => b.corridorId === ctx.corridorId && b.date === ctx.date)
    .sort((a, b) => a.start - b.start)

const unassignedTasks = () => {
  const assignments = getAssignments()
  return DATA.tasks
    .filter((t) => t.corridorId === ctx.corridorId && !assignments[t.id])
    .sort((a, b) => urgency(b, ctx.date) - urgency(a, ctx.date))
}

function assignedMinByBlock() {
  const assignments = getAssignments()
  const m = {}
  for (const [taskId, a] of Object.entries(assignments)) {
    const t = taskById(taskId)
    if (t) m[a.blockId] = (m[a.blockId] || 0) + t.durationMin
  }
  return m
}

function tryAssign(taskId, block) {
  const t = taskById(taskId)
  if (!t) return
  const feas = isFeasible(t, block, corridor(), assignedMinByBlock()[block.id] || 0)
  if (feas.ok) {
    const a = getAssignments()
    a[taskId] = { blockId: block.id, date: block.date }
    setAssignments(a)
    selTask = null
    history.replaceState(null, '', 'plan.html')
    toast(`${taskId} scheduled in ${block.id} · ${fmtMin(block.start)}–${fmtMin(block.end)}`)
    render()
  } else {
    toast(`Cannot place ${taskId}: ${feas.reasons[0]}`)
  }
}

function unassignTask(taskId) {
  const a = getAssignments()
  delete a[taskId]
  setAssignments(a)
  toast(`${taskId} back to queue`)
  render()
}

function dayStrip(block, busy) {
  return `<svg viewBox="0 0 1440 22" preserveAspectRatio="none" style="width:100%;height:22px;display:block">
    <rect x="0" y="8" width="1440" height="6" fill="var(--surface-2)" rx="2"/>
    ${busy.map(([a, b]) => `<rect x="${a}" y="8" width="${Math.max(2, b - a)}" height="6" fill="var(--ink-4)"/>`).join('')}
    <rect x="${block.start}" y="3" width="${block.end - block.start}" height="16" fill="rgba(15,118,110,0.12)" stroke="var(--accent)" stroke-width="1.5" rx="2" vector-effect="non-scaling-stroke"/>
  </svg>`
}

// -------------------------------------------------- day view

function renderDay() {
  const corr = corridor()
  const assignments = getAssignments()
  const blocks = dayBlocks()
  const unassigned = unassignedTasks()
  const byBlock = assignedMinByBlock()
  const recos = recommend(blocks, corr, trains(), unassigned, ctx.date, byBlock).slice(0, 4)
  const names = (code) => {
    const st = corr.stations.find((s) => s.code === code)
    return st ? st.name : code
  }
  const selected = selTask ? taskById(selTask) : null

  const trayHtml = unassigned
    .map((t) => {
      const crit = isCritical(t, ctx.date)
      const od = overdueDays(t, ctx.date)
      return `<div class="tray-task ${selTask === t.id ? 'sel' : ''}" draggable="true" data-task="${esc(t.id)}">
        <div class="t-top">
          ${crit ? '<span class="dot red"></span>' : od > 0 ? '<span class="dot amber"></span>' : ''}
          <span class="tid">${esc(t.id)}</span>
          <span class="dept">${deptTag2(t.department)}</span>
          <span class="num" style="margin-left:auto">${t.durationMin}<span class="unit">m</span></span>
        </div>
        <div class="t-desc">${esc(t.workType)} · ${t.from === t.to ? esc(t.from) : `${esc(t.from)}–${esc(t.to)}`}</div>
        <div class="t-meta num">
          ${od > 0 ? `<span class="overdue-txt">${od}d overdue</span>` : `<span>due ${daysUntilDue(t, ctx.date)}d</span>`}
          ${t.department === 'Traction' ? '<span>needs power block</span>' : ''}
        </div>
      </div>`
    })
    .join('')

  const blocksHtml = blocks
    .map((b) => {
      const kmA = Math.min(stationKm(corr, b.from), stationKm(corr, b.to))
      const kmB = Math.max(stationKm(corr, b.from), stationKm(corr, b.to))
      const busy = busyIntervals(trains(), kmA, kmB)
      const conflicts = blockConflicts(b, corr, trains())
      const cap = b.end - b.start - SETUP_BUFFER
      const usedMin = byBlock[b.id] || 0
      const assignedTasks = Object.entries(assignments)
        .filter(([, a]) => a.blockId === b.id)
        .map(([tid]) => taskById(tid))
        .filter(Boolean)
      const selFeas = selected ? isFeasible(selected, b, corr, usedMin) : null

      return `<div class="block-card ${selected && selFeas.ok ? 'drop-ok' : ''}" data-block="${esc(b.id)}">
        <div class="block-head">
          <span class="block-id">${esc(b.id)}</span>
          <span class="block-sec">${esc(names(b.from))} – ${esc(names(b.to))}</span>
          <span class="block-type">${b.type} block</span>
          <span class="block-time num">${fmtMin(b.start)}–${fmtMin(b.end)} <span class="unit">· ${fmtDur(b.end - b.start)}</span></span>
        </div>
        <div class="block-strip">${dayStrip(b, busy)}</div>
        <div class="capacity">
          <span class="num cap-label">${usedMin > 0 ? `${usedMin} / ${cap} min` : `${cap} min usable`}</span>
          <div class="bar"><div class="fill" style="width:${Math.min(100, (usedMin / cap) * 100)}%"></div></div>
          <span class="unit num">${SETUP_BUFFER}m setup held back</span>
        </div>
        ${
          conflicts.length > 0
            ? `<div class="conflict-note">⚠ ${conflicts.length} train${conflicts.length > 1 ? 's' : ''} cross this section in the window — ${conflicts
                .slice(0, 2)
                .map((c) => `${esc(c.train.name)} at ${fmtMin(c.at)}`)
                .join(', ')}${conflicts.length > 2 ? '…' : ''}</div>`
            : ''
        }
        <div class="assigned-row" ${assignedTasks.length === 0 ? 'style="display:none"' : ''}>
          ${assignedTasks
            .map(
              (t) =>
                `<span class="task-chip num">${esc(t.id)} · ${t.durationMin}m<button class="x" data-unassign="${esc(t.id)}" aria-label="Remove ${esc(t.id)}">×</button></span>`,
            )
            .join('')}
        </div>
        <div class="drop-hint" style="display:none"></div>
        ${
          selected && selFeas
            ? `<div style="padding:0 14px 12px">${
                selFeas.ok
                  ? `<button class="btn" data-assign-here="${esc(b.id)}">Assign ${esc(selected.id)} here</button>`
                  : `<span class="unit" style="font-size:var(--fs-sm)">${esc(selected.id)}: ${esc(selFeas.reasons[0])}</span>`
              }</div>`
            : ''
        }
      </div>`
    })
    .join('')

  const recosHtml = recos
    .map(
      (r, i) => `<div class="reco-item" data-reco="${esc(r.block.id)}">
      <div class="reco-top">
        <span class="reco-rank num">#${i + 1}</span>
        <span class="block-id">${esc(r.block.id)}</span>
        <span class="num unit">${fmtMin(r.block.start)}–${fmtMin(r.block.end)}</span>
      </div>
      <div class="reco-facts">${r.facts
        .map(
          (f, j) =>
            `${j > 0 ? ' · ' : ''}<span class="${f.includes('zero train conflicts') || f.includes('critical') ? 'ok' : ''}">${esc(f)}</span>`,
        )
        .join('')}</div>
      <div class="reco-actions">
        <button class="btn primary" data-apply="${esc(r.block.id)}">Apply</button>
        <span class="unit num" style="align-self:center;font-size:var(--fs-sm)">hover to preview</span>
      </div>
    </div>`,
    )
    .join('')

  pageEl.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Block plan</h1>
      <span class="page-note num">${blocks.length} windows offered</span>
      <span class="spacer"></span>
      ${Object.keys(assignments).length > 0 ? '<button class="btn quiet" id="clear-plan">Clear plan</button>' : ''}
      <div class="seg" id="horizon-seg">
        <button class="on" data-h="day">Day</button>
        <button data-h="week">Week</button>
        <button data-h="month">Month</button>
      </div>
    </div>
    <div class="plan-grid">
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">Unassigned</span>
          <span class="panel-count">${unassigned.length}</span>
          <span class="panel-count" style="margin-left:auto">drag onto a window</span>
        </div>
        <div class="panel-body">
          ${trayHtml || '<div class="empty" style="padding:24px">All tasks placed. Corridor is covered.</div>'}
        </div>
      </div>
      <div id="block-col">
        ${blocksHtml || `<div class="panel"><div class="empty">No candidate windows on this corridor for ${ctx.date}.</div></div>`}
      </div>
      <div class="panel plan-reco-col">
        <div class="panel-head"><span class="panel-title">Suggested plan</span></div>
        <div>
          ${recosHtml || `<div class="empty" style="padding:24px">${unassigned.length === 0 ? 'Everything is scheduled.' : 'No feasible pairing for the remaining tasks on this date.'}</div>`}
        </div>
      </div>
    </div>`

  bindDay(recos)
}

function bindDay(recos) {
  const corr = corridor()
  const byBlock = assignedMinByBlock()

  // tray: select + drag
  pageEl.querySelectorAll('.tray-task').forEach((el) => {
    const id = el.dataset.task
    el.addEventListener('click', () => {
      selTask = selTask === id ? null : id
      render()
    })
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', id)
      dragTaskId = id
      el.classList.add('dragging')
    })
    el.addEventListener('dragend', () => {
      dragTaskId = null
      el.classList.remove('dragging')
      clearDropStates()
    })
  })

  function clearDropStates() {
    pageEl.querySelectorAll('.block-card').forEach((c) => {
      c.classList.remove('drop-ok', 'drop-bad')
      const hint = c.querySelector('.drop-hint')
      hint.style.display = 'none'
      if (c.dataset.selOk === '1') c.classList.add('drop-ok')
    })
  }

  // block cards: drop targets + actions
  pageEl.querySelectorAll('.block-card').forEach((card) => {
    const block = dayBlocks().find((b) => b.id === card.dataset.block)
    if (card.classList.contains('drop-ok')) card.dataset.selOk = '1'

    card.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (!dragTaskId) return
      const t = taskById(dragTaskId)
      const feas = isFeasible(t, block, corr, byBlock[block.id] || 0)
      e.dataTransfer.dropEffect = feas.ok ? 'move' : 'none'
      card.classList.toggle('drop-ok', feas.ok)
      card.classList.toggle('drop-bad', !feas.ok)
      const hint = card.querySelector('.drop-hint')
      hint.textContent = feas.ok ? '' : feas.reasons[0]
      hint.style.display = feas.ok ? 'none' : ''
    })
    card.addEventListener('dragleave', (e) => {
      if (card.contains(e.relatedTarget)) return
      card.classList.remove('drop-ok', 'drop-bad')
      card.querySelector('.drop-hint').style.display = 'none'
      if (card.dataset.selOk === '1') card.classList.add('drop-ok')
    })
    card.addEventListener('drop', (e) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain')
      dragTaskId = null
      if (id) tryAssign(id, block)
    })
  })

  // chip remove / assign-here / apply / clear
  pageEl.querySelectorAll('[data-unassign]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      unassignTask(b.dataset.unassign)
    }),
  )
  pageEl.querySelectorAll('[data-assign-here]').forEach((b) =>
    b.addEventListener('click', () => {
      const block = dayBlocks().find((x) => x.id === b.dataset.assignHere)
      if (selTask && block) tryAssign(selTask, block)
    }),
  )
  pageEl.querySelectorAll('[data-apply]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = recos.find((x) => x.block.id === b.dataset.apply)
      if (!r) return
      const a = getAssignments()
      for (const t of r.picks) a[t.id] = { blockId: r.block.id, date: r.block.date }
      setAssignments(a)
      toast(`${r.picks.length} task${r.picks.length > 1 ? 's' : ''} scheduled in ${r.block.id}`)
      render()
    }),
  )
  const clearBtn = pageEl.querySelector('#clear-plan')
  if (clearBtn)
    clearBtn.addEventListener('click', () => {
      setAssignments({})
      toast('Plan cleared')
      render()
    })

  // recommendation hover → ghost preview on the target card (in place, no re-render)
  pageEl.querySelectorAll('.reco-item').forEach((item) => {
    const r = recos.find((x) => x.block.id === item.dataset.reco)
    const card = pageEl.querySelector(`.block-card[data-block="${item.dataset.reco}"]`)
    if (!r || !card) return
    const cap = r.block.end - r.block.start - SETUP_BUFFER
    const usedMin = byBlock[r.block.id] || 0
    const ghostMin = r.picks.reduce((s, t) => s + t.durationMin, 0)
    item.addEventListener('mouseenter', () => {
      card.classList.add('reco-hover')
      const row = card.querySelector('.assigned-row')
      row.style.display = ''
      r.picks.forEach((t) => {
        const chip = document.createElement('span')
        chip.className = 'task-chip ghost num ghost-preview'
        chip.textContent = `${t.id} · ${t.durationMin}m`
        row.appendChild(chip)
      })
      card.querySelector('.cap-label').textContent = `${usedMin + ghostMin} / ${cap} min`
      const fill = card.querySelector('.capacity .fill')
      fill.classList.add('ghosted')
      fill.style.width = `${Math.min(100, ((usedMin + ghostMin) / cap) * 100)}%`
    })
    item.addEventListener('mouseleave', () => {
      card.classList.remove('reco-hover')
      card.querySelectorAll('.ghost-preview').forEach((c) => c.remove())
      const row = card.querySelector('.assigned-row')
      if (!row.querySelector('.task-chip')) row.style.display = 'none'
      card.querySelector('.cap-label').textContent = usedMin > 0 ? `${usedMin} / ${cap} min` : `${cap} min usable`
      const fill = card.querySelector('.capacity .fill')
      fill.classList.remove('ghosted')
      fill.style.width = `${Math.min(100, (usedMin / cap) * 100)}%`
    })
  })

  bindHorizon()
}

// -------------------------------------------------- week / month views

function renderPeriod() {
  const n = horizon === 'week' ? 7 : 28
  const days = Array.from({ length: n }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
  const assignments = getAssignments()

  const cells = days
    .map((d) => {
      const blocks = DATA.blocks.filter((b) => b.corridorId === ctx.corridorId && b.date === d)
      const cap = blocks.reduce((s, b) => s + (b.end - b.start - SETUP_BUFFER), 0)
      const used = Object.entries(assignments)
        .filter(([, a]) => a.date === d && blocks.some((b) => b.id === a.blockId))
        .reduce((s, [tid]) => {
          const t = taskById(tid)
          return s + (t ? t.durationMin : 0)
        }, 0)
      const util = cap ? used / cap : 0
      const dow = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })
      return `<div class="day-card ${d === ctx.date ? 'today' : ''}" data-day="${d}">
        <h4>${dow}</h4>
        <div class="d-num">${d.slice(8)}</div>
        <div class="d-meta num">${blocks.length} windows · ${fmtDur(cap)} offered<br/>${used ? `${fmtDur(used)} planned` : 'nothing planned'}</div>
        <div class="bar"><i style="width:${Math.min(100, util * 100)}%"></i></div>
      </div>`
    })
    .join('')

  pageEl.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">Block plan</h1>
      <span class="page-note">${horizon === 'week' ? 'Week of 01 Sep' : 'September 2026'}</span>
      <span class="spacer"></span>
      <div class="seg" id="horizon-seg">
        <button data-h="day">Day</button>
        <button data-h="week" class="${horizon === 'week' ? 'on' : ''}">Week</button>
        <button data-h="month" class="${horizon === 'month' ? 'on' : ''}">Month</button>
      </div>
    </div>
    <div class="week-grid">${cells}</div>`

  pageEl.querySelectorAll('.day-card').forEach((c) =>
    c.addEventListener('click', () => {
      ctx = setCtx({ date: c.dataset.day })
      document.querySelector('.context input[type="date"]').value = ctx.date
      horizon = 'day'
      render()
    }),
  )
  bindHorizon()
}

function bindHorizon() {
  pageEl.querySelector('#horizon-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-h]')
    if (!btn) return
    horizon = btn.dataset.h
    render()
  })
}

function render() {
  if (horizon === 'day') renderDay()
  else renderPeriod()
}

loadData()
  .then((data) => {
    DATA = data
    document.getElementById('loading').remove()
    pageEl.style.display = ''
    ctx = initTopbar(data, (newCtx) => {
      ctx = newCtx
      render()
    })
    render()
  })
  .catch(console.error)
