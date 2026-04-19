import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { motion } from "framer-motion"
import {
  Check,
  ChevronLeft,
  Copy,
  Crown,
  Users,
  Sparkles,
  Clock,
  DoorClosed,
  Gamepad2,
  Search,
  Play,
} from "lucide-react"
import { toast } from "sonner"
import { PlayerAvatar } from "@/components/game/PlayerAvatar"
import { Button } from "@/components/ui/button"
import { NamePromptDialog } from "@/components/NamePromptDialog"
import { ShareLinkButton } from "@/components/ShareLinkButton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getSyncService } from "@/sync"
import { getNarrationService } from "@/services/NarrationService"
import { useHasName } from "@/hooks/use-local-player"
import { useGameSync } from "@/hooks/use-game-sync"
import {
  useHostOrchestrator,
  hostStartGame,
} from "@/hooks/use-host-orchestrator"
import { useGameStore, selectPlayers } from "@/stores/gameStore"
import { MAX_PLAYERS_PER_ROOM } from "@/config/defaults"
import { validateLobbyStart } from "@/engine/orchestrator"
import type { PublicRoomState, RoomSettings, Role } from "@/types"
import { cn } from "@/lib/utils"
import { copyToClipboard } from "@/lib/clipboard"
import { RoleSelector } from "./components/RoleSelector"
import { TimeSettings } from "./components/TimeSettings"

export default function LobbyPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const hasName = useHasName()

  // 桥接 sync → store
  const { playerId, isHost } = useGameSync({ roomId, enabled: hasName })

  // Host 编排：监听 pendingHostAction 并处理
  useHostOrchestrator({ roomId, isHost })

  // 从 store 读取
  const publicState = useGameStore((s) => s.publicState)
  const players = useGameStore(selectPlayers)
  const joinError = useGameStore((s) => s.joinError)

  const errorReason: JoinErrorReason | null = joinError
  const nameOpen = !hasName && !errorReason

  const [roomIdCopied, setRoomIdCopied] = useState(false)

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

  const handleLeave = async () => {
    if (!roomId) return
    const sync = getSyncService()
    if (isHost) {
      await sync.deleteRoom(roomId)
      toast("房间已解散")
    } else {
      await sync.leaveRoom(roomId, playerId)
    }
    navigate("/")
  }

  const handleSettingsChange = async (patch: Partial<RoomSettings>) => {
    if (!roomId || !publicState) return
    const sync = getSyncService()
    await sync.updatePublicState(roomId, {
      ...publicState,
      settings: { ...publicState.settings, ...patch },
    })
  }

  const handleRolesChange = (roles: Role[]) => {
    void handleSettingsChange({ roles })
  }

  const handleStartGame = async () => {
    if (!roomId) return
    // 在用户手势内再次 prime —— 距 HomePage 首次 prime 已过了配角色/等待阶段，
    // iOS Safari 可能需要重新解锁 speechSynthesis
    getNarrationService().prime()
    await hostStartGame(roomId)
  }

  return (
    <>
      {/* ==================== Mobile (< md) ==================== */}
      <MobileLayout
        roomId={roomId!}
        publicState={publicState}
        isHost={isHost}
        currentPlayerId={playerId}
        onCopyRoomId={copyRoomId}
        roomIdCopied={roomIdCopied}
        onLeave={handleLeave}
        onRolesChange={handleRolesChange}
        onSettingsChange={handleSettingsChange}
        onStartGame={handleStartGame}
      />

      {/* ==================== Desktop (md+) ==================== */}
      <DesktopLayout
        roomId={roomId!}
        publicState={publicState}
        isHost={isHost}
        currentPlayerId={playerId}
        onCopyRoomId={copyRoomId}
        roomIdCopied={roomIdCopied}
        onLeave={handleLeave}
        onRolesChange={handleRolesChange}
        onSettingsChange={handleSettingsChange}
        onStartGame={handleStartGame}
        players={players}
      />

      <NamePromptDialog
        open={nameOpen}
        onOpenChange={() => {
          /* 受控 */
        }}
        mandatory
        title="先取个昵称"
        description="加入房间前，先让别人认识你"
      />
    </>
  )
}

// ============================================================
// Shared props
// ============================================================

interface LayoutProps {
  roomId: string
  publicState: PublicRoomState | null
  isHost: boolean
  currentPlayerId: string
  onCopyRoomId: () => void
  roomIdCopied: boolean
  onLeave: () => void
  onRolesChange: (roles: Role[]) => void
  onSettingsChange: (patch: Partial<RoomSettings>) => void
  onStartGame: () => void
}

