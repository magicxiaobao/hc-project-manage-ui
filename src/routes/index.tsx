import { createFileRoute } from "@tanstack/react-router";
// Root beforeLoad resolves the authorized landing before any page renders.
export const Route = createFileRoute("/")({ component: () => null });
