/**
 * 登录后跳转目标解析（r6 P1 修复 run159-codex-pi-P5-r6-1 的配套）：
 * 路由守卫把被拦截的原目标地址放进 /login 的 `redirect` 查询参数，
 * 登录成功后按此跳回，避免深链刷新丢失目标。
 *
 * 只接受站内相对路径（以 "/" 开头且非 "//"）：外部 URL 与畸形值直接
 * 丢弃，防范 open redirect（登录页是经典的跳转参数攻击面）。
 */
const unsafeCharacters = (value: string) =>
  /[\\\s]/.test(value) ||
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export function resolvePostLoginTarget(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafeCharacters(value)
  )
    return undefined;
  try {
    const decoded = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (
      decoded.startsWith("//") ||
      unsafeCharacters(decoded) ||
      /%(?:2f|5c)/i.test(value) ||
      decoded.split("/").some((part) => part === "." || part === "..")
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}
