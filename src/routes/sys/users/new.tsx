import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserFormDialog } from "@/components/pm/user-form-dialog";

export const Route = createFileRoute("/sys/users/new")({
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  return (
    <UserFormDialog open userId={null} onClose={() => { void navigate({ to: "/sys/users" }); }} />
  );
}
