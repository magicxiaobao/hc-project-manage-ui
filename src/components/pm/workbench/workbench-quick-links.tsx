import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import type { SearchProject } from "@/lib/query/hooks/useGlobalSearch";
export function WorkbenchQuickLinks({ projects }: { projects: SearchProject[] }) {
  const selectId = useId();
  const [projectId, setProjectId] = useState("");
  const project = projects.find((item) => String(item.id) === projectId);
  return (
    <section
      aria-labelledby="workbench-links"
      className="rounded border border-border bg-surface p-4"
    >
      <h2 id="workbench-links" className="type-section">
        快捷入口
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Link to="/worklogs" className="text-accent underline">
          登记工时
        </Link>
        <label htmlFor={selectId}>新建任务项目</label>
        <select
          id={selectId}
          className="rounded border border-border bg-surface p-2"
          value={project ? projectId : ""}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="">请选择项目</option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.projectName}（{item.projectKey}）
            </option>
          ))}
        </select>
        {project ? (
          <Link
            to="/p/$projectKey/issues/new"
            params={{ projectKey: project.projectKey }}
            className="text-accent underline"
          >
            新建任务
          </Link>
        ) : (
          <>
            <Button isDisabled aria-describedby={`${selectId}-hint`}>
              新建任务
            </Button>
            <span id={`${selectId}-hint`}>请选择项目</span>
          </>
        )}
        <Link to="/notifications" className="text-accent underline">
          我的通知
        </Link>
      </div>
    </section>
  );
}
