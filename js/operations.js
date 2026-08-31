// Page 1 — Train operations (Marey diagram).

const TYPE_STYLE = {
  Express: { stroke: '#44403c', width: 1.6 },
  Passenger: { stroke: '#78716c', width: 1.2 },
  Suburban: { stroke: '#cbc6c0', width: 1 },
  Goods: { stroke: '#a09c96', width: 1.3, dash: '5 4' },
}

const AXIS_H = 28
const PAD_B = 26
const HEIGHT = 560

let DATA = null
let ctx = getCtx()
let span = 24
let showWindows = new URLSearchParams(location.search).get('windows') === '1'
let hoverNo = null

const scrollEl = document.getElementById('marey-scroll')
const gutterEl = document.getElementById('station-gutter')

function corridor() {
  return DATA.corridors.find((c) => c.id === ctx.corridorId)
}
function corridorTrains() {
  return DATA.trains.filter((t) => t.corridorId === ctx.corridorId)
}

function render() {
  const corr = corridor()
  const trains = corridorTrains()
  const windows = freeWindows(corr, trains)
  document.getElementById('service-count').textContent = `${trains.length} services`

  const containerW = scrollEl.clientWidth || 1000
  const pxPerHour = containerW / span
  const width = 24 * pxPerHour
  const kmMax = corr.stations[corr.stations.length - 1].km
  const x = (min) => (min / 60) * pxPerHour
  const y = (km) => AXIS_H + (km / kmMax) * (HEIGHT - AXIS_H - PAD_B)

  // station gutter
  gutterEl.setAttribute(
    'style',
    `width:132px;flex-shrink:0;position:relative;height:${HEIGHT}px;border-right:1px solid var(--hairline)`,
  )
  gutterEl.innerHTML = corr.stations
    .map((st) => {
      const major = st.tier === 'major'
      return `<div style="position:absolute;top:${y(st.km) - 8}px;right:10px;text-align:right;line-height:1.15">
        <div style="font-size:${major ? 12 : 11}px;font-weight:${major ? 500 : 400};color:${major ? 'var(--ink)' : 'var(--ink-3)'}">${esc(st.name)}</div>
        ${major ? `<div class="mono num" style="font-size:9px;color:var(--ink-3)">${st.km} km</div>` : ''}
      </div>`
    })
    .join('')

  const hourLabelEvery = span === 24 ? 2 : 1
  let svg = `<svg width="${width}" height="${HEIGHT}" style="display:block">`

  // hour grid
  for (let h = 0; h <= 24; h++) {
    svg += `<line x1="${x(h * 60)}" x2="${x(h * 60)}" y1="${AXIS_H}" y2="${HEIGHT - PAD_B}" stroke="var(--hairline-soft)"/>`
    if (h % hourLabelEvery === 0 && h < 24)
      svg += `<text x="${x(h * 60) + 4}" y="18" font-size="10" font-family="var(--font-mono)" fill="var(--ink-3)">${String(h).padStart(2, '0')}:00</text>`
  }
  // station lines
  for (const st of corr.stations)
    svg += `<line x1="0" x2="${width}" y1="${y(st.km)}" y2="${y(st.km)}" stroke="${st.tier === 'major' ? 'var(--hairline)' : 'var(--hairline-soft)'}" ${st.tier === 'minor' ? 'stroke-dasharray="2 4"' : ''}/>`

  // free maintenance windows — the figure-ground flip
  if (showWindows)
    windows.forEach((w, i) => {
      const wpx = x(w.end) - x(w.start)
      svg += `<g class="fw" data-i="${i}" style="cursor:pointer">
        <rect x="${x(w.start)}" y="${y(w.kmA)}" width="${wpx}" height="${y(w.kmB) - y(w.kmA)}" fill="rgba(15,118,110,0.10)">
          <title>${w.fromCode}–${w.toCode} free ${fmtMin(w.start)}–${fmtMin(w.end)} · ${fmtDur(w.end - w.start)} — open Plan</title>
        </rect>
        ${wpx > 64 ? `<text x="${x(w.start) + wpx / 2}" y="${(y(w.kmA) + y(w.kmB)) / 2 + 3}" text-anchor="middle" font-size="9" font-family="var(--font-mono)" fill="var(--accent-ink)">${fmtDur(w.end - w.start)}</text>` : ''}
      </g>`
    })

  // train paths
  for (const t of trains) {
    const style = TYPE_STYLE[t.type]
    const pts = trainSegments(t)
      .flatMap((s) => [
        [x(s.t0), y(s.km0)],
        [x(s.t1), y(s.km1)],
      ])
      .map((p) => p.join(','))
      .join(' ')
    const opacity = showWindows ? 0.13 : 1
    svg += `<g>
      <polyline class="path" data-no="${esc(t.no)}" data-stroke="${style.stroke}" data-width="${style.width}" data-op="${opacity}" points="${pts}" fill="none" stroke="${style.stroke}" stroke-width="${style.width}" ${style.dash ? `stroke-dasharray="${style.dash}"` : ''} opacity="${opacity}" style="transition:opacity 0.12s"/>
      <polyline class="hit" data-no="${esc(t.no)}" points="${pts}" fill="none" stroke="transparent" stroke-width="9" style="cursor:pointer"/>
    </g>`
  }

  // express direct labels
  if (span < 24)
    for (const t of trains) {
      if (t.type !== 'Express') continue
      const s0 = t.stops[0]
      const op = showWindows ? 0.25 : 1
      svg += `<text class="tlabel" data-no="${esc(t.no)}" data-op="${op}" x="${x(s0.dep) + 4}" y="${y(s0.km) + (t.direction === 'down' ? 12 : -6)}" font-size="9" font-family="var(--font-mono)" fill="var(--ink-2)" opacity="${op}">${esc(t.name)}</text>`
    }

  svg += '</svg>'
  scrollEl.innerHTML = svg
  bindDiagram()
}

