import { useState } from "react"
import { motion } from "framer-motion"
import { Check, Eye, EyeOff, Info } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/game/Card"
import { PlayerSeat } from "@/components/game/PlayerSeat"
import { RoleBadge } from "@/components/game/RoleBadge"
import { getSyncService } from "@/sync"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { emitNightEvent } from "@/stores/nightAnimationBus"
import type {
  NightActionRequest,
  NightActionResult,
  NightActionSubmission,
} from "@/types"
import { cn } from "@/lib/utils"

/** CardSwap 动画时长；提交后等它播完再写 private state，保证新牌出现在动画之后 */
const SWAP_ANIMATION_MS = 1200

// ============================================================
// 顶层分派
// ============================================================

interface NightActionDispatcherProps {
  request: NightActionRequest
  result: NightActionResult | null
}

export function NightActionDispatcher({
  request,
  result,
}: NightActionDispatcherProps) {
  // 已有结果时优先显示结果
  if (result) return <NightActionResultView result={result} />

  switch (request.kind) {
    case "minionView":
      return <MinionViewPanel werewolfPlayers={request.werewolfPlayers} />
    case "werewolfConfirm":
      return <WerewolfConfirmPanel otherWerewolves={request.otherWerewolves} />
    case "loneWerewolf":
      return <LoneWerewolfPanel />
    case "seerChoice":
      return (
        <SeerChoicePanel
          playerTargets={request.playerTargets}
          centerCardIndices={request.centerCardIndices}
        />
      )
    case "robberSwap":
      return <RobberSwapPanel playerTargets={request.playerTargets} />
    case "troublemakerSwap":
      return <TroublemakerSwapPanel playerTargets={request.playerTargets} />
    case "drunkSwap":
      return <DrunkSwapPanel centerCardIndices={request.centerCardIndices} />
    case "insomniacView":
      return <InsomniacViewPanel />
  }
}

// ============================================================
// 工具 hook：提交
// ============================================================

function useSubmitAction(): {
  submit: (submission: NightActionSubmission) => Promise<void>
  submitting: boolean
} {
  const { playerId } = useLocalPlayer()
  const roomId = useGameStore((s) => s.publicState?.roomId)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (submission: NightActionSubmission) => {
    if (!roomId || submitting) return
    setSubmitting(true)
    try {
      await getSyncService().submitAction(roomId, playerId, {
        kind: "nightAction",
        submission,
      })
    } catch {
      toast.error("提交失败")
      setSubmitting(false)
    }
  }

  return { submit, submitting }
}

// ============================================================
// 爪牙：查看狼人
// ============================================================

function MinionViewPanel({ werewolfPlayers }: { werewolfPlayers: string[] }) {
  const { submit, submitting } = useSubmitAction()
  const players = useGameStore((s) => s.publicState?.players ?? [])
  const werewolves = players.filter((p) => werewolfPlayers.includes(p.playerId))

  return (
    <Panel
      title="爪牙 · 查看狼人"
      description={
        werewolves.length > 0
          ? "记住下面这些狼人的身份，你站在他们一边"
          : "本局没有狼人玩家（狼人都在桌面牌里）"
      }
    >
      {werewolves.length > 0 && (
        <div className="flex flex-wrap justify-center gap-5">
          {werewolves.map((p) => (
            <PlayerSeat
              key={p.playerId}
              name={p.name}
              size="md"
              footer={<RoleBadge role="werewolf" size="sm" />}
            />
          ))}
        </div>
      )}
      <ConfirmButton
        onClick={() => submit({ kind: "minionConfirm" })}
        disabled={submitting}
      />
    </Panel>
  )
}

// ============================================================
// 狼人：多狼互认
// ============================================================

