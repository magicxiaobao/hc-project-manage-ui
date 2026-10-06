import { createFileRoute } from "@tanstack/react-router";
import { DictionaryListLive } from "@/components/pm/dictionary-list-live";
export const Route = createFileRoute("/sys/dictionaries/")({ component: DictionaryListLive });
