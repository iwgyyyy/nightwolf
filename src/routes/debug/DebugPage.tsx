import { useState } from "react"
import { Link } from "react-router"
import { ChevronLeft } from "lucide-react"
import { Card } from "@/components/game/Card"
import { ROLE_GLYPH } from "@/components/game/role-display"
import { CardSwap } from "@/components/game/CardSwap"
import { PlayerSeat } from "@/components/game/PlayerSeat"
import { PlayerTable } from "@/components/game/PlayerTable"
import { CountdownRing } from "@/components/game/CountdownRing"
import { RoleBadge } from "@/components/game/RoleBadge"
import { PhaseTransition } from "@/components/game/PhaseTransition"
import { Button } from "@/components/ui/button"
import { ALL_ROLES } from "@/types"
import type { GamePhase, Role } from "@/types"

const MOCK_PLAYERS = [
  { playerId: "p1", name: "Alice", isHost: true, isYou: false, isConnected: true },
  { playerId: "p2", name: "Bob", isHost: false, isYou: true, isConnected: true },
  { playerId: "p3", name: "Cathy", isHost: false, isYou: false, isConnected: true, isActive: true },
  { playerId: "p4", name: "Dave", isHost: false, isYou: false, isConnected: false },
  { playerId: "p5", name: "Eve", isHost: false, isYou: false, isConnected: true, isEliminated: true },
  { playerId: "p6", name: "Frank", isHost: false, isYou: false, isConnected: true },
  { playerId: "p7", name: "Grace", isHost: false, isYou: false, isConnected: true },
]

const PHASES: GamePhase[] = ["dealing", "night", "day", "voting", "result"]

