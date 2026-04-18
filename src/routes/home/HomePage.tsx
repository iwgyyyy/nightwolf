import { useState } from "react"
import { motion } from "framer-motion"
import { Moon, ShieldCheck, UserRound, DoorOpen, Sparkles } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AdminAuthDialog } from "@/components/AdminAuthDialog"
import { NamePromptDialog } from "@/components/NamePromptDialog"
import { JoinRoomDialog } from "@/components/JoinRoomDialog"
import { StarField } from "@/components/StarField"
import { VillageSilhouette } from "@/components/icons/VillageSilhouette"
import { PlayerAvatar } from "@/components/game/PlayerAvatar"
import { useAuthStore } from "@/stores/authStore"
import { useHasName, useLocalPlayer } from "@/hooks/use-local-player"
import { getSyncService } from "@/sync"
import { getNarrationService } from "@/services/NarrationService"
import { ADMIN_CREDENTIALS } from "@/config/auth"
import { DEFAULT_ROOM_SETTINGS } from "@/config/defaults"

const TITLE_CHARS = ["一", "夜", "狼", "人", "杀"]

type PendingAction = "create" | "join" | null

export default function HomePage() {
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const revokeAdmin = useAuthStore((s) => s.revokeAdmin)
  const hasName = useHasName()
  const { playerId, name } = useLocalPlayer()

  const [authOpen, setAuthOpen] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)

  const createRoom = async () => {
    try {
      const sync = getSyncService()
      const roomId = await sync.createRoom(
        playerId,
        DEFAULT_ROOM_SETTINGS,
        ADMIN_CREDENTIALS,
      )
      navigate(`/room/${roomId}`)
    } catch (err) {
      toast.error((err as Error).message || "创建房间失败")
    }
  }

  const handleCreateRoom = async () => {
    // 用户首次手势：预热 TTS 解锁 iOS Safari 自动播放
    getNarrationService().prime()
    if (!isAdmin) {
      setPending("create")
      setAuthOpen(true)
      return
    }
    if (!hasName) {
      setPending("create")
      setNameOpen(true)
      return
    }
    await createRoom()
  }

  const handleJoinRoom = () => {
    getNarrationService().prime()
    if (!hasName) {
      setPending("join")
      setNameOpen(true)
      return
    }
    setJoinOpen(true)
  }

  const handleAuthSuccess = () => {
    if (pending === "create") {
      if (!hasName) {
        setNameOpen(true)
      } else {
        setPending(null)
        void createRoom()
      }
    }
  }

  const handleNameSet = () => {
    if (pending === "create") {
      setPending(null)
      void createRoom()
    } else if (pending === "join") {
      setPending(null)
      setJoinOpen(true)
    }
  }

  return (
    <>
      {/* ==================== Mobile layout (< md) ==================== */}
      <MobileLayout
        isAdmin={isAdmin}
        onRevokeAdmin={revokeAdmin}
        hasName={hasName}
        onOpenName={() => setNameOpen(true)}
        onCreate={handleCreateRoom}
        onJoin={handleJoinRoom}
        playerName={name}
      />

      {/* ==================== PC layout (md+) ==================== */}
      <DesktopLayout
        isAdmin={isAdmin}
        onRevokeAdmin={revokeAdmin}
        hasName={hasName}
        onOpenName={() => setNameOpen(true)}
        onCreate={handleCreateRoom}
        onJoin={handleJoinRoom}
        playerName={name}
      />

      <AdminAuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSuccess={handleAuthSuccess}
      />
      <NamePromptDialog
        open={nameOpen}
        onOpenChange={setNameOpen}
        onConfirm={handleNameSet}
      />
      <JoinRoomDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  )
}

// ============================================================
// Shared layout props
// ============================================================

interface LayoutProps {
  isAdmin: boolean
  onRevokeAdmin: () => void
  hasName: boolean
  onOpenName: () => void
  onCreate: () => void
  onJoin: () => void
  playerName: string
}

// ============================================================
// Mobile (< md)
// ============================================================