function WerewolfConfirmPanel({
  otherWerewolves,
}: {
  otherWerewolves: string[]
}) {
  const { submit, submitting } = useSubmitAction()
  const players = useGameStore((s) => s.publicState?.players ?? [])
  const mates = players.filter((p) => otherWerewolves.includes(p.playerId))

  return (
    <Panel
      title="狼人 · 互相确认"
      description="你的队友已现身。记住他们"
    >
      <div className="flex flex-wrap justify-center gap-5">
        {mates.map((p) => (
          <PlayerSeat
            key={p.playerId}
            name={p.name}
            size="md"
            footer={<RoleBadge role="werewolf" size="sm" />}
          />
        ))}
      </div>
      <ConfirmButton
        onClick={() => submit({ kind: "werewolfConfirm" })}
        disabled={submitting}
      />
    </Panel>
  )
}

// ============================================================
// 独狼：查看一张桌面牌或跳过
// ============================================================

function LoneWerewolfPanel() {
  const { submit, submitting } = useSubmitAction()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  return (
    <Panel
      title="独狼 · 查看桌面牌"
      description="你是唯一的狼人。可以偷看一张桌面牌，或跳过"
    >
      <CenterCardPicker
        selected={selectedIndex}
        onSelect={setSelectedIndex}
      />
      <div className="flex gap-3">
        <Button
          size="lg"
          variant="outline"
          onClick={() => submit({ kind: "loneWerewolfSkip" })}
          disabled={submitting}
          className="h-11 flex-1"
        >
          跳过
        </Button>
        <Button
          size="lg"
          onClick={() =>
            selectedIndex !== null &&
            submit({ kind: "loneWerewolfView", centerIndex: selectedIndex })
          }
          disabled={submitting || selectedIndex === null}
          className="candle-glow h-11 flex-1"
        >
          查看
        </Button>
      </div>
    </Panel>
  )
}

// ============================================================
// 预言家：二选一
// ============================================================

function SeerChoicePanel({
  playerTargets,
  centerCardIndices,
}: {
  playerTargets: string[]
  centerCardIndices: number[]
}) {
  const { submit, submitting } = useSubmitAction()
  const [mode, setMode] = useState<"player" | "center">("player")
  const [playerPick, setPlayerPick] = useState<string | null>(null)
  const [centerPicks, setCenterPicks] = useState<number[]>([])

  const players = useGameStore((s) => s.publicState?.players ?? [])
  const targetPlayers = players.filter((p) =>
    playerTargets.includes(p.playerId),
  )

  const toggleCenter = (idx: number) => {
    setCenterPicks((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx)
      if (prev.length >= 2) return prev
      return [...prev, idx]
    })
  }

  const canSubmit =
    mode === "player" ? !!playerPick : centerPicks.length === 2
  const handleSubmit = () => {
    if (mode === "player" && playerPick) {
      void submit({ kind: "seerViewPlayer", playerId: playerPick })
    } else if (mode === "center" && centerPicks.length === 2) {
      void submit({
        kind: "seerViewCenter",
        indices: [centerPicks[0], centerPicks[1]] as [number, number],
      })
    }
  }

  return (
    <Panel
      title="预言家 · 查看身份"
      description="任选其一：查看一名玩家身份 / 查看两张桌面牌"
    >
      <div className="mb-4 flex w-full rounded-lg bg-night-800/70 p-1">
        <TabButton
          active={mode === "player"}
          onClick={() => setMode("player")}
        >
          查看玩家
        </TabButton>
        <TabButton
          active={mode === "center"}
          onClick={() => setMode("center")}
        >
          查看桌面牌
        </TabButton>
      </div>

      {mode === "player" ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
          {targetPlayers.map((p) => (
            <PlayerSeat
              key={p.playerId}
              name={p.name}
              size="md"
              selected={playerPick === p.playerId}
              onClick={() => setPlayerPick(p.playerId)}
            />
          ))}
        </div>
      ) : (
        <CenterCardPicker
          multi
          indices={centerCardIndices}
          selectedMulti={centerPicks}
          onSelectMulti={toggleCenter}
        />
      )}

      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="candle-glow mt-6 h-11 w-full"
      >
        {mode === "center" && centerPicks.length < 2
          ? `再选 ${2 - centerPicks.length} 张`
          : "查看"}
      </Button>
    </Panel>
  )
}

