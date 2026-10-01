import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const SHOW_AFTER = 80;

export function RouteProgress() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");

  useEffect(() => {
    let shown = false;
    let showTimer = 0;
    let hideTimer = 0;
    const start = () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(showTimer);
      if (shown) {
        setPhase("run");
        return;
      }
      showTimer = window.setTimeout(() => {
        shown = true;
        setPhase("run");
      }, SHOW_AFTER);
    };
    const finish = () => {
      window.clearTimeout(showTimer);
      if (!shown) return;
      setPhase("done");
      hideTimer = window.setTimeout(() => {
        shown = false;
        setPhase("idle");
      }, 220);
    };
    const stopStart = router.subscribe("onBeforeNavigate", (event) => {
      if (event.pathChanged) start();
    });
    const stopFinish = router.subscribe("onRendered", finish);
    return () => {
      stopStart();
      stopFinish();
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [router]);

  if (phase === "idle") return null;
  return <div className="route-progress" data-state={phase} role="progressbar" aria-valuetext="正在打开页面" />;
}
