import { useEffect } from "react"
import { useNavigate, useParams } from "react-router"
import { AnimatePresence } from "framer-motion"
import { Moon } from "lucide-react"
import { useGameSync } from "@/hooks/use-game-sync"
import { useHostOrchestrator } from "@/hooks/use-host-orchestrator"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { useNarrationSync } from "@/hooks/use-narration-sync"
import {
  useGameStore,
  selectGamePhase,
  selectPlayers,
  selectHostId,
} from "@/stores/gameStore"
import { useHasName } from "@/hooks/use-local-player"
import DealingScreen from "./components/DealingScreen"
import NightScreen from "./components/NightScreen"
import DayScreen from "./components/DayScreen"
import VotingScreen from "./components/VotingScreen"
import ResultScreen from "./components/ResultScreen"
import { PausedOverlay } from "./components/PausedOverlay"
import { PhasePlaceholder } from "./components/PhasePlaceholder"
import { PhaseTransition } from "@/components/game/PhaseTransition"
import type { GamePhase } from "@/types"

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const hasName = useHasName()

  // 桥接 sync → store
  const { isHost } = useGameSync({ roomId, enabled: hasName })
  useHostOrchestrator({ roomId, isHost })
  // 所有玩家都按本地 publicState 变化播报语音
  useNarrationSync()
  // 保持屏幕唤醒，防止手机息屏打断计时/语音
  useWakeLock(hasName)

  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const phase = useGameStore(selectGamePhase)
  const joinError = useGameStore((s) => s.joinError)
  const players = useGameStore(selectPlayers)
  const hostId = useGameStore(selectHostId)
  const hostName = players.find((p) => p.playerId === hostId)?.name

  // waiting 阶段（再来一局）→ 返回大厅
  useEffect(() => {
    if (publicState?.gamePhase === "waiting" && roomId) {
      navigate(`/room/${roomId}`, { replace: true })
    }
  }, [publicState, roomId, navigate])

  // 无名字或加入错误 → 回首页
  useEffect(() => {
    if (!hasName || joinError) {
      navigate("/", { replace: true })
    }
  }, [hasName, joinError, navigate])

  if (!publicState || !phase) {
    return <LoadingScreen />
  }

  // 已加入但未分配私有状态 → 观察者模式（理论上不该发生）
  if (!privateState && phase !== "waiting") {
    return (
      <PhasePlaceholder
        phase={phase}
        title="未参与"
        description="你未被分配到本局"
      />
    )
  }

  return (
    <>
      <PhaseDispatcher phase={phase} />
      <PhaseTransition phase={phase} duration={900} />
      <AnimatePresence>
        {publicState.isPaused && <PausedOverlay hostName={hostName} />}
      </AnimatePresence>
    </>
  )
}

function PhaseDispatcher({ phase }: { phase: GamePhase }) {
  switch (phase) {
    case "dealing":
      return <DealingScreen />
    case "night":
      return <NightScreen />
    case "day":
      return <DayScreen />
    case "voting":
      return <VotingScreen />
    case "result":
      return <ResultScreen />
    case "waiting":
      return <LoadingScreen />
  }
}

function LoadingScreen() {
  return (
    <main
      className="flex flex-col items-center justify-center gap-4 px-6"
      style={{ minHeight: "100dvh" }}
    >
      <Moon className="h-10 w-10 text-candle-500/60 candle-flicker" strokeWidth={0.8} />
      <p className="font-display text-lg text-moon-100/60">连接中…</p>
    </main>
  )
}
