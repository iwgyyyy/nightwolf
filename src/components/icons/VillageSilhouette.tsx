import type { SVGProps } from "react"

/**
 * 远处的村落剪影，用作 PC 版页面底部装饰。
 * 风格：扁平低多边形，类似剪纸木刻。
 */
export function VillageSilhouette(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      {/* 山脉远景 */}
      <path
        opacity="0.35"
        d="M0 160 L80 120 L160 145 L240 100 L320 135 L400 95 L480 130 L560 105 L640 140 L720 110 L800 135 L880 100 L960 125 L1040 115 L1120 130 L1200 115 L1200 200 L0 200 Z"
      />
      {/* 屋顶 */}
      <path
        opacity="0.7"
        d="M0 175 L40 155 L80 170 L120 145 L160 165 L180 155 L220 165 L260 150 L320 165 L340 155 L380 170 L420 155 L460 170 L520 160 L560 170 L600 155 L640 170 L680 150 L740 165 L780 155 L820 170 L880 160 L920 170 L960 155 L1020 170 L1060 160 L1120 170 L1180 160 L1200 170 L1200 200 L0 200 Z"
      />
      {/* 窗户点缀（暖光） */}
      <g fill="currentColor" opacity="0.9">
        <rect x="105" y="170" width="3" height="4" />
        <rect x="245" y="170" width="3" height="4" />
        <rect x="413" y="172" width="3" height="4" />
        <rect x="555" y="170" width="3" height="4" />
        <rect x="680" y="168" width="3" height="4" />
        <rect x="790" y="172" width="3" height="4" />
        <rect x="915" y="170" width="3" height="4" />
        <rect x="1060" y="172" width="3" height="4" />
      </g>
    </svg>
  )
}