export default function DebugPage() {
  const [flipped, setFlipped] = useState<Record<Role, boolean>>({} as Record<Role, boolean>)
  const [countdownEndsAt, setCountdownEndsAt] = useState<string | null>(null)
  const [transitionPhase, setTransitionPhase] = useState<GamePhase | null>(null)
  const [transitionNonce, setTransitionNonce] = useState(0)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [endsInFew] = useState(() =>
    new Date(Date.now() + 4000).toISOString(),
  )
  const [endsInMinute] = useState(() =>
    new Date(Date.now() + 60000).toISOString(),
  )

  const startCountdown = (seconds: number) => {
    setCountdownEndsAt(new Date(Date.now() + seconds * 1000).toISOString())
  }

  const toggleFlip = (role: Role) =>
    setFlipped((f) => ({ ...f, [role]: !f[role] }))

  return (
    <main className="min-h-screen p-6 md:p-10" style={{ minHeight: "100dvh" }}>
      {/* 顶栏 */}
      <header className="mb-8 flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ChevronLeft className="h-4 w-4" />
            返回
          </Link>
        </Button>
        <h1 className="font-display text-2xl text-candle-500 candle-text-glow">
          组件预览 / Debug
        </h1>
      </header>

      <div className="space-y-10">
        {/* RoleBadge */}
        <Section title="RoleBadge">
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((r) => (
              <RoleBadge key={r} role={r} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_ROLES.map((r) => (
              <RoleBadge key={r} role={r} variant="solid" withTeam />
            ))}
          </div>
        </Section>

        {/* Card */}
        <Section title="Card · 点击翻面">
          <div className="flex flex-wrap gap-4">
            {ALL_ROLES.map((r) => (
              <div key={r} className="flex flex-col items-center gap-2">
                <Card
                  role={r}
                  revealed={!!flipped[r]}
                  size="md"
                  onClick={() => toggleFlip(r)}
                />
                <span className="text-xs text-moon-100/40">
                  {ROLE_GLYPH[r]} · {r}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Card · 尺寸">
          <div className="flex flex-wrap items-end gap-4">
            <Card role="werewolf" revealed size="sm" label="sm" />
            <Card role="seer" revealed size="md" label="md" />
            <Card role="tanner" revealed size="lg" label="lg" />
            <Card role="werewolf" selected revealed label="selected" />
            <Card role="werewolf" disabled revealed label="disabled" />
          </div>
        </Section>

        {/* PlayerSeat */}
        <Section title="PlayerSeat · 状态">
          <div className="flex flex-wrap items-start gap-6">
            <PlayerSeat name="默认" />
            <PlayerSeat name="Host" isHost />
            <PlayerSeat name="本人" isYou />
            <PlayerSeat name="离线" isConnected={false} />
            <PlayerSeat name="行动中" isActive />
            <PlayerSeat name="出局" isEliminated />
            <PlayerSeat name="选中" selected onClick={() => {}} />
            <PlayerSeat name="带角色" isHost footer={<RoleBadge role="werewolf" size="sm" />} />
          </div>
        </Section>

        {/* PlayerTable */}
        <Section title="PlayerTable · 环形布局">
          <div className="flex flex-wrap items-start gap-8">
            <div>
              <p className="mb-2 text-xs text-moon-100/40">3 人（小桌）</p>
              <PlayerTable
                players={MOCK_PLAYERS.slice(0, 3)}
                diameter={280}
                seatSize="sm"
                onPlayerClick={(id) => setSelectedPlayer(id)}
                selectedPlayerIds={selectedPlayer ? [selectedPlayer] : []}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-moon-100/40">7 人</p>
              <PlayerTable
                players={MOCK_PLAYERS}
                diameter={380}
                center={
                  <div className="text-center text-moon-100/60">
                    <p className="font-display text-lg">桌面 3 张</p>
                    <p className="mt-2 flex gap-1 justify-center">
                      <Card size="sm" />
                      <Card size="sm" />
                      <Card size="sm" />
                    </p>
                  </div>
                }
              />
            </div>
          </div>
        </Section>

        {/* CountdownRing */}
        <Section title="CountdownRing">
          <div className="flex flex-wrap items-center gap-6">
            <CountdownRing
              endsAt={countdownEndsAt}
              totalSeconds={30}
              size={96}
            />
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={() => startCountdown(30)}>30s</Button>
              <Button size="sm" onClick={() => startCountdown(10)}>10s</Button>
              <Button size="sm" onClick={() => startCountdown(5)}>5s（脉冲）</Button>
            </div>
            <CountdownRing
              endsAt={endsInFew}
              totalSeconds={30}
              size={72}
            />
            <CountdownRing
              endsAt={endsInMinute}
              totalSeconds={60}
              size={120}
              strokeWidth={8}
            />
          </div>
        </Section>

        {/* CardSwap */}
        <Section title="CardSwap · 换牌动画">
          <CardSwapDemo />
        </Section>

        {/* Sleeping */}
        <Section title="PlayerSeat · 闭眼（isSleeping）">
          <SleepingDemo />
        </Section>

        {/* PhaseTransition */}
        <Section title="PhaseTransition">
          <div className="flex flex-wrap gap-2">
            {PHASES.map((phase) => (
              <Button
                key={phase}
                variant="outline"
                size="sm"
                onClick={() => {
                  setTransitionPhase(phase)
                  setTransitionNonce((n) => n + 1)
                }}
              >
                预览 {phase}
              </Button>
            ))}
          </div>
          <PhaseTransition
            key={transitionNonce}
            phase={transitionPhase}
            duration={900}
          />
        </Section>
      </div>
    </main>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="night-panel p-5">
      <h2 className="mb-4 font-display text-lg text-moon-100/80">{title}</h2>
      {children}
    </section>
  )
}

// ============================================================
// CardSwap demo
// ============================================================

function CardSwapDemo() {
  const [iter, setIter] = useState(0)
  const [reveal, setReveal] = useState(false)

  // 通过 key 重置动画
  const resetAnimation = () => {
    setReveal(false)
    setIter((i) => i + 1)
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={resetAnimation}>
          重播换牌
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setReveal((r) => !r)}
        >
          {reveal ? "翻回背面" : "翻看新牌（强盗）"}
        </Button>
      </div>
      <CardSwap
        key={iter}
        cards={[
          {
            id: "a",
            role: "robber",
            revealed: false,
            label: "你",
            from: { x: -120, y: 0 },
            to: { x: 120, y: 0 },
          },
          {
            id: "b",
            role: "werewolf",
            revealed: reveal,
            label: reveal ? "变为狼人" : "对方",
            from: { x: 120, y: 0 },
            to: { x: -120, y: 0 },
          },
        ]}
        width={320}
        height={180}
      />
      <p className="text-xs text-moon-100/40">
        强盗（左）与目标（右）交换身份。点击"翻看新牌"模拟强盗翻开换来的牌。
      </p>
    </div>
  )
}

// ============================================================
// Sleeping demo
// ============================================================

function SleepingDemo() {
  const [sleeping, setSleeping] = useState(true)

  return (
    <div className="flex items-start gap-10">
      <div className="flex flex-col items-center gap-4">
        <Button size="sm" onClick={() => setSleeping((s) => !s)}>
          {sleeping ? "睁眼" : "闭眼"}
        </Button>
        <PlayerSeat
          name="小明"
          size="lg"
          isSleeping={sleeping}
        />
      </div>
      <div className="flex items-center gap-6">
        <PlayerSeat name="闭眼中" isSleeping size="md" />
        <PlayerSeat name="行动中" isActive size="md" />
        <PlayerSeat name="睁眼普通" size="md" />
        <PlayerSeat name="出局" isEliminated size="md" />
      </div>
    </div>
  )
}
