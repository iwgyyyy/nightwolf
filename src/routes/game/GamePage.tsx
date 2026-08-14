import { useEffect } from "react"
import { useNavigate, useParams } from "react-router"
import { Moon } from "lucide-react"
import { useGameSync } from "@/hooks/use-game-sync"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { useNarrationSync } from "@/hooks/use-narration-sync"
import {
  useGameStore,
  selectGamePhase,
} from "@/stores/gameStore"
import { useHasName } from "@/hooks/use-local-player"
import { PhaseTransition } from "@/components/game/PhaseTransition"
import { NightCurtainHost } from "@/components/game/NightCurtain"
import { GameScene } from "@/scene/GameScene"
import { DealingScene } from "@/scene/DealingScene"
import { NightScene, NightTableLight } from "@/scene/NightScene"
import { LeaveRoomButton } from "@/components/LeaveRoomButton"
import type { GamePhase } from "@/types"
import DayScreen from "./components/DayScreen"
import VotingScreen from "./components/VotingScreen"
import ResultScreen from "./components/ResultScreen"
import { DealingHud } from "./components/DealingHud"
import { NightHud } from "./components/NightHud"
import { PhasePlaceholder } from "./components/PhasePlaceholder"

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const hasName = useHasName()

  // 桥接 sync → store
  const { playerId, isHost } = useGameSync({ roomId, enabled: hasName })
  // 所有玩家都按本地 publicState 变化播报语音
  useNarrationSync()
  // 保持屏幕唤醒，防止手机息屏打断计时/语音
  useWakeLock(hasName)

  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const phase = useGameStore(selectGamePhase)
  const joinError = useGameStore((s) => s.joinError)

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
        title="Observer · 未参与"
        description="你未被分配到本局"
      />
    )
  }

  // 3D 化推进中：dealing / night 已入桌；其余阶段仍是旧 2D 屏，盖在场景上层
  const sceneDriven = phase === "dealing" || phase === "night"

  return (
    <main className="fixed inset-0 overflow-hidden">
      <GameScene
        players={publicState.players}
        selfId={playerId}
        hostId={publicState.hostId}
        confirmedIds={
          phase === "dealing" ? publicState.submittedPlayerIds : undefined
        }
      >
        {phase === "dealing" && <DealingScene />}
        {phase === "night" && (
          <>
            <NightScene />
            <NightTableLight />
          </>
        )}
      </GameScene>

      {phase === "dealing" && <DealingHud />}
      {phase === "night" && <NightHud />}
      {!sceneDriven && (
        <div className="absolute inset-0 overflow-y-auto bg-night-900">
          <PhaseDispatcher phase={phase} />
        </div>
      )}

      {/* 退出/解散：左上角与大厅一致，z-50 保证闭眼幕布之上也能点到 */}
      {roomId && (
        <div
          className="absolute left-2 z-50"
          style={{ top: "calc(env(safe-area-inset-top) + 0.65rem)" }}
        >
          <LeaveRoomButton roomId={roomId} isHost={isHost} inGame />
        </div>
      )}

      {/* night 阶段由 NightCurtain 接管过场，避免双层动画 */}
      <PhaseTransition
        phase={phase === "night" ? null : phase}
        duration={900}
      />
      <NightCurtainHost />
    </main>
  )
}

function PhaseDispatcher({ phase }: { phase: GamePhase }) {
  switch (phase) {
    case "day":
      return <DayScreen />
    case "voting":
      return <VotingScreen />
    case "result":
      return <ResultScreen />
    case "dealing":
    case "night":
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
