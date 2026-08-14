import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { motion } from "framer-motion"
import {
  Check,
  Clock,
  Copy,
  DoorClosed,
  Gamepad2,
  Play,
  Search,
  Settings2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { PlayerAvatar } from "@/components/game/PlayerAvatar"
import { Button } from "@/components/ui/button"
import { NamePromptDialog } from "@/components/NamePromptDialog"
import { ShareLinkButton } from "@/components/ShareLinkButton"
import { LeaveRoomButton } from "@/components/LeaveRoomButton"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { GameScene } from "@/scene/GameScene"
import { getSyncService } from "@/sync"
import { getNarrationService } from "@/services/NarrationService"
import { useHasName } from "@/hooks/use-local-player"
import { useGameSync } from "@/hooks/use-game-sync"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useGameStore, selectPlayers } from "@/stores/gameStore"
import { MAX_PLAYERS_PER_ROOM } from "@/config/defaults"
import { validateLobbyStart } from "@/engine/orchestrator"
import type { RoomSettings, Role } from "@/types"
import { cn } from "@/lib/utils"
import { copyToClipboard } from "@/lib/clipboard"
import { RoleSelector } from "./components/RoleSelector"
import { TimeSettings } from "./components/TimeSettings"

export default function LobbyPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const hasName = useHasName()
  const isMobile = useIsMobile()

  // 桥接 sync → store
  const { playerId, isHost } = useGameSync({ roomId, enabled: hasName })

  // 从 store 读取
  const publicState = useGameStore((s) => s.publicState)
  const players = useGameStore(selectPlayers)
  const joinError = useGameStore((s) => s.joinError)

  const errorReason: JoinErrorReason | null = joinError
  const nameOpen = !hasName && !errorReason

  const [roomIdCopied, setRoomIdCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 游戏开始后跳转到 GamePage
  useEffect(() => {
    if (publicState && publicState.gamePhase !== "waiting" && roomId) {
      navigate(`/room/${roomId}/game`, { replace: true })
    }
  }, [publicState, roomId, navigate])

  if (errorReason) {
    return <ErrorPage reason={errorReason} onBack={() => navigate("/")} />
  }

  const copyRoomId = async () => {
    if (!roomId || roomIdCopied) return
    const ok = await copyToClipboard(roomId)
    if (ok) {
      setRoomIdCopied(true)
      toast.success("房间号已复制")
      setTimeout(() => setRoomIdCopied(false), 2000)
    } else {
      toast.error("复制失败")
    }
  }

  const handleSettingsChange = (patch: Partial<RoomSettings>) => {
    if (!roomId) return
    // 设置由服务端落地并广播，本地不再自行拼装状态
    getSyncService().sendHostCommand(roomId, { kind: "updateSettings", patch })
  }

  const handleRolesChange = (roles: Role[]) => {
    void handleSettingsChange({ roles })
  }

  const handleStartGame = () => {
    if (!roomId) return
    // 在用户手势内再次 prime —— 距 HomePage 首次 prime 已过了配角色/等待阶段，
    // iOS Safari 可能需要重新解锁 speechSynthesis
    getNarrationService().prime()
    getSyncService().sendHostCommand(roomId, { kind: "startGame" })
  }

  const validation = publicState
    ? validateLobbyStart(players, publicState.settings)
    : { canStart: false, reason: "连接中…" }
  const requiredTotal = Math.max(3, players.length + 3)
  const selfName = players.find((p) => p.playerId === playerId)?.name

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* 3D 圆桌：大厅即入桌，玩家加入时人影落座 */}
      <GameScene
        players={players}
        selfId={playerId}
        hostId={publicState?.hostId ?? null}
      />

      {/* ===== HUD 顶栏 ===== */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div className="pointer-events-auto">
          <LeaveRoomButton roomId={roomId!} isHost={isHost} />
        </div>
        <div className="pointer-events-auto">
          <RoomCodePill
            roomId={roomId!}
            onClick={copyRoomId}
            copied={roomIdCopied}
          />
        </div>
        <span className="w-9 text-right font-sans text-sm text-moon-100/50">
          {publicState ? `${players.length}/${MAX_PLAYERS_PER_ROOM}` : "…"}
        </span>
      </header>

      {/* ===== 自己的座位标识（左下） ===== */}
      {selfName && (
        <div className="absolute bottom-56 left-4 z-10 flex items-center gap-2 rounded-full border border-moon-100/10 bg-night-900/60 py-1 pr-3 pl-1 backdrop-blur-sm sm:bottom-28">
          <PlayerAvatar name={selfName} size={28} ring={isHost ? "candle" : "none"} />
          <span className="font-display text-sm text-moon-100/85">{selfName}</span>
          <span className="text-xs text-moon-100/40">你{isHost && " · 房主"}</span>
        </div>
      )}

      {/* ===== HUD 底部操作区 ===== */}
      <footer
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        {publicState && players.length < 3 && (
          <p className="text-center font-sans text-sm text-moon-100/55">
            至少需要 3 名玩家，把房间号分享给朋友吧
          </p>
        )}
        {!publicState ? (
          <p className="font-sans text-sm text-moon-100/45">连接中…</p>
        ) : isHost ? (
          <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
            <ShareLinkButton roomId={roomId!} className="h-12 sm:flex-1" />
            <Button
              variant="outline"
              className="h-12 gap-2 font-display"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              角色与时间
            </Button>
            <Button
              onClick={handleStartGame}
              disabled={!validation.canStart}
              className="candle-glow h-12 gap-2 font-display text-base sm:flex-1"
            >
              <Play className="h-4 w-4" />
              {validation.canStart ? "开始游戏" : (validation.reason ?? "无法开始")}
            </Button>
          </div>
        ) : (
          <p className="font-sans text-sm text-moon-100/55">
            等待房主配置角色并开始游戏…
          </p>
        )}
      </footer>

      {/* ===== 房主配置抽屉 ===== */}
      {isHost && publicState && (
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={cn(
              "overflow-y-auto p-5",
              isMobile ? "max-h-[85dvh]" : "sm:max-w-md",
            )}
          >
            <SheetHeader className="p-0">
              <SheetTitle className="font-display text-lg text-moon-100">
                本局配置
              </SheetTitle>
            </SheetHeader>
            <div className="night-panel p-4">
              <RoleSelector
                selected={publicState.settings.roles}
                requiredTotal={requiredTotal}
                onChange={handleRolesChange}
              />
              <p className="mt-3 text-xs leading-relaxed text-moon-100/40">
                角色牌数 = 玩家数 + 3 张底牌（当前 {players.length} 人 →{" "}
                {requiredTotal} 张）。玩家加入后需求会自动增加。
              </p>
            </div>
            <div className="night-panel p-4">
              <h3 className="mb-3 flex items-center gap-2 font-display text-base text-moon-100">
                <Clock className="h-4 w-4 text-candle-500" />
                时间配置
              </h3>
              <TimeSettings
                settings={publicState.settings}
                onChange={handleSettingsChange}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <NamePromptDialog
        open={nameOpen}
        onOpenChange={() => {
          /* 受控 */
        }}
        mandatory
        title="先取个昵称"
        description="加入房间前，先让别人认识你"
      />
    </main>
  )
}

// ============================================================
// Subcomponents
// ============================================================

function RoomCodePill({
  roomId,
  onClick,
  copied,
}: {
  roomId: string
  onClick: () => void
  copied: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={copied}
      className={cn(
        "flex items-center gap-2 rounded-full bg-night-800/60 px-4 py-1.5 font-mono text-sm tracking-[0.25em] text-candle-500 backdrop-blur-sm transition",
        copied ? "cursor-default" : "hover:bg-night-700 cursor-pointer",
      )}
      aria-label={copied ? "已复制" : "复制房间号"}
    >
      <span>{copied ? "已复制" : roomId}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-60" />
      )}
    </button>
  )
}

