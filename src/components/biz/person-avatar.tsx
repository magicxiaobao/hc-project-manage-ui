import { Avatar } from "@heroui/react";
import type { Person } from "@/lib/pm/domain";

export function PersonAvatar({ person, size = "sm" }: { person?: Person | null; size?: "sm" | "md" }) {
  const label = person ? person.name.slice(-2) : "—";
  return (
    <Avatar size={size} aria-label={person?.name ?? "未分配"}>
      <Avatar.Fallback>{label}</Avatar.Fallback>
    </Avatar>
  );
}
