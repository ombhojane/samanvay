import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../store'
import { fmtDur, fmtMin } from '../lib/data'
import { freeWindows, trainSegments } from '../lib/plan'
import type { Train } from '../lib/types'
import Drawer from '../components/Drawer'

const TYPE_STYLE: Record<Train['type'], { stroke: string; width: number; dash?: string }> = {
  Express: { stroke: '#44403c', width: 1.6 },
  Passenger: { stroke: '#78716c', width: 1.2 },
  Suburban: { stroke: '#cbc6c0', width: 1 },
  Goods: { stroke: '#a09c96', width: 1.3, dash: '5 4' },
}

const AXIS_H = 28
const PAD_B = 26

export default function Operations() {
  const { data, corridor } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [span, setSpan] = useState<24 | 12 | 6>(24)
  const [showWindows, setShowWindows] = useState(params.get('windows') === '1')
  const [hover, setHover] = useState<string | null>(null)
  const [selected, setSelected] = useState<Train | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; train: Train } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(1000)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const trains = useMemo(
    () => (data && corridor ? data.trains.filter((t) => t.corridorId === corridor.id) : []),
    [data, corridor],
  )
  const windows = useMemo(
    () => (corridor ? freeWindows(corridor, trains) : []),
    [corridor, trains],
  )

  const pxPerHour = containerW / span
  const width = 24 * pxPerHour
  const height = 560
  const kmMax = corridor ? corridor.stations[corridor.stations.length - 1].km : 1
  const x = useCallback((min: number) => (min / 60) * pxPerHour, [pxPerHour])
  const y = useCallback(
    (km: number) => AXIS_H + (km / kmMax) * (height - AXIS_H - PAD_B),
    [kmMax],
  )

  if (!data || !corridor) return <div className="loading">Loading corridor data…</div>

  const hourLabelEvery = span === 24 ? 2 : 1

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Train operations</h1>
        <span className="page-note num">{trains.length} services</span>
      </div>

      <div className="marey-card">
        <div className="marey-toolbar">
          <div className="seg" role="group" aria-label="Time span">
            {([24, 12, 6] as const).map((s) => (
              <button key={s} className={span === s ? 'on' : ''} onClick={() => setSpan(s)}>
                {s} h
              </button>
            ))}
          </div>
          <button
            className={`toggle ${showWindows ? 'on' : ''}`}
            onClick={() => setShowWindows((v) => !v)}
            aria-pressed={showWindows}
          >
            <span className="track" />
            Show maintenance windows
          </button>
          <div className="marey-legend">
            <span><span className="sw" style={{ borderColor: TYPE_STYLE.Express.stroke }} />Express</span>
            <span><span className="sw" style={{ borderColor: TYPE_STYLE.Passenger.stroke }} />Passenger</span>
            <span><span className="sw" style={{ borderColor: TYPE_STYLE.Suburban.stroke }} />Suburban</span>
            <span><span className="sw" style={{ borderColor: TYPE_STYLE.Goods.stroke, borderTopStyle: 'dashed' }} />Goods (forecast)</span>
          </div>
        </div>

        <div className="marey-body">
          {/* station gutter */}
          <div style={{ width: 132, flexShrink: 0, position: 'relative', height, borderRight: '1px solid var(--hairline)' }}>
            {corridor.stations.map((st) => (
              <div
                key={st.code}
                style={{
                  position: 'absolute',
                  top: y(st.km) - 8,
                  right: 10,
                  textAlign: 'right',
                  lineHeight: 1.15,
                }}
              >
                <div
                  style={{
                    fontSize: st.tier === 'major' ? 12 : 11,
                    fontWeight: st.tier === 'major' ? 500 : 400,
                    color: st.tier === 'major' ? 'var(--ink)' : 'var(--ink-3)',
                  }}
                >
                  {st.name}
                </div>
                {st.tier === 'major' && (
                  <div className="mono num" style={{ fontSize: 9, color: 'var(--ink-3)' }}>
                    {st.km} km
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* diagram */}
          <div className="marey-scroll" ref={scrollRef}>
            <svg width={width} height={height} style={{ display: 'block' }}>
              {/* hour grid */}
              {Array.from({ length: 25 }, (_, h) => (
                <g key={h}>
                  <line x1={x(h * 60)} x2={x(h * 60)} y1={AXIS_H} y2={height - PAD_B} stroke="var(--hairline-soft)" />
                  {h % hourLabelEvery === 0 && h < 24 && (
                    <text
                      x={x(h * 60) + 4}
                      y={18}
                      fontSize={10}
                      fontFamily="var(--font-mono)"
                      fill="var(--ink-3)"
                    >
                      {String(h).padStart(2, '0')}:00
                    </text>
                  )}
                </g>
              ))}
              {/* station lines */}
              {corridor.stations.map((st) => (
                <line
                  key={st.code}
                  x1={0}
                  x2={width}
                  y1={y(st.km)}
                  y2={y(st.km)}
                  stroke={st.tier === 'major' ? 'var(--hairline)' : 'var(--hairline-soft)'}
                  strokeDasharray={st.tier === 'minor' ? '2 4' : undefined}
                />
              ))}

              {/* free maintenance windows — the figure-ground flip */}
              {showWindows &&
                windows.map((w, i) => {
                  const wpx = x(w.end) - x(w.start)
                  return (
                    <g
                      key={i}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate('/plan')}
                    >
                      <rect
                        x={x(w.start)}
                        y={y(w.kmA)}
                        width={wpx}
                        height={y(w.kmB) - y(w.kmA)}
                        fill="rgba(15,118,110,0.10)"
                      >
                        <title>
                          {w.fromCode}–{w.toCode} free {fmtMin(w.start)}–{fmtMin(w.end)} · {fmtDur(w.end - w.start)} — open Plan
                        </title>
                      </rect>
                      {wpx > 64 && (
                        <text
                          x={x(w.start) + wpx / 2}
                          y={(y(w.kmA) + y(w.kmB)) / 2 + 3}
                          textAnchor="middle"
                          fontSize={9}
                          fontFamily="var(--font-mono)"
                          fill="var(--accent-ink)"
                        >
                          {fmtDur(w.end - w.start)}
                        </text>
                      )}
                    </g>
                  )
                })}

              {/* train paths */}
              {trains.map((t) => {
                const style = TYPE_STYLE[t.type]
                const pts = trainSegments(t)
                  .flatMap((s) => [
                    [x(s.t0), y(s.km0)],
                    [x(s.t1), y(s.km1)],
                  ])
                  .map((p) => p.join(','))
                  .join(' ')
                const isHover = hover === t.no
                const dimmed = showWindows || (hover !== null && !isHover)
                return (
                  <g key={t.no}>
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={isHover ? 'var(--accent)' : style.stroke}
                      strokeWidth={isHover ? 2 : style.width}
                      strokeDasharray={style.dash}
                      opacity={dimmed && !isHover ? (showWindows ? 0.13 : 0.18) : 1}
                      style={{ transition: 'opacity 0.12s' }}
                    />
                    {/* wide invisible hit path */}
                    <polyline
                      points={pts}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={9}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHover(t.no)}
                      onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, train: t })}
                      onMouseLeave={() => {
                        setHover(null)
                        setTip(null)
                      }}
                      onClick={() => { setSelected(t); setHover(null); setTip(null) }}
                    />
                  </g>
                )
              })}

              {/* express direct labels */}
              {span < 24 &&
                trains
                  .filter((t) => t.type === 'Express')
                  .map((t) => {
                    const s0 = t.stops[0]
                    return (
                      <text
                        key={t.no}
                        x={x(s0.dep) + 4}
                        y={y(s0.km) + (t.direction === 'down' ? 12 : -6)}
                        fontSize={9}
                        fontFamily="var(--font-mono)"
                        fill="var(--ink-2)"
                        opacity={showWindows ? 0.25 : hover && hover !== t.no ? 0.25 : 1}
                      >
                        {t.name}
                      </text>
                    )
                  })}
            </svg>
          </div>
        </div>
      </div>

      {tip && !selected && (
        <div className="marey-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          <div className="tt-title">
            {tip.train.name} <span className="tt-dim num">· {tip.train.no}</span>
          </div>
          <div className="tt-dim">
            {tip.train.type} · {tip.train.direction === 'down' ? '↓ down' : '↑ up'} ·{' '}
            {fmtMin(tip.train.stops[0].dep)} → {fmtMin(tip.train.stops[tip.train.stops.length - 1].arr)}
          </div>
        </div>
      )}

      {selected && (
        <Drawer
          title={selected.name}
          badge={<span className="state muted num">{selected.no}</span>}
          onClose={() => setSelected(null)}
        >
          <dl className="kv">
            <dt>Type</dt>
            <dd>{selected.type}</dd>
            <dt>Direction</dt>
            <dd>{selected.direction === 'down' ? 'Down (towards ' + corridor.stations[corridor.stations.length - 1].name + ')' : 'Up (towards ' + corridor.stations[0].name + ')'}</dd>
            <dt>Runs</dt>
            <dd className="num">
              {fmtMin(selected.stops[0].dep)} – {fmtMin(selected.stops[selected.stops.length - 1].arr)}
            </dd>
          </dl>
          <div className="facts">
            <h4>Booked halts</h4>
            <div className="stops-list num">
              {selected.stops.map((s) => {
                const st = corridor.stations.find((c) => c.code === s.code)
                return (
                  <div className="row" key={s.code + s.arr}>
                    <span>{st?.name ?? s.code}</span>
                    <span className="unit">{fmtMin(s.arr)}</span>
                    <span>{fmtMin(s.dep)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Drawer>
      )}
    </div>
  )
}
