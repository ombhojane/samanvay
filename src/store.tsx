import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadData } from './lib/data'
import type { Corridor, DataSet } from './lib/types'

export interface Assignment {
  blockId: string
  date: string
}

interface AppState {
  data: DataSet | null
  corridorId: string
  setCorridorId: (id: string) => void
  date: string
  setDate: (d: string) => void
  corridor: Corridor | null
  assignments: Record<string, Assignment> // taskId -> block
  assign: (taskId: string, blockId: string, date: string) => void
  unassign: (taskId: string) => void
  clearPlan: () => void
}

const Ctx = createContext<AppState | null>(null)

const LS_KEY = 'samanvay-plan-v1'
export const DEFAULT_DATE = '2026-09-01'

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataSet | null>(null)
  const [corridorId, setCorridorId] = useState('C2')
  const [date, setDate] = useState(DEFAULT_DATE)
  const [assignments, setAssignments] = useState<Record<string, Assignment>>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    loadData().then(setData).catch(console.error)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(assignments))
    } catch {
      /* ignore */
    }
  }, [assignments])

  const corridor = useMemo(
    () => data?.corridors.find((c) => c.id === corridorId) ?? null,
    [data, corridorId],
  )

  const value: AppState = {
    data,
    corridorId,
    setCorridorId,
    date,
    setDate,
    corridor,
    assignments,
    assign: (taskId, blockId, d) => setAssignments((a) => ({ ...a, [taskId]: { blockId, date: d } })),
    unassign: (taskId) =>
      setAssignments((a) => {
        const { [taskId]: _, ...rest } = a
        return rest
      }),
    clearPlan: () => setAssignments({}),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}