// ============================================================
// 强盗：与一人交换
// ============================================================

function RobberSwapPanel({ playerTargets }: { playerTargets: string[] }) {
  const { submit, submitting } = useSubmitAction()
  const { playerId } = useLocalPlayer()
  const [pick, setPick] = useState<string | null>(null)
  const players = useGameStore((s) => s.publicState?.players ?? [])
  const targets = players.filter((p) => playerTargets.includes(p.playerId))

  const handleSubmit = async () => {
    if (!pick) return
    emitNightEvent("swap", {
      fromId: playerId,
      toId: pick,
      kind: "robber",
    })
    await new Promise((r) => setTimeout(r, SWAP_ANIMATION_MS))
    await submit({ kind: "robberSwap", targetId: pick })
  }

  return (
    <Panel
      title="强盗 · 换牌"
      description="选择一名玩家与其交换身份，你会看到换来的新牌"
    >
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {targets.map((p) => (
          <PlayerSeat
            key={p.playerId}
            name={p.name}
            size="md"
            selected={pick === p.playerId}
            onClick={() => setPick(p.playerId)}
          />
        ))}
      </div>
      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={submitting || !pick}
        className="candle-glow mt-6 h-11 w-full"
      >
        {pick ? "抢夺" : "选择目标"}
      </Button>
    </Panel>
  )
}

// ============================================================
// 捣蛋鬼：交换两人
// ============================================================

function TroublemakerSwapPanel({
  playerTargets,
}: {
  playerTargets: string[]
}) {
  const { submit, submitting } = useSubmitAction()
  const [picks, setPicks] = useState<string[]>([])
  const players = useGameStore((s) => s.publicState?.players ?? [])
  const targets = players.filter((p) => playerTargets.includes(p.playerId))

  const toggle = (id: string) => {
    setPicks((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev
      return [...prev, id]
    })
  }

  const canSubmit = picks.length === 2

  const handleSubmit = async () => {
    if (!canSubmit) return
    emitNightEvent("swap", {
      fromId: picks[0],
      toId: picks[1],
      kind: "troublemaker",
    })
    await new Promise((r) => setTimeout(r, SWAP_ANIMATION_MS))
    await submit({
      kind: "troublemakerSwap",
      targetIds: [picks[0], picks[1]] as [string, string],
    })
  }

  return (
    <Panel
      title="捣蛋鬼 · 交换"
      description="选择两名其他玩家，他们的身份牌会交换（你不会看到）"
    >
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {targets.map((p) => (
          <PlayerSeat
            key={p.playerId}
            name={p.name}
            size="md"
            selected={picks.includes(p.playerId)}
            onClick={() => toggle(p.playerId)}
          />
        ))}
      </div>
      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        className="candle-glow mt-6 h-11 w-full"
      >
        {canSubmit ? "交换" : `再选 ${2 - picks.length} 人`}
      </Button>
    </Panel>
  )
}

// ============================================================
// 酒鬼：与桌面牌交换（不看）
// ============================================================

function DrunkSwapPanel({
  centerCardIndices,
}: {
  centerCardIndices: number[]
}) {
  const { submit, submitting } = useSubmitAction()
  const { playerId } = useLocalPlayer()
  const [pick, setPick] = useState<number | null>(null)

  const handleSubmit = async () => {
    if (pick === null) return
    emitNightEvent("swap", {
      fromId: playerId,
      toId: `center_${pick}`,
      kind: "drunk",
    })
    await new Promise((r) => setTimeout(r, SWAP_ANIMATION_MS))
    await submit({ kind: "drunkSwap", centerIndex: pick })
  }

  return (
    <Panel
      title="酒鬼 · 换桌面牌"
      description="选一张桌面牌与自己交换，不会看到换来的牌是什么"
    >
      <CenterCardPicker
        indices={centerCardIndices}
        selected={pick}
        onSelect={setPick}
      />
      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={submitting || pick === null}
        className="candle-glow mt-6 h-11 w-full"
      >
        {pick !== null ? "交换" : "选择桌面牌"}
      </Button>
    </Panel>
  )
}

