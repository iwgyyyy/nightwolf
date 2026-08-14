import { useMemo, useState } from "react"
import { Link } from "react-router"
import { ChevronLeft, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GameScene } from "@/scene/GameScene"
import type { PlayerPublicInfo } from "@/types"

const MOCK_NAMES = [
  "你",
  "阿黎",
  "老猫",
  "Momo",
  "铁蛋",
  "小北",
  "Vince",
  "阿茶",
  "野格",
  "临安",
]

/** 3D 场景全屏调试页：/debug/scene */
export default function ScenePage() {
  const [count, setCount] = useState(6)

  const players = useMemo<PlayerPublicInfo[]>(
    () =>
      MOCK_NAMES.slice(0, count).map((name, i) => ({
        playerId: `p${i}`,
        name,
        // 留一个离线状态用于预览
        isConnected: !(i === 3 && count >= 5),
      })),
    [count],
  )

  return (
    <main className="fixed inset-0 overflow-hidden">
      <GameScene players={players} selfId="p0" hostId="p1" />

      {/* HUD 顶栏 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <Button asChild variant="ghost" size="sm" className="pointer-events-auto">
          <Link to="/debug">
            <ChevronLeft className="h-4 w-4" />
            返回
          </Link>
        </Button>
        <span className="font-display text-sm text-moon-100/60">
          3D 场景调试 · {count} 人桌
        </span>
      </header>

      {/* HUD 底栏：人数控制 */}
      <footer className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="icon"
          disabled={count <= 3}
          onClick={() => setCount((c) => c - 1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="font-display w-10 text-center text-lg text-moon-100/85">
          {count}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={count >= MOCK_NAMES.length}
          onClick={() => setCount((c) => c + 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </footer>
    </main>
  )
}
