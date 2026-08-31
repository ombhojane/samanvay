export interface Station {
  code: string
  name: string
  km: number
  tier: 'major' | 'minor'
}

export interface Corridor {
  id: string
  name: string
  division: string
  stations: Station[]
}

export interface Stop {
  code: string
  km: number
  arr: number // minutes from midnight
  dep: number
}

export interface Train {
  no: string
  name: string
  type: 'Express' | 'Passenger' | 'Suburban' | 'Goods'
  direction: 'up' | 'down'
  corridorId: string
  stops: Stop[]
}

export type Department = 'Engineering' | 'S&T' | 'Traction'

export interface Task {
  id: string
  assetId: string
  source: 'TMS' | 'SMMS' | 'TDMS'
  department: Department
  workType: string
  description: string
  corridorId: string
  from: string
  to: string
  durationMin: number
  dueDate: string // YYYY-MM-DD
  risk: 'High' | 'Medium' | 'Low'
  status: string
}

export interface Block {
  id: string
  corridorId: string
  date: string
  from: string
  to: string
  start: number // minutes
  end: number
  type: 'traffic' | 'power'
}

export interface DataSet {
  corridors: Corridor[]
  trains: Train[]
  tasks: Task[]
  blocks: Block[]
}