function tooltipEl() {
  let el = document.querySelector('.marey-tooltip')
  if (!el) {
    el = document.createElement('div')
    el.className = 'marey-tooltip'
    document.body.appendChild(el)
  }
  return el
}
function hideTooltip() {
  const el = document.querySelector('.marey-tooltip')
  if (el) el.remove()
}

/** Update stroke/opacity in place — no SVG rebuild on hover. */
function applyHover() {
  scrollEl.querySelectorAll('.path').forEach((p) => {
    const isHover = hoverNo === p.dataset.no
    const dimmed = hoverNo !== null && !isHover
    p.setAttribute('stroke', isHover ? 'var(--accent)' : p.dataset.stroke)
    p.setAttribute('stroke-width', isHover ? 2 : p.dataset.width)
    p.setAttribute('opacity', isHover ? 1 : dimmed && !showWindows ? 0.18 : p.dataset.op)
  })
  scrollEl.querySelectorAll('.tlabel').forEach((l) => {
    const dimmed = hoverNo !== null && hoverNo !== l.dataset.no
    l.setAttribute('opacity', dimmed && !showWindows ? 0.25 : l.dataset.op)
  })
}

function bindDiagram() {
  scrollEl.querySelectorAll('.fw').forEach((g) => g.addEventListener('click', () => (location.href = 'plan.html')))
  scrollEl.querySelectorAll('.hit').forEach((p) => {
    const no = p.dataset.no
    const train = corridorTrains().find((t) => t.no === no)
    p.addEventListener('mouseenter', () => {
      hoverNo = no
      applyHover()
    })
    p.addEventListener('mousemove', (e) => {
      if (document.querySelector('.drawer')) return
      const el = tooltipEl()
      el.style.left = e.clientX + 14 + 'px'
      el.style.top = e.clientY + 14 + 'px'
      el.innerHTML = `
        <div class="tt-title">${esc(train.name)} <span class="tt-dim num">· ${esc(train.no)}</span></div>
        <div class="tt-dim">${train.type} · ${train.direction === 'down' ? '↓ down' : '↑ up'} · ${fmtMin(train.stops[0].dep)} → ${fmtMin(train.stops[train.stops.length - 1].arr)}</div>`
    })
    p.addEventListener('mouseleave', () => {
      hoverNo = null
      hideTooltip()
      applyHover()
    })
    p.addEventListener('click', () => {
      hoverNo = null
      hideTooltip()
      openTrainDrawer(train)
      applyHover()
    })
  })
}

function openTrainDrawer(t) {
  const corr = corridor()
  const last = corr.stations[corr.stations.length - 1].name
  const first = corr.stations[0].name
  openDrawer({
    title: esc(t.name),
    badge: `<span class="state muted num">${esc(t.no)}</span>`,
    body: `
      <dl class="kv">
        <dt>Type</dt><dd>${t.type}</dd>
        <dt>Direction</dt><dd>${t.direction === 'down' ? 'Down (towards ' + esc(last) + ')' : 'Up (towards ' + esc(first) + ')'}</dd>
        <dt>Runs</dt><dd class="num">${fmtMin(t.stops[0].dep)} – ${fmtMin(t.stops[t.stops.length - 1].arr)}</dd>
      </dl>
      <div class="facts">
        <h4>Booked halts</h4>
        <div class="stops-list num">
          ${t.stops
            .map((s) => {
              const st = corr.stations.find((c) => c.code === s.code)
              return `<div class="row"><span>${esc(st ? st.name : s.code)}</span><span class="unit">${fmtMin(s.arr)}</span><span>${fmtMin(s.dep)}</span></div>`
            })
            .join('')}
        </div>
      </div>`,
  })
}

// toolbar
document.getElementById('span-seg').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-span]')
  if (!btn) return
  span = +btn.dataset.span
  document.querySelectorAll('#span-seg button').forEach((b) => b.classList.toggle('on', b === btn))
  render()
})

const windowsToggle = document.getElementById('windows-toggle')
function syncToggle() {
  windowsToggle.classList.toggle('on', showWindows)
  windowsToggle.setAttribute('aria-pressed', String(showWindows))
}
windowsToggle.addEventListener('click', () => {
  showWindows = !showWindows
  syncToggle()
  render()
})
syncToggle()

new ResizeObserver(() => {
  if (DATA) render()
}).observe(scrollEl)

loadData()
  .then((data) => {
    DATA = data
    document.getElementById('loading').remove()
    document.getElementById('page').style.display = ''
    ctx = initTopbar(data, (newCtx) => {
      ctx = newCtx
      closeDrawer()
      render()
    })
    render()
  })
  .catch(console.error)
