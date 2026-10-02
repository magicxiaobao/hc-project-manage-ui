import { Button, Chip } from "@heroui/react";
import type { Person, Project } from "@/lib/pm/domain";

export function ProjectCard({
  project,
  lead,
  openCount,
  total,
  onOpen,
}: {
  project: Project;
  lead?: Person;
  openCount: number;
  total: number;
  onOpen: () => void;
}) {
  return (
    <Button variant="outline" className="h-auto min-w-0 w-full whitespace-normal rounded-sm items-start justify-start px-4 py-4 text-left" onPress={onOpen}>
      <span className="flex min-w-0 w-full flex-col items-start gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip size="sm" color="accent" variant="soft">
            <Chip.Label>{project.key}</Chip.Label>
          </Chip>
          <span className="type-section">{project.name}</span>
        </span>
        <span className="type-meta">{project.summary}</span>
        <span className="type-meta">
          项目负责人 {lead?.name} · {openCount} 项未完成 · 共 {total} 项
        </span>
      </span>
    </Button>
  );
}
