import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { copyToClipboard } from "@/lib/clipboard"

interface ShareLinkButtonProps {
  roomId: string
  className?: string
}

/**
 * 复制邀请链接到剪贴板。
 */
export function ShareLinkButton({ roomId, className }: ShareLinkButtonProps) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/room/${roomId}`

  const handleCopy = async () => {
    if (copied) return
    const ok = await copyToClipboard(url)
    if (ok) {
      setCopied(true)
      toast.success("邀请链接已复制")
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error("复制失败，请手动复制链接")
    }
  }

  return (
    <Button
      type="button"
      onClick={handleCopy}
      disabled={copied}
      className={cn(
        "group gap-2 bg-candle-500 text-ink-900 hover:bg-candle-400 disabled:opacity-100",
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          <span>复制邀请链接</span>
        </>
      )}
    </Button>
  )
}