// ============================================================
// Mobile
// ============================================================

function MobileLayout({
  roomId,
  publicState,
  isHost,
  currentPlayerId,
  onCopyRoomId,
  roomIdCopied,
  onLeave,
  onRolesChange,
  onSettingsChange,
  onStartGame,
}: LayoutProps) {
  const players = publicState?.players ?? []
  const validation = publicState
    ? validateLobbyStart(players, publicState.settings)
    : { canStart: false, reason: "连接中…" }
  const requiredTotal = Math.max(3, players.length + 3)

  return (
    <main
      className="relative flex flex-col overflow-hidden px-5 pb-8 md:hidden"
      style={{
        minHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      }}
    >
      <MobileTopbar
        onLeave={onLeave}
        isHost={isHost}
        roomId={roomId}
        onCopyRoomId={onCopyRoomId}
        roomIdCopied={roomIdCopied}
      />

      <section className="relative z-10 mt-6">
        <p className="font-sans text-[0.65rem] uppercase tracking-[0.3em] text-moon-100/40">
          Lobby
        </p>
        <h1 className="mt-1 flex items-baseline gap-3 font-display text-4xl text-candle-500">
          <span className="candle-text-glow">等待大厅</span>
          <span className="font-sans text-sm font-normal text-moon-100/50">
            {players.length} / {MAX_PLAYERS_PER_ROOM}
          </span>
        </h1>
      </section>

      <section className="relative z-10 mt-6 flex-1 space-y-5">
        <PlayerList
          players={players}
          hostId={publicState?.hostId}
          currentPlayerId={currentPlayerId}
          loading={!publicState}
        />

        {isHost && publicState && (
          <>
            <div className="night-panel p-4">
              <RoleSelector
                selected={publicState.settings.roles}
                requiredTotal={requiredTotal}
                onChange={onRolesChange}
              />
            </div>
            <div className="night-panel p-4">
              <h2 className="mb-3 flex items-center gap-2 font-display text-base text-moon-100">
                <Clock className="h-4 w-4 text-candle-500" />
                时间配置
              </h2>
              <TimeSettings
                settings={publicState.settings}
                onChange={onSettingsChange}
              />
            </div>
          </>
        )}
      </section>

      <section className="relative z-10 mt-6 flex flex-col gap-3">
        {isHost && <ShareLinkButton roomId={roomId} className="h-12" />}
        {isHost && (
          <Button
            size="lg"
            onClick={onStartGame}
            disabled={!validation.canStart}
            className="candle-glow h-12 gap-2 font-display text-base"
          >
            <Play className="h-4 w-4" />
            {validation.canStart ? "开始游戏" : (validation.reason ?? "无法开始")}
          </Button>
        )}
      </section>
    </main>
  )
}

function MobileTopbar({
  onLeave,
  isHost,
  roomId,
  onCopyRoomId,
  roomIdCopied,
}: {
  onLeave: () => void
  isHost: boolean
  roomId: string
  onCopyRoomId: () => void
  roomIdCopied: boolean
}) {
  return (
    <header className="relative z-10 flex items-center justify-between">
      <LeaveButton isHost={isHost} onLeave={onLeave} />
      <RoomCodePill
        roomId={roomId}
        onClick={onCopyRoomId}
        copied={roomIdCopied}
      />
      <div className="w-9" />
    </header>
  )
}

// ============================================================
// Desktop
// ============================================================

