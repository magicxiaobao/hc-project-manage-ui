import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";
import { GlobalSearchPage } from "@/components/pm/global-search-page";
import { parseGlobalSearch } from "@/lib/search/keyword";
export const Route = createFileRoute("/search")({
  validateSearch: parseGlobalSearch,
  component: SearchPage,
});
function SearchPage() {
  return (
    <AppShell>
      <GlobalSearchPage search={Route.useSearch()} />
    </AppShell>
  );
}
