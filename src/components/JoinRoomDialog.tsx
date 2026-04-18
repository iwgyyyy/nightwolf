import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { DoorOpen } from "lucide-react"
import { useNavigate } from "react-router"
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
import { isValidRoomId } from "@/services/roomId"
import { useIsMobile } from "@/hooks/use-is-mobile"

const schema = z.object({
  code: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine(isValidRoomId, "房间号需为 6 位字母/数字"),
})

type FormValues = z.infer<typeof schema>

const DEFAULTS: FormValues = { code: "" }

interface JoinRoomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function JoinRoomDialog({ open, onOpenChange }: JoinRoomDialogProps) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  const onSubmit = (values: FormValues) => {
    onOpenChange(false)
    form.reset()
    navigate(`/room/${values.code}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={isMobile ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-candle-500/10 text-candle-500">
            <DoorOpen className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">加入房间</DialogTitle>
          <DialogDescription>输入好友发给你的房间号</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-2">
          <Controller
            name="code"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="room-code">房间号</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="room-code"
                    autoFocus={!isMobile}
                    maxLength={6}
                    placeholder="ABCDEF"
                    className="font-mono text-center text-xl tracking-[0.3em] uppercase"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
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
              进入
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
