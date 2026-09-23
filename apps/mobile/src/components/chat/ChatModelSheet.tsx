import { useMemo } from "react";
import { Platform } from "react-native";
import { ENGINE_VERSION, modelChoices, paywallFor, type CatalogModel, type LicenceTier, type UseCase } from "@inborn/core";
import type { Theme } from "@inborn/ui";
import { ModelSheet } from "./ModelSheet";
import { useAppServices } from "../../services/AppServices";
import { useVault } from "../../vault";
import { resetEngine } from "../../engine";

export interface ChatModelSheetProps {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
  /** The model the engine has loaded. */
  currentId: string;
  /** What this chat is doing and in which language; the recommendation line is computed from both (§7.8). */
  use: UseCase;
  languageCode: string | null;
  tier: LicenceTier;
  onSwitchModel?: (id: string) => void;
  onOpenVault?: () => void;
  onOpenPaywall?: () => void;
  onChatSettings: () => void;
}

/** The vault half of the chat's Model sheet: what is installed, what can be downloaded here, and the download itself. */
export function ChatModelSheet({ visible, onClose, theme, currentId, use, languageCode, tier, onSwitchModel, onOpenVault, onOpenPaywall, onChatSettings }: ChatModelSheetProps) {
  const { vault, entries, version } = useVault();
  const { prefs, updatePrefs } = useAppServices();
  /* The browser tier holds one model in its own storage (§14.3): the vault knows nothing about it, so the loaded id is the installed list. */
  const managed = Platform.OS === "web";
  const choices = useMemo(() => {
    const installed = managed ? [currentId] : entries.filter((e) => e.model.role === "chat" && !e.stray && e.state.kind === "ready").map((e) => e.model.id);
    return modelChoices({ use, languageCode, device: vault.device, installed, catalog: vault.manifest.models, currentId, engineVersion: ENGINE_VERSION, ...(managed ? { recommendAmong: installed } : {}) });
    /* `version` stands in for `entries`, which is a fresh array on every render of the vault hook. */
  }, [vault, entries, version, use, languageCode, currentId, managed]);

  const locked = (model: CatalogModel) => !!paywallFor(tier, { kind: "model", proOnly: !!model.proOnly });
  const originOf = (id: string) => {
    if (managed) return null;
    const entry = entries.find((e) => e.model.id === id);
    return entry?.plan ? (entry.plan.host ?? entry.plan.origin) : null;
  };

  return (
    <ModelSheet
      visible={visible}
      onClose={onClose}
      choices={choices}
      recommendedFor={{ use, languageCode }}
      theme={theme}
      deviceRamGB={vault.device.ramGB}
      managed={managed}
      stateOf={(id) => vault.state(id)}
      originOf={originOf}
      wifiOnly={prefs.wifiOnly}
      onWifiOnly={(wifiOnly) => updatePrefs({ wifiOnly })}
      lockedFor={locked}
      onSwitch={(id) => {
        onClose();
        if (onSwitchModel) return onSwitchModel(id);
        vault.setDefault(id);
        void resetEngine();
      }}
      onDownload={(id) => void vault.install(id)}
      onUnlock={() => {
        onClose();
        onOpenPaywall?.();
      }}
      onManage={() => {
        onClose();
        onOpenVault?.();
      }}
      onChatSettings={() => {
        onClose();
        onChatSettings();
      }}
    />
  );
}
