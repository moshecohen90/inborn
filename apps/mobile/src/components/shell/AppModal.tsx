import { useCallback } from "react";
import { Modal, type ModalProps, type NativeSyntheticEvent } from "react-native";
import { useEarlyEscape } from "../../lib/earlyEscape";

export type AppModalProps = ModalProps & { onRequestClose: () => void };

/** Every modal in the app goes through here (lint-enforced) so Esc closes it on the web from its first frame (F396, F401). */
export function AppModal(props: AppModalProps) {
  const { visible = true, onRequestClose, onShow } = props;
  const escapeShown = useEarlyEscape(visible, onRequestClose);
  const shown = useCallback(
    (e: NativeSyntheticEvent<unknown>) => {
      escapeShown();
      onShow?.(e);
    },
    [escapeShown, onShow],
  );
  return <Modal {...props} onShow={shown} />;
}
