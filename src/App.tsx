import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import HomePage from "@/routes/home/HomePage"

// three.js 体量大，含 3D 场景的路由按需加载，避免拖累首页首屏
const LobbyPage = lazy(() => import("@/routes/lobby/LobbyPage"))
const GamePage = lazy(() => import("@/routes/game/GamePage"))
const ScenePage = lazy(() => import("@/routes/debug/ScenePage"))

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/room/:roomId"
            element={
              <Suspense fallback={null}>
                <LobbyPage />
              </Suspense>
            }
          />
          <Route
            path="/room/:roomId/game"
            element={
              <Suspense fallback={null}>
                <GamePage />
              </Suspense>
            }
          />
          <Route
            path="/debug/scene"
            element={
              <Suspense fallback={null}>
                <ScenePage />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </TooltipProvider>
  )
}

export default App
