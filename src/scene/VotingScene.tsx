import { useEffect, useMemo } from "react"
import { Html } from "@react-three/drei"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { getSyncService } from "@/sync"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayerStore } from "@/hooks/use-local-player"
import { useVoteUiStore } from "@/stores/voteUiStore"
import { computeSeatPlacements } from "./seat-layout"
import { TableCards } from "./TableCards"

/**
 * 投票阶段的场景交互：点其他玩家的牌选定目标 → 牌上方气泡确认后提交。
 * 提交后选择保留，目标牌持续发光作为"我投了他"的标记；弃票在底部 HUD。
 */
export function VotingScene() {
  const publicState = useGameStore((s) => s.publicState)
  const playerId = useLocalPlayerStore((s) => s.playerId)
  const selected = useVoteUiStore((s) => s.selected)
  const submitting = useVoteUiStore((s) => s.submitting)

  // 卸载时复位（进结算/下一局不残留选择）
  useEffect(() => () => useVoteUiStore.getState().reset(), [])

  const placements = useMemo(
    () => computeSeatPlacements(publicState?.players ?? [], playerId),
    [publicState?.players, playerId],
  )

  if (!publicState) return null

  const submitted = publicState.submittedPlayerIds.includes(playerId)
  const selectableIds =
    submitted || submitting
      ? undefined
      : new Set(
          publicState.players
            .filter((p) => p.playerId !== playerId)
            .map((p) => p.playerId),
        )

  const handleConfirm = () => {
    if (submitted || submitting || !selected) return
    useVoteUiStore.getState().setSubmitting(true)
    try {
      getSyncService().submitAction(publicState.roomId, {
        kind: "vote",
        targetId: selected,
      })
    } catch {
      toast.error("提交失败，请重试")
      useVoteUiStore.getState().setSubmitting(false)
    }
  }

  const bubbleCard =
    selected && !submitted && !submitting
      ? placements.find((p) => p.player.playerId === selected)
      : null

  // 已提交且投了人：目标牌上方挂"你投给了他"标记
  const votedCard =
    submitted && selected
      ? placements.find((p) => p.player.playerId === selected)
      : null

  return (
    <>
      <TableCards
        selectableIds={selectableIds}
        selectedId={selected}
        onPick={(id) => useVoteUiStore.getState().setSelected(id)}
      />

      {/* 确认气泡：candle 描边 + 指向箭头，与选中牌的发光样式呼应 */}
      {bubbleCard && (
        <Html
          // 水平方向向桌心收，避免边缘座位的气泡超出竖屏画幅
          position={[
            bubbleCard.cardPosition[0] * 0.72,
            bubbleCard.cardPosition[1] + 0.5,
            bubbleCard.cardPosition[2] * 0.72,
          ]}
          center
          zIndexRange={[35, 0]}
        >
          <div className="relative flex items-center gap-2 rounded-full border border-candle-500/50 bg-night-900/90 py-1.5 pr-1.5 pl-3 whitespace-nowrap shadow-lg backdrop-blur-sm">
            <span className="font-display text-sm text-moon-100/90">
              投给 {bubbleCard.player.name}
            </span>
            <Button
              size="sm"
              className="candle-glow h-7 rounded-full px-3 font-display"
              onClick={handleConfirm}
            >
              确认
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-full px-2 text-moon-100/60"
              onClick={() => useVoteUiStore.getState().setSelected(null)}
            >
              取消
            </Button>
            <span
              aria-hidden
              className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-candle-500/50 bg-night-900/90"
            />
          </div>
        </Html>
      )}

      {/* 已投票标记：钉在目标牌上方（目标牌本身保持发光） */}
      {votedCard && (
        <Html
          position={[
            votedCard.cardPosition[0] * 0.72,
            votedCard.cardPosition[1] + 0.5,
            votedCard.cardPosition[2] * 0.72,
          ]}
          center
          zIndexRange={[30, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span className="flex items-center gap-1 rounded-full border border-sage-500/40 bg-sage-500/15 px-2.5 py-1 font-display text-xs whitespace-nowrap text-sage-500 backdrop-blur-sm">
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
            你投给了 {votedCard.player.name}
          </span>
        </Html>
      )}
    </>
  )
}
