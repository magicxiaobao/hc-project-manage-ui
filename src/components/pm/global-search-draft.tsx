import { createContext, useContext, useState, type ReactNode } from "react";
const Context = createContext({ waiting: false, setWaiting: (_value: boolean) => {} });
export function GlobalSearchDraftProvider({ children }: { children: ReactNode }) {
  const [waiting, setWaiting] = useState(false);
  return <Context.Provider value={{ waiting, setWaiting }}>{children}</Context.Provider>;
}
export const useGlobalSearchDraft = () => useContext(Context);
