/**
 * 夜晚动画事件总线。
 *
 * 目的：actor 在提交 submission 前触发一个本地事件，NightTable 监听后播放
 * CardSwap 等动画。只在 actor 自己的客户端工作，不跨网络广播（其他玩家在
 * 夜晚阶段是闭眼的，不应该看到动画）。
 *
 * 用 `EventTarget` 而非 Zustand：动画事件是**瞬态**的（触发即忘），不需要
 * 持久化状态，React state 也不需要存副本。
 */

export interface NightSwapEvent {
  /** 起始位置玩家 id（或 "center_N" 表示桌面牌） */
  fromId: string
  /** 结束位置玩家 id（或 "center_N"） */
  toId: string
  /** 动画语义：强盗 / 捣蛋鬼 / 酒鬼 */
  kind: "robber" | "troublemaker" | "drunk"
}

type EventMap = {
  swap: NightSwapEvent
}

const target = new EventTarget()

export function emitNightEvent<K extends keyof EventMap>(
  type: K,
  detail: EventMap[K],
): void {
  target.dispatchEvent(new CustomEvent(type, { detail }))
}

export function onNightEvent<K extends keyof EventMap>(
  type: K,
  handler: (detail: EventMap[K]) => void,
): () => void {
  const wrapped = (ev: Event) => {
    handler((ev as CustomEvent<EventMap[K]>).detail)
  }
  target.addEventListener(type, wrapped)
  return () => target.removeEventListener(type, wrapped)
}
