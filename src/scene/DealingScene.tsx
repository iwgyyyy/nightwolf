import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Euler, Quaternion, Vector3 } from "three"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayerStore } from "@/hooks/use-local-player"
import { useDealingUiStore } from "@/stores/dealingUiStore"
import {
  computeSeatPlacements,
  centerCardPositions,
  TABLE_TOP_Y,
} from "./seat-layout"
import { Card3D, type CardPoseTarget } from "./Card3D"
import { Hand, type HandPoseTarget } from "./Hand"

const DECK: [number, number, number] = [0, TABLE_TOP_Y + 0.03, 0]
/** 牌面从扣放翻向镜头的旋转（相机局部系） */
const QX = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0))
/** 举牌时手的姿态：指尖上翘扣在牌面下缘、朝向镜头（相机局部系） */
const Q_HOLD = new Quaternion().setFromEuler(new Euler(1.75, 0, 0))

const REACH_SEC = 0.55
const RETURN_SEC = 0.6

/**
 * 发牌阶段的场景内容（Canvas 内）：
 * 发牌飞行 → 自己的牌可点 → 手伸过去拿起举到眼前 → 确认后放回。
 * 只有自己的牌有正面贴图 —— 其他人的牌客户端本来就不知道是什么。
 */
export function DealingScene() {
  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const playerId = useLocalPlayerStore((s) => s.playerId)
  const peekStage = useDealingUiStore((s) => s.peekStage)

  const placements = useMemo(
    () => computeSeatPlacements(publicState?.players ?? [], playerId),
    [publicState?.players, playerId],
  )
  const myPlacement = placements.find((p) => p.isSelf)

  // 实时姿态目标（useFrame 改写，不触发 React 渲染）
  const cardPose = useRef<CardPoseTarget | null>(null)
  const handPose = useRef<HandPoseTarget>({
    position: new Vector3(0.5, 1.4, 3.2),
    quaternion: new Quaternion(),
    visible: false,
  })
  const stageClock = useRef({ stage: "down" as string, since: 0 })
  const tmp = useRef({ dir: new Vector3(), pos: new Vector3(), right: new Vector3() })

  // 卸载时复位交互状态
  useEffect(() => () => useDealingUiStore.getState().reset(), [])

  useFrame(({ clock, camera, size }) => {
    if (!myPlacement) return
    const store = useDealingUiStore.getState()
    const stage = store.peekStage
    if (stageClock.current.stage !== stage) {
      stageClock.current.stage = stage
      stageClock.current.since = clock.elapsedTime
    }
    const elapsed = clock.elapsedTime - stageClock.current.since
    const cardAt = myPlacement.cardPosition

    if (stage === "picking") {
      // 手伸向牌面上方
      handPose.current.visible = true
      handPose.current.position.set(cardAt[0], cardAt[1] + 0.16, cardAt[2] + 0.1)
      handPose.current.quaternion.setFromEuler(new Euler(0, myPlacement.rotationY, 0))
      cardPose.current = null
      if (elapsed > REACH_SEC) store.setPeekStage("holding")
    } else if (stage === "holding") {
      // 牌举到眼前，正对相机。横屏画幅矮，举远一点避免和底部说明面板重叠
      const { dir, pos, right } = tmp.current
      const landscape = size.width > size.height
      camera.getWorldDirection(dir)
      right.crossVectors(dir, camera.up).normalize()
      pos.copy(camera.position).addScaledVector(dir, landscape ? 1.25 : 0.85)
      pos.y -= landscape ? 0 : 0.1
      if (!cardPose.current) {
        cardPose.current = {
          position: new Vector3(),
          quaternion: new Quaternion(),
        }
      }
      cardPose.current.position.copy(pos)
      cardPose.current.quaternion.copy(camera.quaternion).multiply(QX)
      // 手扣住牌的左下角，指尖从牌前缘露出，不挡牌面文字
      handPose.current.visible = true
      handPose.current.position
        .copy(pos)
        .addScaledVector(dir, -0.015)
        .addScaledVector(right, -0.11)
      handPose.current.position.y -= 0.29
      handPose.current.quaternion.copy(camera.quaternion).multiply(Q_HOLD)
    } else if (stage === "returning") {
      cardPose.current = null
      handPose.current.position.set(cardAt[0], cardAt[1] + 0.16, cardAt[2] + 0.1)
      if (elapsed > RETURN_SEC) {
        handPose.current.visible = false
        store.setPeekStage("down")
      }
    } else {
      handPose.current.visible = false
    }
  })

  if (!publicState || !privateState || !myPlacement) return null

  const submitted = publicState.submittedPlayerIds.includes(playerId)
  const n = placements.length

  return (
    <>
      {/* 各玩家面前的身份牌 */}
      {placements.map((p, i) => (
        <Card3D
          key={p.player.playerId}
          position={p.cardPosition}
          rotationY={p.rotationY}
          role={p.isSelf ? privateState.originalRole : null}
          dealFrom={DECK}
          dealDelay={i * 0.12}
          poseRef={p.isSelf ? cardPose : undefined}
          highlighted={p.isSelf && peekStage === "down" && !submitted}
          onClick={
            p.isSelf
              ? (e) => {
                  e.stopPropagation()
                  useDealingUiStore.getState().requestPeek()
                }
              : undefined
          }
        />
      ))}

      {/* 中央 3 张底牌 */}
      {centerCardPositions().map((pos, i) => (
        <Card3D
          key={`center-${i}`}
          position={pos}
          rotationY={0}
          role={null}
          dealFrom={DECK}
          dealDelay={n * 0.12 + i * 0.12}
        />
      ))}

      <Hand poseRef={handPose} />
    </>
  )
}
