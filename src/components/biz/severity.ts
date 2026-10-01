export function severityLabel(severity: string) {
  const map: Record<string, string> = {
    BLOCKER: "阻塞",
    CRITICAL: "致命",
    MAJOR: "严重",
    NORMAL: "一般",
    MINOR: "轻微",
    TRIVIAL: "建议",
  };
  return map[severity] ?? severity;
}
