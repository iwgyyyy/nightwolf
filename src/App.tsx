import { BrowserRouter, Route, Routes } from "react-router"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import HomePage from "@/routes/home/HomePage"
import LobbyPage from "@/routes/lobby/LobbyPage"
import GamePage from "@/routes/game/GamePage"
import DebugPage from "@/routes/debug/DebugPage"

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<LobbyPage />} />
          <Route path="/room/:roomId/game" element={<GamePage />} />
          <Route path="/debug" element={<DebugPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </TooltipProvider>
  )
}

export default App
