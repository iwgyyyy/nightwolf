import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import { Euler, Quaternion, Vector3 } from "three"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { getSyncService } from "@/sync"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayerStore } from "@/hooks/use-local-player"
import { useNightUiStore } from "@/stores/nightUiStore"
import { centerId, centerIndex, isCenterId } from "@/engine/nightActions"
import type { NightActionSubmission, Role } from "@/types"
import {
  computeSeatPlacements,
  centerCardPositions,
  TABLE_TOP_Y,
} from "./seat-layout"
import { Card3D, type CardPoseTarget } from "./Card3D"
import { Hand, type HandPoseTarget } from "./Hand"
import { PALETTE } from "./palette"

/** 牌面从扣放翻向镜头的旋转（相机局部系） */
const QX = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0))
const Q_HOLD = new Quaternion().setFromEuler(new Euler(1.75, 0, 0))

const REACH_SEC = 0.7
const SWAP_LIFT_SEC = 1.2
const SWAP_DONE_SEC = 1.9
const NO_RESULT_DONE_SEC = 2.2
/** 步骤切换后延迟多久清姿态：等眼睑幕闭合（0.85s）再归位，避免看到牌飞回原位 */
const POSE_RESET_DELAY_SEC = 1.2

/**
 * 每张牌的实时姿态目标容器。模块级共享可变状态（场景单实例）：
 * render 期取稳定引用传给 Card3D，useFrame 里改 current —— 不走
 * hooks，避开 React Compiler 对 ref/useMemo 值的不可变限制。
 */
const cardPoses = new Map<string, { current: CardPoseTarget | null }>()
function getPose(id: string): { current: CardPoseTarget | null } {
  let entry = cardPoses.get(id)
  if (!entry) {
    entry = { current: null }
    cardPoses.set(id, entry)
  }
  return entry
}

interface ActPlan {
  submission: NightActionSubmission
  /** 手伸向的主目标牌 id（null = 无手部动作） */
  reachId: string | null
  /** 互飞的两张牌 */
  swap: [string, string] | null
  /** result 到达后展示方式 */
  reveal: "table" | "eye" | "none"
  /** eye 模式举起哪张牌 */
  eyeCardId: string | null
}

/**
 * 夜晚阶段的场景内容（Canvas 内）。
 * 轮到自己时：点场景里的牌选目标 → 气泡/HUD 确认 → 手部与换牌动画 →
 * 提交 → 结果翻牌展示。非本人回合由 NightCurtain 眼睑幕盖住整个画面。
 */
