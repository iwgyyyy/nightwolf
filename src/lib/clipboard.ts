/**
 * 将文本复制到剪贴板。
 *
 * 优先使用 `navigator.clipboard`（需要 HTTPS 或 localhost）；
 * 失败时回退到 `document.execCommand('copy')` 兜底方案。
 *
 * @returns 是否复制成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限被拒或其他原因，走兜底
    }
  }

  // 兜底方案：临时 textarea + execCommand
  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    textarea.style.opacity = "0"
    textarea.setAttribute("readonly", "")
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
