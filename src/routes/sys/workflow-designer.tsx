import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";
import { WorkflowDesignerPage } from "@/components/pm/workflow-designer/workflow-designer-page";
export const Route = createFileRoute("/sys/workflow-designer")({ component: Page });
function Page() {
  return (
    <AppShell>
      <WorkflowDesignerPage />
    </AppShell>
  );
}
