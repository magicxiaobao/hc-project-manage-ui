import { Link } from "@tanstack/react-router";
import { Bell, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { Person } from "@/lib/pm/domain";
import { PersonAvatar } from "@/components/biz/person-avatar";

export function AppRail({
  unread,
  me,
  onSearch,
  onCreate,
  onNotices,
}: {
  unread: number;
  me?: Person;
  onSearch: () => void;
  onCreate: () => void;
  onNotices: () => void;
}) {
  return (
    <nav className="z-30 flex w-16 shrink-0 flex-col items-center bg-nav py-3 text-on-nav" aria-label="应用">
      <Link to="/" className="type-section mb-5 flex size-9 items-center justify-center rounded-sm bg-on-nav/15" title="恒川">
        恒
      </Link>
      <RailButton label="搜索事项" onClick={onSearch}>
        <Search className="size-5" />
      </RailButton>
      <RailButton label="创建事项" onClick={onCreate}>
        <Plus className="size-6" />
      </RailButton>
      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton label="通知" onClick={onNotices}>
          <span className="relative">
            <Bell className="size-5" />
            {unread > 0 ? <span className="absolute -top-1 -right-1 size-2 rounded-full bg-danger" /> : null}
          </span>
        </RailButton>
        <Link to="/me" title={me?.name ?? "个人资料"} aria-label="个人资料" className="rounded-full p-0.5 hover:bg-on-nav/10">
          <PersonAvatar person={me} size="md" />
        </Link>
      </div>
    </nav>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} className="mb-1 flex size-10 items-center justify-center rounded-sm text-on-nav/90 hover:bg-on-nav/10" onClick={onClick}>
      {children}
    </button>
  );
}