function DesktopLayout({
  roomId,
  publicState,
  isHost,
  currentPlayerId,
  onCopyRoomId,
  roomIdCopied,
  onLeave,
  onRolesChange,
  onSettingsChange,
  onStartGame,
  players,
}: LayoutProps & { players: PublicRoomState["players"] }) {
  const validation = publicState
    ? validateLobbyStart(players, publicState.settings)
    : { canStart: false, reason: "连接中…" }
  const requiredTotal = Math.max(3, players.length + 3)
  return (
    <main
      className="relative hidden overflow-hidden md:flex md:flex-col"
      style={{ minHeight: "100dvh" }}
    >
      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between border-b border-moon-100/5 px-10 py-5">
        <div className="flex items-center gap-6">
          <LeaveButton isHost={isHost} onLeave={onLeave} variant="desktop" />
          <div className="flex items-center gap-2 text-xs tracking-[0.35em] text-moon-100/40 uppercase">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Nightwolf</span>
          </div>
        </div>
        <RoomCodePill
          roomId={roomId}
          onClick={onCopyRoomId}
          copied={roomIdCopied}
        />
      </header>

      {/* 双栏主体 */}
      <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-12 gap-8 px-10 py-8">
        {/* 左主体：8 栏 */}
        <section className="col-span-8 flex flex-col gap-6">
          <div>
            <p className="font-sans text-[0.7rem] uppercase tracking-[0.4em] text-candle-500/80">
              Lobby · 等待大厅
            </p>
            <h1 className="mt-2 flex items-baseline gap-4 font-display">
              <span className="text-5xl text-candle-500 candle-text-glow">
                围炉夜话
              </span>
              <span className="font-sans text-lg font-normal text-moon-100/50">
                {players.length} / {MAX_PLAYERS_PER_ROOM}
              </span>
            </h1>
            <p className="mt-3 font-sans text-moon-100/60">
              {players.length < 3
                ? "至少需要 3 名玩家，等待朋友加入..."
                : isHost
                  ? "人数满意了就可以配置角色并开始游戏"
                  : "等待房主配置角色并开始游戏"}
            </p>
          </div>

          {/* 玩家列表：PC 用网格 */}
          <div className="grain-overlay night-panel flex-1 p-6">
            <h2 className="flex items-center gap-2 font-display text-lg text-moon-100">
              <Users className="h-4 w-4 text-candle-500" />
              玩家列表
            </h2>
            {!publicState ? (
              <div className="mt-6 text-center text-sm text-moon-100/40">
                连接中…
              </div>
            ) : players.length === 0 ? (
              <EmptyPlayerState />
            ) : (
              <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {players.map((p) => (
                  <PlayerCard
                    key={p.playerId}
                    name={p.name}
                    isHost={publicState.hostId === p.playerId}
                    isYou={p.playerId === currentPlayerId}
                    isConnected={p.isConnected}
                  />
                ))}
                {/* 等待占位 */}
                {Array.from({
                  length: Math.max(0, 3 - players.length),
                }).map((_, i) => (
                  <EmptySeat key={`empty-${i}`} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 右侧栏：4 栏 */}
        <aside className="col-span-4 flex flex-col gap-4">
          {/* 房间码大卡 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="grain-overlay night-panel relative p-6 text-center"
          >
            <p className="font-sans text-[0.65rem] uppercase tracking-[0.3em] text-moon-100/40">
              Room Code
            </p>
            <button
              type="button"
              onClick={onCopyRoomId}
              disabled={roomIdCopied}
              className={cn(
                "mt-3 w-full rounded-lg bg-night-900/40 py-4 transition",
                roomIdCopied
                  ? "cursor-default"
                  : "hover:bg-night-900/70 cursor-pointer",
              )}
            >
              <p className="font-mono text-3xl tracking-[0.4em] text-candle-500 candle-text-glow">
                {roomId}
              </p>
              <p className="mt-2 flex items-center justify-center gap-1 text-[0.65rem] tracking-[0.25em] text-moon-100/40 uppercase">
                {roomIdCopied ? (
                  <>
                    <Check className="h-3 w-3" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    点击复制
                  </>
                )}
              </p>
            </button>
          </motion.div>

          {/* 分享卡 */}
          {isHost && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="flex flex-col gap-3 rounded-2xl border border-candle-500/20 bg-candle-500/5 p-5"
            >
              <p className="font-sans text-sm text-moon-100/70">
                把链接发给朋友，他们填写昵称后即可加入
              </p>
              <ShareLinkButton roomId={roomId} className="h-11 w-full" />
            </motion.div>
          )}

          {/* 时间配置 */}
          {isHost && publicState && (
            <div className="night-panel p-5">
              <h3 className="mb-4 flex items-center gap-2 font-display text-base text-moon-100">
                <Clock className="h-4 w-4 text-candle-500" />
                时间配置
              </h3>
              <TimeSettings
                settings={publicState.settings}
                onChange={onSettingsChange}
              />
            </div>
          )}

          {/* 开始按钮 */}
          {isHost && (
            <Button
              size="lg"
              onClick={onStartGame}
              disabled={!validation.canStart}
              className="candle-glow h-12 gap-2 font-display text-base"
            >
              <Play className="h-4 w-4" />
              {validation.canStart ? "开始游戏" : (validation.reason ?? "无法开始")}
            </Button>
          )}
        </aside>
      </div>

      {/* Host 角色配置面板：位于左主体下方 */}
      {isHost && publicState && (
        <div className="mx-auto w-full max-w-[1400px] px-10 pb-8">
          <div className="col-span-8 night-panel p-6">
            <RoleSelector
              selected={publicState.settings.roles}
              requiredTotal={requiredTotal}
              onChange={onRolesChange}
            />
          </div>
        </div>
      )}
    </main>
  )
}

// ============================================================
// Subcomponents
// ============================================================

function LeaveButton({
  isHost,
  onLeave,
  variant = "mobile",
}: {
  isHost: boolean
  onLeave: () => void
  variant?: "mobile" | "desktop"
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "desktop" ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-moon-100/60 hover:bg-night-700 hover:text-moon-100"
          >
            <ChevronLeft className="h-4 w-4" />
            {isHost ? "解散房间" : "离开"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="text-moon-100/70 hover:bg-night-700 hover:text-moon-100"
            aria-label="返回"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isHost ? "确定要解散房间？" : "确定要离开房间？"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isHost
              ? "解散后所有玩家会退出，操作无法撤销。"
              : "离开后可以凭房间号重新加入。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onLeave}>
            {isHost ? "解散" : "离开"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

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
        "flex items-center gap-2 rounded-full bg-night-800/60 px-4 py-1.5 text-sm font-mono tracking-[0.25em] text-candle-500 transition",
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

function PlayerList({
  players,
  hostId,
  currentPlayerId,
  loading,
}: {
  players: PublicRoomState["players"]
  hostId?: string
  currentPlayerId: string
  loading: boolean
}) {
  return (
    <div className="night-panel p-4">
      <h2 className="font-display text-lg text-moon-100">玩家</h2>
      {loading ? (
        <p className="mt-3 text-sm text-moon-100/40">连接中…</p>
      ) : players.length === 0 ? (
        <p className="mt-3 text-sm text-moon-100/40">等待玩家加入</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {players.map((p) => (
            <motion.li
              key={p.playerId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex items-center gap-3 rounded-lg bg-night-700/40 px-3 py-2",
                !p.isConnected && "opacity-50",
              )}
            >
              <PlayerAvatar
                name={p.name}
                size={32}
                ring={hostId === p.playerId ? "candle" : "none"}
              />
              <span className="flex-1 text-sm">{p.name}</span>
              {hostId === p.playerId && (
                <span className="flex items-center gap-1 text-xs text-candle-500">
                  <Crown className="h-3.5 w-3.5" />
                  房主
                </span>
              )}
              {p.playerId === currentPlayerId && (
                <span className="text-xs text-moon-100/40">你</span>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PlayerCard({
  name,
  isHost,
  isYou,
  isConnected,
}: {
  name: string
  isHost: boolean
  isYou: boolean
  isConnected: boolean
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border p-4 transition",
        isHost
          ? "border-candle-500/40 bg-candle-500/5"
          : "border-moon-100/8 bg-night-700/40",
        !isConnected && "opacity-50",
      )}
    >
      <div className="relative shrink-0">
        <PlayerAvatar
          name={name}
          size={44}
          ring={isHost ? "candle" : "none"}
        />
        {isHost && (
          <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-candle-500 text-ink-900 shadow-md">
            <Crown className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base">{name}</p>
        <p className="mt-0.5 text-xs text-moon-100/40">
          {isHost ? "房主" : "玩家"}
          {isYou && " · 你"}
        </p>
      </div>
      {!isConnected && (
        <span className="text-[0.65rem] uppercase tracking-wider text-moon-100/40">
          离线
        </span>
      )}
    </motion.li>
  )
}

function EmptySeat() {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-dashed border-moon-100/10 bg-transparent p-4">
      <div className="h-11 w-11 shrink-0 rounded-full border border-dashed border-moon-100/15 bg-moon-100/5" />
      <p className="text-sm text-moon-100/30">等待加入…</p>
    </li>
  )
}

function EmptyPlayerState() {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-moon-100/10 py-8 text-center">
      <Users className="mx-auto h-8 w-8 text-moon-100/20" />
      <p className="mt-3 text-sm text-moon-100/40">等待玩家加入...</p>
      <p className="mt-1 text-xs text-moon-100/30">
        点击右侧"邀请好友"分享链接
      </p>
    </div>
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
