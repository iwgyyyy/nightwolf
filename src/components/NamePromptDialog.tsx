import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { UserCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { useLocalPlayerStore } from "@/hooks/use-local-player"
import { useIsMobile } from "@/hooks/use-is-mobile"

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请输入昵称")
    .max(12, "昵称不能超过 12 字"),
})

type FormValues = z.infer<typeof schema>

interface NamePromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  onConfirm?: (name: string) => void
  /** 禁止用户通过 ESC/点击遮罩关闭 */
  mandatory?: boolean
}

export function NamePromptDialog({
  open,
  onOpenChange,
  title = "取个昵称",
  description = "其他玩家将在房间里看到这个名字",
  onConfirm,
  mandatory = false,
}: NamePromptDialogProps) {
  const currentName = useLocalPlayerStore((s) => s.name)
  const setName = useLocalPlayerStore((s) => s.setName)
  const isMobile = useIsMobile()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: currentName },
  })

  const onSubmit = (values: FormValues) => {
    setName(values.name)
    onOpenChange(false)
    onConfirm?.(values.name)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mandatory && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={!mandatory}
        onOpenAutoFocus={isMobile ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-candle-500/10 text-candle-500">
            <UserCircle className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-2">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="player-name">昵称</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="player-name"
                    autoComplete="nickname"
                    autoFocus={!isMobile}
                    maxLength={12}
                    placeholder="月下漫步"
                    aria-invalid={fieldState.invalid}
                  />
                </FieldContent>
                {fieldState.error && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <DialogFooter className="mt-6">
            <Button type="submit" className="candle-glow w-full">
              确认
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
