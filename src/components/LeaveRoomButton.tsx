import { useNavigate } from "react-router"
import { ChevronLeft, DoorOpen } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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

interface LeaveRoomButtonProps {
  roomId: string
  isHost: boolean
  /** 对局进行中：文案提示对局的后果 */
  inGame?: boolean
  /** labeled 带文字（大厅），icon 仅图标（对局中不抢视觉） */
  variant?: "labeled" | "icon"
}

/**
 * 退出房间（玩家）/ 解散房间（房主），带确认对话框。
 * 大厅与对局中共用；对局中任意阶段可用（服务端无阶段限制）。
 */
export function LeaveRoomButton({
  roomId,
  isHost,
  inGame,
  variant = "labeled",
}: LeaveRoomButtonProps) {
  const navigate = useNavigate()

  const handleLeave = () => {
    const sync = getSyncService()
    if (isHost) {
      sync.sendHostCommand(roomId, { kind: "deleteRoom" })
      toast("房间已解散")
    } else {
      sync.leaveRoom(roomId)
    }
    navigate("/")
  }

  const title = isHost ? "确定要解散房间？" : "确定要退出房间？"
  const description = isHost
    ? inGame
      ? "解散后本局立即结束，所有玩家都会被踢出，无法撤销。"
      : "解散后所有玩家会退出，操作无法撤销。"
    : inGame
      ? "退出后本局对你而言结束；其他人的对局会继续（你的操作将按超时处理）。"
      : "离开后可以凭房间号重新加入。"

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "labeled" ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-moon-100/70 hover:bg-night-700 hover:text-moon-100"
          >
            <ChevronLeft className="h-4 w-4" />
            {isHost ? "解散" : "退出"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="text-moon-100/50 hover:bg-night-700 hover:text-moon-100"
            aria-label={isHost ? "解散房间" : "退出房间"}
          >
            <DoorOpen className="h-4 w-4" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleLeave}>
            {isHost ? "解散" : "退出"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