function MobileLayout({
  isAdmin,
  onRevokeAdmin,
  hasName,
  onOpenName,
  onCreate,
  onJoin,
  playerName,
}: LayoutProps) {
  return (
    <main
      className="relative flex flex-col items-center justify-between overflow-hidden px-6 md:hidden"
      style={{
        minHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
      }}
    >
      {isAdmin && (
        <AdminBadge
          onClick={onRevokeAdmin}
          className="absolute right-4"
          style={{ top: "calc(env(safe-area-inset-top) + 1rem)" }}
        />
      )}

      {hasName && (
        <NameBadge
          name={playerName}
          onClick={onOpenName}
          className="absolute left-4"
          style={{ top: "calc(env(safe-area-inset-top) + 1rem)" }}
        />
      )}

      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-10 right-6 text-candle-500/20 candle-flicker"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      >
        <Moon className="h-28 w-28" strokeWidth={0.6} />
      </motion.div>

      <div className="relative z-10 flex w-full flex-1 flex-col items-center justify-center gap-8">
        <TitleSplash size="mobile" />

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
          className="font-sans text-[0.7rem] uppercase tracking-[0.28em] text-moon-100/60"
        >
          One Night · Ultimate Werewolf
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.9 }}
          className="card-parchment grain-overlay mt-2 w-[260px] px-7 py-8 text-center"
        >
          <p className="font-display text-xl tracking-wide">夜幕低垂</p>
          <p className="mt-2 font-sans text-sm text-ink-900/70">
            邀请朋友，围炉夜谈
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        className="relative z-10 flex w-full max-w-[320px] flex-col gap-3"
      >
        <Button
          size="lg"
          onClick={onCreate}
          className="candle-glow h-14 font-display text-base tracking-wider"
        >
          创建房间
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={onJoin}
          className="h-14 border-moon-100/20 font-display text-base tracking-wider text-moon-100 hover:bg-night-700 hover:text-moon-100"
        >
          加入房间
        </Button>
        <p className="mt-2 text-center text-[0.65rem] uppercase tracking-[0.25em] text-moon-100/40">
          made for friends
        </p>
      </motion.div>
    </main>
  )
}

// ============================================================
// Desktop (md+)
// ============================================================