export function NightScene() {
  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const playerId = useLocalPlayerStore((s) => s.playerId)
  const stage = useNightUiStore((s) => s.stage)
  const selected = useNightUiStore((s) => s.selected)

  const request = privateState?.nightActionRequest ?? null
  const result = privateState?.nightActionResult ?? null

  const placements = useMemo(
    () => computeSeatPlacements(publicState?.players ?? [], playerId),
    [publicState?.players, playerId],
  )

  // 牌注册表：每人一张 + 3 张底牌

  const cards = useMemo(() => {
    const list: {
      id: string
      position: [number, number, number]
      rotationY: number
    }[] = placements.map((p) => ({
      id: p.player.playerId,
      position: p.cardPosition,
      rotationY: p.rotationY,
    }))
    centerCardPositions().forEach((pos, i) => {
      list.push({ id: centerId(i), position: pos, rotationY: 0 })
    })
    return list
  }, [placements])

  // 翻开的牌显示什么角色（只来自服务端单播给自己的 result）
  const revealedRole = (id: string): Role | null => {
    if (!result) return null
    if (result.kind === "rolesRevealed") return result.roles[id] ?? null
    if (result.kind === "swapResult") {
      // 强盗：互飞后停在自己面前的那张（确认时选中的目标牌）就是新身份
      if (selected[0] === id) return result.newRole
    }
    return null
  }

  // ==========================================================
  // 选择规则
  // ==========================================================
  const selectableIds = useMemo(() => {
    const set = new Set<string>()
    if (!request) return set
    switch (request.kind) {
      case "seerChoice":
        for (const p of request.playerTargets) set.add(p)
        for (const i of request.centerCardIndices) set.add(centerId(i))
        break
      case "robberSwap":
      case "troublemakerSwap":
        for (const p of request.playerTargets) set.add(p)
        break
      case "drunkSwap":
        for (const i of request.centerCardIndices) set.add(centerId(i))
        break
      case "loneWerewolf":
        for (const i of request.centerCardIndices) set.add(centerId(i))
        break
      case "insomniacView":
        set.add(playerId)
        break
    }
    return set
  }, [request, playerId])

  const handleCardClick = (id: string) => {
    if (!request || stage !== "selecting" || !selectableIds.has(id)) return
    const store = useNightUiStore.getState()
    const cur = store.selected
    if (cur.includes(id)) {
      store.setSelected(cur.filter((x) => x !== id))
      return
    }
    switch (request.kind) {
      case "seerChoice":
        if (isCenterId(id)) {
          // 底牌多选（最多 2），并清掉玩家选择
          const centers = cur.filter(isCenterId)
          if (centers.length >= 2) return
          store.setSelected([...centers, id])
        } else {
          store.setSelected([id])
        }
        break
      case "troublemakerSwap": {
        if (cur.length >= 2) return
        store.setSelected([...cur, id])
        break
      }
      default:
        store.setSelected([id])
    }
  }

  // ==========================================================
  // 行动计划：confirm 时由 request + selected 构建
  // ==========================================================
  const buildPlan = (): ActPlan | null => {
    if (!request) return null
    switch (request.kind) {
      case "seerChoice": {
        if (selected.length === 1 && !isCenterId(selected[0])) {
          return {
            submission: { kind: "seerViewPlayer", playerId: selected[0] },
            reachId: selected[0],
            swap: null,
            reveal: "table",
            eyeCardId: null,
          }
        }
        const centers = selected.filter(isCenterId).map(centerIndex)
        if (centers.length === 2) {
          const s = [...centers].sort((a, b) => a - b)
          return {
            submission: { kind: "seerViewCenter", indices: [s[0], s[1]] as [number, number] },
            reachId: centerId(s[0]),
            swap: null,
            reveal: "table",
            eyeCardId: null,
          }
        }
        return null
      }
      case "loneWerewolf":
        if (selected.length !== 1) return null
        return {
          submission: { kind: "loneWerewolfView", centerIndex: centerIndex(selected[0]) },
          reachId: selected[0],
          swap: null,
          reveal: "table",
          eyeCardId: null,
        }
      case "robberSwap":
        if (selected.length !== 1) return null
        return {
          submission: { kind: "robberSwap", targetId: selected[0] },
          reachId: selected[0],
          swap: [playerId, selected[0]],
          reveal: "eye",
          eyeCardId: selected[0],
        }
      case "troublemakerSwap":
        if (selected.length !== 2) return null
        return {
          submission: {
            kind: "troublemakerSwap",
            targetIds: [selected[0], selected[1]] as [string, string],
          },
          reachId: selected[0],
          swap: [selected[0], selected[1]],
          reveal: "none",
          eyeCardId: null,
        }
      case "drunkSwap":
        if (selected.length !== 1) return null
        return {
          submission: { kind: "drunkSwap", centerIndex: centerIndex(selected[0]) },
          reachId: selected[0],
          swap: [playerId, selected[0]],
          reveal: "none",
          eyeCardId: null,
        }
      case "insomniacView":
        return {
          submission: { kind: "insomniacConfirm" },
          reachId: playerId,
          swap: null,
          reveal: "eye",
          eyeCardId: playerId,
        }
      default:
        return null
    }
  }

  // ==========================================================
  // 动画状态机（useFrame 驱动）
  // ==========================================================
  const handPose = useRef<HandPoseTarget>({
    position: new Vector3(0.5, 1.4, 3.2),
    quaternion: new Quaternion(),
    visible: false,
  })
  const actRef = useRef<{
    plan: ActPlan
    since: number
    submitted: boolean
  } | null>(null)
  const tmp = useRef({ dir: new Vector3(), pos: new Vector3(), right: new Vector3(), v: new Vector3() })

  const cardById = (id: string) => cards.find((c) => c.id === id)

  // 夜晚步骤推进时复位交互状态。注意信号是 currentNightStep 而不是 request：
  // 提交成功后服务端会把 request 置 null 但步骤不变（定时器到点才推进），
  // 这段窗口正是结果展示时间，不能把它 reset 掉。
  // ref 的复位在 useFrame 里做，避开 React Compiler 的 ref 修改限制。
  const nightStep = publicState?.currentNightStep ?? null
  useEffect(() => {
    useNightUiStore.getState().reset()
  }, [nightStep])
  useEffect(() => () => useNightUiStore.getState().reset(), [])
  const lastStep = useRef<number | null | undefined>(undefined)
  const poseResetAt = useRef<number | null>(null)

  useFrame(({ clock, camera, size }) => {
    if (lastStep.current !== nightStep) {
      const isFirstFrame = lastStep.current === undefined
      lastStep.current = nightStep
      actRef.current = null
      handPose.current.visible = false
      if (isFirstFrame) {
        // 场景刚挂载：直接清残留姿态
        for (const entry of cardPoses.values()) entry.current = null
        poseResetAt.current = null
      } else {
        // 步骤推进：换过牌/举起过的牌不能立即归位——damp 回原位的过程
        // 看起来就像又发生了一次交换。等眼睑幕闭合后再清。
        poseResetAt.current = clock.elapsedTime + POSE_RESET_DELAY_SEC
      }
    }
    if (poseResetAt.current !== null && clock.elapsedTime >= poseResetAt.current) {
      poseResetAt.current = null
      for (const entry of cardPoses.values()) entry.current = null
    }
    const store = useNightUiStore.getState()
    const st = store.stage

    if (st === "acting") {
      // 进入 acting：构建 plan
      if (!actRef.current) {
        const plan = buildPlan()
        if (!plan) {
          store.setStage("selecting")
          return
        }
        actRef.current = { plan, since: clock.elapsedTime, submitted: false }
      }
      const act = actRef.current
      const t = clock.elapsedTime - act.since
      const { plan } = act

      // 手伸向主目标
      const reachCard = plan.reachId ? cardById(plan.reachId) : null
      if (reachCard && t < REACH_SEC + 0.3) {
        handPose.current.visible = true
        handPose.current.position.set(
          reachCard.position[0],
          reachCard.position[1] + 0.15,
          reachCard.position[2] + 0.08,
        )
        handPose.current.quaternion.setFromEuler(new Euler(0, 0, 0))
      } else {
        handPose.current.visible = false
      }

      // 到点提交（一次）
      if (t >= REACH_SEC && !act.submitted) {
        act.submitted = true
        const roomId = publicState?.roomId
        if (roomId) {
          try {
            getSyncService().submitAction(roomId, {
              kind: "nightAction",
              submission: plan.submission,
            })
          } catch {
            toast.error("提交失败")
          }
        }
      }

      // 互飞动画：先抬起，再落到对方位置
      if (plan.swap && t >= REACH_SEC) {
        const [a, b] = plan.swap
        const ca = cardById(a)
        const cb = cardById(b)
        if (ca && cb) {
          const k = t < SWAP_LIFT_SEC ? "lift" : "cross"
          for (const [self, other] of [
            [ca, cb],
            [cb, ca],
          ] as const) {
            const entry = getPose(self.id)
            if (!entry.current) {
              entry.current = { position: new Vector3(), quaternion: new Quaternion() }
            }
            if (k === "lift") {
              entry.current.position.set(
                self.position[0],
                self.position[1] + 0.35,
                self.position[2],
              )
            } else {
              entry.current.position.set(
                other.position[0],
                other.position[1],
                other.position[2],
              )
            }
            entry.current.quaternion.setFromEuler(new Euler(0, other.rotationY, 0))
          }
        }
      }

      // 完成判定
      if (plan.reveal === "none") {
        if (t >= NO_RESULT_DONE_SEC) store.setStage("waiting")
      } else {
        const ready = plan.swap ? t >= SWAP_DONE_SEC : t >= REACH_SEC + 0.25
        if (ready && result) store.setStage("revealing")
      }
      return
    }

    if (st === "revealing" && actRef.current) {
      const { plan } = actRef.current
      const { dir, pos, right } = tmp.current
      camera.getWorldDirection(dir)

      if (plan.reveal === "table" && result?.kind === "rolesRevealed") {
        // 目标牌原地抬起、面向相机
        handPose.current.visible = false
        for (const id of Object.keys(result.roles)) {
          const card = cardById(id)
          if (!card) continue
          const entry = getPose(id)
          if (!entry.current) {
            entry.current = { position: new Vector3(), quaternion: new Quaternion() }
          }
          pos.set(card.position[0], card.position[1] + 0.55, card.position[2])
          pos.lerp(camera.position, 0.3)
          entry.current.position.copy(pos)
          entry.current.quaternion.copy(camera.quaternion).multiply(QX)
        }
      } else if (plan.reveal === "eye" && plan.eyeCardId) {
        // 举到眼前（同发牌阶段，抬高避开底部面板）
        const landscape = size.width > size.height
        right.crossVectors(dir, camera.up).normalize()
        pos.copy(camera.position).addScaledVector(dir, landscape ? 1.25 : 0.78)
        pos.y += 0.08
        const entry = getPose(plan.eyeCardId)
        if (!entry.current) {
          entry.current = { position: new Vector3(), quaternion: new Quaternion() }
        }
        entry.current.position.copy(pos)
        entry.current.quaternion.copy(camera.quaternion).multiply(QX)

        handPose.current.visible = true
        handPose.current.position
          .copy(pos)
          .addScaledVector(dir, -0.015)
          .addScaledVector(right, -0.11)
        handPose.current.position.y -= 0.29
        handPose.current.quaternion.copy(camera.quaternion).multiply(Q_HOLD)
      }
      return
    }

    if (st === "waiting") {
      // 展示归位。互飞过的两张牌落回"交换后"的位置（对方的原位），
      // 其余（含举到眼前看过的）清空姿态 damp 回原位
      handPose.current.visible = false
      const plan = actRef.current?.plan
      for (const [id, entry] of cardPoses) {
        if (plan?.swap && (id === plan.swap[0] || id === plan.swap[1])) {
          const other = cardById(id === plan.swap[0] ? plan.swap[1] : plan.swap[0])
          if (other) {
            if (!entry.current) {
              entry.current = { position: new Vector3(), quaternion: new Quaternion() }
            }
            entry.current.position.set(...other.position)
            entry.current.quaternion.setFromEuler(new Euler(0, other.rotationY, 0))
          }
          continue
        }
        entry.current = null
      }
      return
    }

    // selecting：清理可能残留的手
    handPose.current.visible = false
  })

  if (!publicState || !privateState) return null

  // ==========================================================
  // 派生渲染数据
  // ==========================================================
  const glowIds: string[] =
    request?.kind === "werewolfConfirm"
      ? request.otherWerewolves
      : request?.kind === "minionView"
        ? request.werewolfPlayers
        : []

  // 单目标气泡（多选类的确认放底部 HUD）
  const bubbleTarget = (() => {
    if (stage !== "selecting" || selected.length !== 1 || !request) return null
    const id = selected[0]
    switch (request.kind) {
      case "seerChoice":
        if (isCenterId(id)) return null
        return { id, label: `查验 ${nameOf(id)}` }
      case "robberSwap":
        return { id, label: `与 ${nameOf(id)} 换牌` }
      case "drunkSwap":
        return { id, label: "换这张底牌" }
      case "loneWerewolf":
        return { id, label: "偷看这张" }
      case "insomniacView":
        return { id, label: "查看当前身份" }
      default:
        return null
    }
  })()

  function nameOf(id: string): string {
    return (
      publicState?.players.find((p) => p.playerId === id)?.name ?? "该玩家"
    )
  }

  return (
    <>
      {/* 全部身份牌 + 底牌 */}
      {cards.map((c) => (
        <Card3D
          key={c.id}
          position={c.position}
          rotationY={c.rotationY}
          role={revealedRole(c.id)}
          poseRef={getPose(c.id)}
          highlighted={stage === "selecting" && selectableIds.has(c.id)}
          selected={stage === "selecting" && selected.includes(c.id)}
          onClick={(e) => {
            e.stopPropagation()
            handleCardClick(c.id)
          }}
        />
      ))}

      {/* 狼人互认 / 爪牙看狼：同伴座位发光 + 牌上方醒目标签 */}
      {glowIds.map((id) => {
        const p = placements.find((pl) => pl.player.playerId === id)
        if (!p) return null
        return (
          <group key={id}>
            <group position={p.position}>
              <pointLight
                position={[0, 1.4, 0.35]}
                color={PALETTE.blood500}
                intensity={2.5}
                distance={2.5}
              />
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[0.42, 0.5, 32]} />
                <meshBasicMaterial
                  color={PALETTE.blood500}
                  transparent
                  opacity={0.55}
                />
              </mesh>
            </group>
            <Html
              position={[
                p.cardPosition[0],
                p.cardPosition[1] + 0.55,
                p.cardPosition[2],
              ]}
              center
              zIndexRange={[35, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div className="flex animate-bounce flex-col items-center">
                <span className="rounded-full border border-blood-500/70 bg-night-900/90 px-3 py-1 font-display text-sm whitespace-nowrap text-blood-500 shadow-lg backdrop-blur-sm">
                  狼队友
                </span>
                <span className="text-xs text-blood-500">▼</span>
              </div>
            </Html>
          </group>
        )
      })}

      {/* 确认气泡 */}
      {bubbleTarget && (() => {
        const card = cards.find((c) => c.id === bubbleTarget.id)
        if (!card) return null
        return (
          <Html
            // 水平方向向桌心收，避免边缘座位的气泡超出竖屏画幅
            position={[
              card.position[0] * 0.72,
              card.position[1] + 0.5,
              card.position[2] * 0.72,
            ]}
            center
            zIndexRange={[35, 0]}
          >
            {/* candle 描边 + 底部小箭头，与选中卡牌的亮边框呼应 */}
            <div className="relative flex items-center gap-2 rounded-full border border-candle-500/50 bg-night-900/90 py-1.5 pr-1.5 pl-3 whitespace-nowrap shadow-lg backdrop-blur-sm">
              <span className="font-display text-sm text-moon-100/90">
                {bubbleTarget.label}
              </span>
              <Button
                size="sm"
                className="candle-glow h-7 rounded-full px-3 font-display"
                onClick={() => useNightUiStore.getState().confirmSelection()}
              >
                确认
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full px-2 text-moon-100/60"
                onClick={() => useNightUiStore.getState().setSelected([])}
              >
                取消
              </Button>
              <span
                aria-hidden
                className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-candle-500/50 bg-night-900/90"
              />
            </div>
          </Html>
        )
      })()}

      <Hand poseRef={handPose} />
    </>
  )
}

/** 桌心上方的月色微光：夜晚行动时让桌面比大厅稍亮一点，便于点牌 */
export function NightTableLight() {
  return (
    <pointLight
      position={[0, TABLE_TOP_Y + 1.6, 0]}
      color={PALETTE.moonlight}
      intensity={1.6}
      distance={4}
    />
  )
}
