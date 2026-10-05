import { Modal } from "@heroui/react";
import { useRef, type ReactNode } from "react";

export function AppModal({
  open,
  title,
  onClose,
  children,
  size = "lg",
  label,
  dialogClassName,
  bodyClassName,
  isDismissDisabled = false,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "cover";
  label?: string;
  dialogClassName?: string;
  bodyClassName?: string;
  isDismissDisabled?: boolean;
}) {
  const outsideClickCount = useRef(0);
  if (!open) return null;
  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next && !isDismissDisabled) onClose();
      }}
    >
      <Modal.Backdrop
        isDismissable={!isDismissDisabled}
        isKeyboardDismissDisabled={isDismissDisabled}
        variant="opaque"
        // A trigger's second click can land on the newly mounted backdrop.
        onMouseDownCapture={(event) => {
          outsideClickCount.current = event.detail;
        }}
        onPointerDownCapture={(event) => {
          if (event.pointerType !== "mouse") outsideClickCount.current = 0;
        }}
        shouldCloseOnInteractOutside={() => outsideClickCount.current <= 1}
      >
        <Modal.Container placement="center" size={size} scroll="inside">
          <Modal.Dialog
            aria-label={label ?? (typeof title === "string" ? title : undefined)}
            className={dialogClassName}
          >
            <Modal.Header>
              <Modal.Heading className="flex flex-wrap items-center gap-2 pr-10">
                {title}
              </Modal.Heading>
              <Modal.CloseTrigger aria-label="关闭" isDisabled={isDismissDisabled} />
            </Modal.Header>
            <Modal.Body className={bodyClassName}>{children}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
