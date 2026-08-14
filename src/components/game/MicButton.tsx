import { Mic, MicOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getVoiceService } from "@/services/VoiceService"
import { useVoiceUiStore } from "@/stores/voiceUiStore"

/**
 * 房间语音麦克风开关（右下角悬浮）。
 * 夜晚 locked 时禁用；权限被拒时点击给出指引。
 * z-30 压在夜晚眼睑幕（z-40）之下：闭眼时不可见，反正也开不了麦。
 */
export function MicButton() {
  const status = useVoiceUiStore((s) => s.status)
  const micOn = useVoiceUiStore((s) => s.micOn)
  const locked = useVoiceUiStore((s) => s.locked)

  if (status === "idle") return null
  const denied = status === "denied"
  const unsupported = status === "unsupported"
  const off = !micOn

  const handleClick = () => {
    if (unsupported) {
      toast.error("语音需要 HTTPS（或 localhost）访问才可用")
      return
    }
    if (locked) {
      toast.info("夜晚全员禁麦")
      return
    }
    if (denied) {
      // 在用户手势里重试：iOS Safari 只有这样才会弹出权限询问框
      void getVoiceService()
        .retryMic()
        .then((ok) => {
          if (!ok) toast.error("拿不到麦克风权限，请在浏览器设置里允许后重试")
        })
      return
    }
    getVoiceService().toggleMic()
  }

  return (
    <div
      className="fixed right-3 z-30"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.9rem)" }}
    >
      <Button
        size="icon"
        variant={off ? "outline" : "default"}
        onClick={handleClick}
        aria-label={micOn ? "关闭麦克风" : "开启麦克风"}
        className={cn(
          "h-12 w-12 rounded-full shadow-lg",
          micOn && "candle-glow",
          (denied || unsupported || locked) && "opacity-60",
        )}
      >
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </Button>
    </div>
  )
}