// ============================================================
// 错误页
// ============================================================

type JoinErrorReason = "invalid" | "not-found" | "in-progress" | "full" | "unknown"

const ERROR_META: Record<
  JoinErrorReason,
  { icon: React.ReactNode; title: string; description: string; accent: string }
> = {
  invalid: {
    icon: <Search className="h-6 w-6" />,
    title: "链接不正确",
    description: "房间号格式不对，确认一下链接是否完整",
    accent: "text-moon-100/60",
  },
  "not-found": {
    icon: <Search className="h-6 w-6" />,
    title: "房间不存在",
    description: "这个房间可能从未创建过，或者链接已失效",
    accent: "text-moon-100/60",
  },
  "in-progress": {
    icon: <Gamepad2 className="h-6 w-6" />,
    title: "游戏已开始",
    description: "这局已经开始了，等他们玩完再来吧",
    accent: "text-candle-500",
  },
  full: {
    icon: <Users className="h-6 w-6" />,
    title: "房间已满",
    description: "房间玩家人数已到上限",
    accent: "text-candle-500",
  },
  unknown: {
    icon: <DoorClosed className="h-6 w-6" />,
    title: "无法进入房间",
    description: "连接出了点问题，请稍后再试",
    accent: "text-blood-500",
  },
}

function ErrorPage({
  reason,
  onBack,
}: {
  reason: JoinErrorReason
  onBack: () => void
}) {
  const meta = ERROR_META[reason]
  return (
    <main
      className="flex flex-col items-center justify-center px-6"
      style={{ minHeight: "100dvh" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="night-panel max-w-sm p-8 text-center"
      >
        <div
          className={cn(
            "mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-night-700",
            meta.accent,
          )}
        >
          {meta.icon}
        </div>
        <p className="mt-5 font-display text-2xl text-moon-100">{meta.title}</p>
        <p className="mt-2 text-sm text-moon-100/60">{meta.description}</p>
        <Button onClick={onBack} className="mt-6 candle-glow">
          回到首页
        </Button>
      </motion.div>
    </main>
  )
}
