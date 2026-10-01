import { Modal } from "@heroui/react";
import type { ReactNode } from "react";

export function AppModal({
  open,
  title,
  onClose,
  children,
  size = "lg",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "cover";
}) {
  if (!open) return null;
  return (
    <Modal isOpen={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Backdrop isDismissable variant="opaque">
        <Modal.Container placement="center" size={size} scroll="inside">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
