import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './store'
import TopBar from './components/TopBar'
import Operations from './pages/Operations'
import Tasks from './pages/Tasks'
import Planner from './pages/Planner'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <TopBar />
        <Routes>
          <Route path="/" element={<Operations />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/plan" element={<Planner />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
