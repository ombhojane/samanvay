import { NavLink } from 'react-router-dom'
import { useApp } from '../store'

const tabs = [
  { to: '/', n: '1', label: 'Operations' },
  { to: '/tasks', n: '2', label: 'Tasks' },
  { to: '/plan', n: '3', label: 'Plan' },
]

export default function TopBar() {
  const { data, corridorId, setCorridorId, date, setDate } = useApp()
  return (
    <header className="topbar">
      <img
        className="brand-logo"
        src={`${import.meta.env.BASE_URL}logo.jpg`}
        alt="Samanvay — Integrated Railway Maintenance Planning"
      />

      <nav className="pipeline">
        {tabs.map((t, i) => (
          <span key={t.to} style={{ display: 'contents' }}>
            {i > 0 && <span className="sep">→</span>}
            <NavLink to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="step-n num">{t.n}</span>
              {t.label}
            </NavLink>
          </span>
        ))}
      </nav>

      <div className="context">
        <select value={corridorId} onChange={(e) => setCorridorId(e.target.value)} aria-label="Corridor">
          {(data?.corridors ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} · {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          min="2026-09-01"
          max="2026-09-28"
          onChange={(e) => setDate(e.target.value)}
          aria-label="Plan date"
        />
      </div>
    </header>
  )
}
