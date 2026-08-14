import { useEffect } from "react"
import { useNavigate, useParams } from "react-router"
import { Moon } from "lucide-react"
import { useGameSync } from "@/hooks/use-game-sync"
import { useVoiceChat } from "@/hooks/use-voice-chat"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { useNarrationSync } from "@/hooks/use-narration-sync"
import {
  useGameStore,
  selectGamePhase,
} from "@/stores/gameStore"
import { useDealingUiStore } from "@/stores/dealingUiStore"
import { useNightUiStore } from "@/stores/nightUiStore"
import { useHasName } from "@/hooks/use-local-player"
import { PhaseTransition } from "@/components/game/PhaseTransition"
import { NightCurtainHost } from "@/components/game/NightCurtain"
import { GameScene } from "@/scene/GameScene"
import { DealingScene } from "@/scene/DealingScene"
import { NightScene, NightTableLight } from "@/scene/NightScene"
import { TableCards } from "@/scene/TableCards"
import { VotingScene } from "@/scene/VotingScene"
import { ResultScene } from "@/scene/ResultScene"
import { LeaveRoomButton } from "@/components/LeaveRoomButton"
import { MicButton } from "@/components/game/MicButton"
import { DealingHud } from "./components/DealingHud"
import { NightHud } from "./components/NightHud"
import { DayHud } from "./components/DayHud"
import { VotingHud } from "./components/VotingHud"
import { ResultHud } from "./components/ResultHud"
import { PhasePlaceholder } from "./components/PhasePlaceholder"

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const hasName = useHasName()

  // 桥接 sync → store
  const { playerId, isHost } = useGameSync({ roomId, enabled: hasName })
  // 房间语音：夜晚强制禁麦、天亮自动开麦由 VoiceService 内部按阶段执行
  useVoiceChat(hasName ? roomId : undefined)
  // 所有玩家都按本地 publicState 变化播报语音
  useNarrationSync()
  // 保持屏幕唤醒，防止手机息屏打断计时/语音
  useWakeLock(hasName)

  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const phase = useGameStore(selectGamePhase)
  const joinError = useGameStore((s) => s.joinError)
  const peekStage = useDealingUiStore((s) => s.peekStage)
  const nightStage = useNightUiStore((s) => s.stage)

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

  return (
    <main className="fixed inset-0 overflow-hidden">
      <GameScene
        players={publicState.players}
        selfId={playerId}
        hostId={publicState.hostId}
        confirmedIds={
          phase === "dealing" || phase === "voting"
            ? publicState.submittedPlayerIds
            : undefined
        }
        candleLit={phase === "dealing" || phase === "night"}
        daylight={phase === "day" || phase === "voting" || phase === "result"}
        eliminatedIds={
          phase === "result"
            ? publicState.resultData?.eliminatedPlayerIds
            : undefined
        }
        hideNameTags={
          // 看牌/翻牌时名牌（DOM 层）会盖在牌上，淡出让位：
          // 发牌翻看自己的牌、夜晚行动与结果展示、结算全桌翻牌
          (phase === "dealing" &&
            (peekStage === "picking" || peekStage === "holding")) ||
          (phase === "night" &&
            (nightStage === "acting" || nightStage === "revealing")) ||
          phase === "result"
        }
        hideTableTags={
          // 名签不做深度测试、永远叠在场景上层，举牌到眼前的窗口要隐藏让位
          (phase === "dealing" &&
            (peekStage === "picking" || peekStage === "holding")) ||
          (phase === "night" && nightStage === "revealing")
        }
      >
        {phase === "dealing" && <DealingScene />}
        {phase === "night" && (
          <>
            <NightScene />
            <NightTableLight />
          </>
        )}
        {phase === "day" && <TableCards />}
        {phase === "voting" && <VotingScene />}
        {phase === "result" && <ResultScene />}
      </GameScene>

      {phase === "dealing" && <DealingHud />}
      {phase === "night" && <NightHud />}
      {phase === "day" && <DayHud />}
      {phase === "voting" && <VotingHud />}
      {phase === "result" && <ResultHud />}

      {/* 退出/解散：左上角与大厅一致，z-50 保证闭眼幕布之上也能点到 */}
      {roomId && (
        <div
          className="absolute left-2 z-50"
          style={{ top: "calc(env(safe-area-inset-top) + 0.65rem)" }}
        >
          <LeaveRoomButton roomId={roomId} isHost={isHost} inGame />
        </div>
      )}

      <MicButton />

      {/* night 阶段由 NightCurtain 接管过场，避免双层动画 */}
      <PhaseTransition
        phase={phase === "night" ? null : phase}
        duration={900}
      />
      <NightCurtainHost />
    </main>
  )
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
