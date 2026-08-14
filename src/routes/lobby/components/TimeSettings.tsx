import { Slider } from "@/components/ui/slider"
import type { RoomSettings } from "@/types"

interface TimeSettingsProps {
  settings: RoomSettings
  disabled?: boolean
  onChange: (patch: Partial<RoomSettings>) => void
}

/** 各字段的范围与步长 */
const FIELDS = {
  discussionTime: { min: 1, max: 15, step: 1, unit: "分钟" },
  actionTime: { min: 20, max: 120, step: 5, unit: "秒" },
  voteTime: { min: 10, max: 120, step: 5, unit: "秒" },
} as const

export function TimeSettings({
  settings,
  disabled,
  onChange,
}: TimeSettingsProps) {
  return (
    <div className="space-y-5">
      <SliderRow
        label="讨论时间"
        value={settings.discussionTime}
        unit="分钟"
        field={FIELDS.discussionTime}
        disabled={disabled}
        onChange={(v) => onChange({ discussionTime: v })}
      />
      <SliderRow
        label="夜晚操作"
        value={settings.actionTime}
        unit="秒"
        field={FIELDS.actionTime}
        disabled={disabled}
        onChange={(v) => onChange({ actionTime: v })}
      />
      <SliderRow
        label="投票时间"
        value={settings.voteTime}
        unit="秒"
        field={FIELDS.voteTime}
        disabled={disabled}
        onChange={(v) => onChange({ voteTime: v })}
      />
    </div>
  )
}

interface SliderRowProps {
  label: string
  value: number
  unit: string
  field: { min: number; max: number; step: number }
  disabled?: boolean
  onChange: (v: number) => void
}

function SliderRow({
  label,
  value,
  unit,
  field,
  disabled,
  onChange,
}: SliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-moon-100/70">{label}</span>
        <span className="font-mono tabular-nums text-candle-500">
          {value}
          <span className="ml-1 text-xs text-moon-100/40">{unit}</span>
        </span>
      </div>
      <Slider
        min={field.min}
        max={field.max}
        step={field.step}
        value={[value]}
        disabled={disabled}
        onValueChange={(vals) => onChange(vals[0])}
      />
    </div>
  )
}