// ============================================================
// 失眠者：查看自己
// ============================================================

function InsomniacViewPanel() {
  const { submit, submitting } = useSubmitAction()

  return (
    <Panel
      title="失眠者 · 查看自己"
      description="最后睁眼：点击揭开自己当前的身份（可能已被强盗/捣蛋鬼换过）"
    >
      <Button
        size="lg"
        onClick={() => submit({ kind: "insomniacConfirm" })}
        disabled={submitting}
        className="candle-glow h-11 w-full gap-2"
      >
        <Eye className="h-4 w-4" />
        揭开身份
      </Button>
    </Panel>
  )
}

// ============================================================
// 操作结果展示（revealed / swap / noResult）
// ============================================================

function NightActionResultView({ result }: { result: NightActionResult }) {
  // 卡牌/身份的视觉展示由 RevealOverlay（中央翻面动画）独占；
  // 这里底部 Panel 只保留一个轻量"已完成"提示。
  const description =
    result.kind === "noResult"
      ? "你的夜晚操作已提交，等待其他玩家"
      : result.kind === "swapResult"
        ? "身份已交换，请记住你看到的新牌"
        : "请记住你看到的信息"
  return (
    <Panel title="已完成" description={description}>
      <IdleWaiting />
    </Panel>
  )
}

// ============================================================
// 子组件
// ============================================================

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="night-panel w-full max-w-xl p-6"
    >
      <header className="mb-5 text-center">
        <p className="font-sans text-[0.65rem] uppercase tracking-[0.35em] text-candle-500/70">
          Night Action
        </p>
        <h2 className="mt-2 font-display text-2xl text-candle-500 candle-text-glow">
          {title}
        </h2>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-moon-100/60">
          <Info className="h-3.5 w-3.5" />
          {description}
        </p>
      </header>
      <div className="flex flex-col items-center gap-5">{children}</div>
    </motion.section>
  )
}

function ConfirmButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled}
      className="candle-glow mt-2 h-11 w-full gap-2"
    >
      <Check className="h-4 w-4" />
      已记住
    </Button>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-candle-500/90 text-ink-900 shadow-sm"
          : "text-moon-100/60 hover:text-moon-100",
      )}
    >
      {children}
    </button>
  )
}

function IdleWaiting() {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-moon-100/40">
      <EyeOff className="h-4 w-4" />
      <span>请闭上眼睛，等待其他玩家…</span>
    </div>
  )
}

// ============================================================
// 桌面牌选择器（3 张背面卡，点击选择）
// ============================================================

interface CenterCardPickerProps {
  indices?: number[]
  /** 单选模式：当前选中的 index */
  selected?: number | null
  onSelect?: (idx: number | null) => void
  /** 多选模式 */
  multi?: boolean
  selectedMulti?: number[]
  onSelectMulti?: (idx: number) => void
}

function CenterCardPicker({
  indices = [0, 1, 2],
  selected,
  onSelect,
  multi,
  selectedMulti,
  onSelectMulti,
}: CenterCardPickerProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      {indices.map((idx) => {
        const isSelected = multi
          ? selectedMulti?.includes(idx)
          : selected === idx
        return (
          <div key={idx} className="flex flex-col items-center gap-1">
            <Card
              size="md"
              selected={isSelected}
              onClick={() => {
                if (multi) onSelectMulti?.(idx)
                else onSelect?.(idx)
              }}
            />
            <span className="text-[10px] tracking-wider text-moon-100/40 uppercase">
              {isSelected && (
                <span className="mr-1 inline-flex items-center gap-1 text-candle-500">
                  <Eye className="h-3 w-3" />
                </span>
              )}
              桌面 {idx + 1}
            </span>
          </div>
        )
      })}
    </div>
  )
}
