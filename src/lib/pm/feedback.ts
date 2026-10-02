import { toast } from "sonner";
import { usePm } from "./store";
import { changeFeedback } from "./persistence";

export function notifyPmChange(message: string) {
  const error = usePm.getState().persistenceError;
  const feedback = changeFeedback(message, error);
  if (error) toast.error(feedback);
  else toast.success(feedback);
}
