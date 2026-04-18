import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { KeyRound } from "lucide-react"
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { verifyAdmin } from "@/config/auth"
import { useAuthStore } from "@/stores/authStore"
import { useIsMobile } from "@/hooks/use-is-mobile"

const schema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
})

type FormValues = z.infer<typeof schema>

const DEFAULT_VALUES: FormValues = { username: "", password: "" }

interface AdminAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AdminAuthDialog({
  open,
  onOpenChange,
  onSuccess,
}: AdminAuthDialogProps) {
  const grantAdmin = useAuthStore((s) => s.grantAdmin)
  const isMobile = useIsMobile()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })

  const onSubmit = (values: FormValues) => {
    if (verifyAdmin(values.username, values.password)) {
      grantAdmin()
      toast.success("验证通过")
      form.reset()
      onOpenChange(false)
      onSuccess?.()
    } else {
      toast.error("用户名或密码错误")
      form.setError("password", { message: "凭证错误" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={isMobile ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-candle-500/10 text-candle-500">
            <KeyRound className="h-5 w-5" />
          </div>
          <DialogTitle className="font-display text-2xl">
            管理员验证
          </DialogTitle>
          <DialogDescription>
            创建房间需要管理员凭证，请输入账号密码
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-2">
          <FieldGroup>
            <Controller
              name="username"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="admin-username">用户名</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="admin-username"
                      autoComplete="username"
                      aria-invalid={fieldState.invalid}
                      placeholder="admin"
                    />
                  </FieldContent>
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="admin-password">密码</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="admin-password"
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                      placeholder="••••••"
                    />
                  </FieldContent>
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                form.reset()
                onOpenChange(false)
              }}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="candle-glow"
              disabled={form.formState.isSubmitting}
            >
              确认
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