function DesktopLayout({
  isAdmin,
  onRevokeAdmin,
  hasName,
  onOpenName,
  onCreate,
  onJoin,
  playerName,
}: LayoutProps) {
  return (
    <main
      className="relative hidden overflow-hidden md:block"
      style={{ minHeight: "100dvh" }}
    >
      {/* 顶部栏 */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2 text-xs tracking-[0.35em] text-moon-100/40 uppercase">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Nightwolf</span>
        </div>
        <div className="flex items-center gap-3">
          {hasName && (
            <NameBadge name={playerName} onClick={onOpenName} />
          )}
          {isAdmin && <AdminBadge onClick={onRevokeAdmin} />}
        </div>
      </div>

      {/* 繁星场 */}
      <StarField count={60} />

      {/* 巨大月亮：左上角 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-16 left-24 floating-drift"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.8, ease: "easeOut" }}
      >
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, oklch(0.85 0.12 78 / 0.35), transparent 70%)",
              transform: "scale(1.5)",
            }}
          />
          <Moon
            className="relative h-56 w-56 text-candle-500/40 candle-flicker lg:h-64 lg:w-64"
            strokeWidth={0.5}
          />
        </div>
      </motion.div>

      {/* 底部村落剪影 */}
      <VillageSilhouette className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-candle-500/30" />

      {/* 主内容：分栏构图 */}
      <div className="relative z-20 mx-auto grid min-h-dvh max-w-[1400px] grid-cols-12 items-center gap-8 px-12">
        {/* 左列：标题 + slogan，占 7 栏 */}
        <div className="col-span-7 flex flex-col gap-6">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="font-sans text-xs uppercase tracking-[0.4em] text-candle-500/80"
          >
            — One Night · Ultimate Werewolf —
          </motion.p>

          <TitleSplash size="desktop" />

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="max-w-md font-display text-xl leading-relaxed text-moon-100/70"
          >
            夜幕低垂，火光摇曳。
            <br />
            一局定胜负，朋友间的火焰与谎言。
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.5 }}
            className="mt-4 flex items-center gap-6 text-xs tracking-[0.3em] text-moon-100/40 uppercase"
          >
            <span className="inline-flex items-center gap-2">
              <span className="h-px w-8 bg-moon-100/20" />
              3-10 players
            </span>
            <span>·</span>
            <span>5-10 min</span>
            <span>·</span>
            <span>friends only</span>
          </motion.div>
        </div>

        {/* 右列：action panel，占 5 栏 */}
        <motion.aside
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="col-span-5 flex flex-col gap-5"
        >
          {/* 装饰羊皮纸牌 */}
          <motion.div
            initial={{ rotate: -3 }}
            animate={{ rotate: 0 }}
            transition={{ delay: 1.4, duration: 1 }}
            className="card-parchment grain-overlay relative mb-2 mx-auto w-[280px] px-8 py-10 text-center"
            style={{ transform: "rotate(-2deg)" }}
          >
            <p className="font-display text-2xl tracking-wide">夜幕低垂</p>
            <p className="mt-3 font-sans text-sm text-ink-900/70">
              邀请朋友，围炉夜谈
            </p>
            {/* 封蜡装饰 */}
            <div
              className="absolute -bottom-3 -right-3 flex h-10 w-10 items-center justify-center rounded-full bg-blood-500 text-moon-100 shadow-lg"
              style={{ transform: "rotate(10deg)" }}
            >
              <Moon className="h-5 w-5" strokeWidth={1.2} />
            </div>
          </motion.div>

          {/* 两张操作卡片（而非简单按钮） */}
          <ActionCard
            icon={<UserRound className="h-5 w-5" />}
            title="创建房间"
            subtitle="当主持人，邀请朋友加入"
            onClick={onCreate}
            primary
          />
          <ActionCard
            icon={<DoorOpen className="h-5 w-5" />}
            title="加入房间"
            subtitle="输入朋友发给你的房间号"
            onClick={onJoin}
          />
        </motion.aside>
      </div>

      {/* 底部标签 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 text-[0.65rem] uppercase tracking-[0.3em] text-moon-100/40"
      >
        made for friends
      </motion.div>
    </main>
  )
}

// ============================================================
// Subcomponents
// ============================================================

function TitleSplash({ size }: { size: "mobile" | "desktop" }) {
  const sizeClass =
    size === "mobile"
      ? "text-[3.75rem] gap-1.5"
      : "text-[6rem] lg:text-[7.5rem] gap-3"

  return (
    <h1
      className={`flex font-display leading-none font-light tracking-wide ${sizeClass}`}
    >
      {TITLE_CHARS.map((char, i) => (
        <motion.span
          key={char + i}
          initial={{ opacity: 0, y: 40, rotate: -6 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{
            delay: 0.15 * i + (size === "desktop" ? 0.4 : 0),
            duration: 0.8,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="inline-block text-candle-500 candle-text-glow"
          style={{
            transform: `translateY(${i % 2 === 0 ? "0" : "8px"})`,
          }}
        >
          {char}
        </motion.span>
      ))}
    </h1>
  )
}

interface ActionCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  primary?: boolean
}

function ActionCard({ icon, title, subtitle, onClick, primary }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 ${
        primary
          ? "border-candle-500/40 bg-candle-500/10 hover:border-candle-500/70 hover:bg-candle-500/15 hover:shadow-[0_0_32px_oklch(0.78_0.13_75/0.25)]"
          : "border-moon-100/10 bg-night-800/50 hover:border-moon-100/25 hover:bg-night-800/80"
      }`}
    >
      <div className="flex items-center gap-4 px-6 py-5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            primary
              ? "bg-candle-500 text-ink-900"
              : "bg-night-700 text-moon-100/80 group-hover:bg-night-700/80"
          }`}
        >
          {icon}
        </div>
        <div className="flex-1">
          <p className="font-display text-lg tracking-wide">{title}</p>
          <p className="font-sans text-sm text-moon-100/50">{subtitle}</p>
        </div>
        <ChevronArrow />
      </div>
    </button>
  )
}

function ChevronArrow() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-moon-100/30 transition-all group-hover:translate-x-1 group-hover:text-moon-100/80"
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface BadgeProps {
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

function AdminBadge({ className, style, onClick }: BadgeProps) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      onClick={onClick}
      style={style}
      className={`z-20 flex items-center gap-1.5 rounded-full bg-sage-500/15 px-3 py-1.5 text-xs text-sage-500 transition hover:bg-sage-500/25 ${className ?? ""}`}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      <span>已授权 · 点击退出</span>
    </motion.button>
  )
}

function NameBadge({
  name,
  onClick,
  className,
  style,
}: BadgeProps & { name: string }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      onClick={onClick}
      style={style}
      className={`z-20 flex items-center gap-2 rounded-full bg-night-800/60 py-1 pr-3 pl-1 text-xs text-moon-100/70 transition hover:bg-night-700 hover:text-moon-100 ${className ?? ""}`}
    >
      <PlayerAvatar name={name} size={22} />
      <span className="max-w-32 truncate">{name || "取个昵称"}</span>
    </motion.button>
  )
}
