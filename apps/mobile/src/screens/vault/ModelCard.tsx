import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { expectedSpeed, formatModelBytes, ramFit, type CatalogModel, type InstallState } from "@inborn/core";
import type { DeliveryPlan } from "../../vault";
import type { DeviceInfo } from "../../vault";
import { useType } from "../../services/type";
import { deviceNoun } from "../../lib/deviceNoun";

export interface ModelCardProps {
  model: CatalogModel;
  state: InstallState;
  plan: DeliveryPlan | null;
  device: DeviceInfo;
  theme: Theme;
  recommended: boolean;
  active: boolean;
  /** Greyed row in the "Too big" group; no actions. */
  disabledReason?: "ram" | "engine";
  onInstall: () => void;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onUse: () => void;
  onDetails: () => void;
  /** A stray file (QA B17): size + Remove only, never Use. */
  stray?: boolean;
  onRemove?: () => void;
}

const deviceWord = (t: (k: string) => string, d: DeviceInfo) => t(`vault.device.${d.deviceClass}`);

/** One cartridge (spec §8.4 S30): plain-language name, "why it is good", battery tag, expected speed, state and actions. */
export function ModelCard({ model, state, plan, device, theme, recommended, active, disabledReason, onInstall, onCancel, onPause, onResume, onUse, onDetails, stray, onRemove }: ModelCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const speed = expectedSpeed(device.chip, model.tier);
  const fit = ramFit(model, device.ramGB);
  const dot = state.kind === "ready" ? (active ? "●" : "◉") : state.kind === "quarantined" || state.kind === "corrupt" ? "⊗" : "○";
  const dotColor = state.kind === "ready" ? (active ? theme.sealed : theme.text) : state.kind === "corrupt" || state.kind === "quarantined" ? theme.danger : theme.text3;
  const disabled = !!disabledReason;
  const imported = model.id.startsWith("import:");
  const tierLabel = (model.tier ?? (imported ? t("vault.imported") : model.role)).toUpperCase();

  const statusLine = (): { text: string; danger?: boolean } | null => {
    switch (state.kind) {
      case "delivering":
        if (state.needsConfirmation) return { text: t("vault.state.needsConfirmation") };
        if (state.waitingForWifi) return { text: t("vault.state.waitingWifi") };
        return { text: t(state.paused ? "vault.state.paused" : "vault.state.delivering", { percent: Math.floor((100 * state.bytes) / Math.max(1, state.total || model.bytes)), done: formatModelBytes(state.bytes), total: formatModelBytes(state.total || model.bytes) }) };
      case "verifying":
        return { text: t("vault.state.verifying") };
      case "needs-space":
        return { text: t("vault.state.needsSpace", { size: formatModelBytes(state.requiredBytes - state.freeBytes) }), danger: true };
      case "corrupt":
        return { text: t(state.reason === "hash-mismatch" ? "vault.state.corruptHash" : "vault.state.corrupt"), danger: true };
      case "quarantined":
        return { text: t("vault.state.quarantined"), danger: true };
      case "failed":
        return { text: t(state.error === "no-delivery" ? (device.os === "android" ? "vault.state.noDelivery.android" : "vault.state.noDelivery.web") : "vault.state.failed", { error: state.error }), danger: true };
      case "ready":
        return { text: state.via === "bundled" ? t("vault.state.bundled") : active ? t("vault.loaded") : t("vault.installed") };
      default:
        return null;
    }
  };
  const status = statusLine();
  const progress = state.kind === "delivering" ? state.bytes / Math.max(1, state.total || model.bytes) : state.kind === "ready" || state.kind === "verifying" ? 1 : 0;

  if (stray)
    return (
      <View testID={`model-card-${model.id}`} style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
        <View style={styles.head}>
          <Text style={[styles.dot, { color: theme.text3 }]}>○</Text>
          <Text style={[type.monoLabel, styles.tier, { color: theme.text }]}>{t("vault.stray.label")}</Text>
          <Text numberOfLines={1} style={[type.bodySmall, styles.name, { color: theme.text2 }]}>
            · {model.name}
          </Text>
        </View>
        <Text style={[type.mono, { color: theme.text3 }]}>{formatModelBytes(model.bytes)}</Text>
        <Text testID={`model-status-${model.id}`} style={[type.mono, { color: theme.text2 }]}>
          {t("vault.stray.status")}
        </Text>
        <View style={styles.actions}>
          <Action testID={`remove-${model.id}`} theme={theme} onPress={onRemove ?? (() => undefined)} label={t("vault.remove")} />
        </View>
      </View>
    );

  return (
    <View testID={`model-card-${model.id}`} style={[styles.card, { backgroundColor: theme.surface1, borderColor: active ? theme.sealed : theme.border, opacity: disabled ? 0.45 : 1 }]}>
      <View style={styles.head}>
        <Text style={[styles.dot, { color: dotColor }]}>{dot}</Text>
        <Text style={[type.monoLabel, styles.tier, { color: theme.text }]}>{tierLabel}</Text>
        <Text numberOfLines={1} style={[type.bodySmall, styles.name, { color: theme.text2 }]}>
          · {imported ? model.name : `${model.family} ${model.params}`}
        </Text>
        {model.proOnly ? <Text style={[type.monoLabel, styles.chip, { color: theme.accent, borderColor: theme.accent }]}>{t("vault.pro")}</Text> : null}
      </View>
      {recommended && !disabled ? <Text style={[type.mono, { color: theme.sealed }]}>{t("models.recommended", { device: deviceNoun() })}</Text> : null}
      {model.goodFor ? (
        <Text style={[type.bodySmall, { color: theme.text }]}>{model.goodFor}</Text>
      ) : null}
      <Text style={[type.mono, { color: theme.text3 }]}>
        {t("vault.spec", { size: formatModelBytes(model.bytes), quant: model.quant })} · {t("models.battery", { level: t(`vault.battery.${model.battery}`) })}
      </Text>
      <Text style={[type.mono, { color: theme.text3 }]}>
        {disabledReason === "engine"
          ? t("vault.state.updateApp")
          : disabledReason === "ram" || fit === "no"
            ? t("vault.willNotRun", { ram: device.ramGB })
            : speed
              ? t("vault.speed", { min: speed[0], max: speed[1], device: deviceWord(t, device) })
              : t("vault.speedUnknown", { device: deviceWord(t, device) })}
        {!disabled && fit === "slowly" ? ` · ${t("vault.runsSlowly", { ram: device.ramGB })}` : ""}
      </Text>
      {progress > 0 ? (
        <View style={[styles.bar, { backgroundColor: theme.well }]}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: state.kind === "ready" ? theme.sealed : theme.accent }]} />
        </View>
      ) : null}
      {status ? (
        <Text testID={`model-status-${model.id}`} style={[type.mono, { color: status.danger ? theme.danger : theme.text2 }]}>
          {status.text}
        </Text>
      ) : null}
      {disabled ? null : (
        <View style={styles.actions}>
          {state.kind === "not-installed" || state.kind === "needs-space" || state.kind === "corrupt" || state.kind === "failed" ? (
            plan ? (
              <Action testID={`install-${model.id}`} theme={theme} primary onPress={onInstall} label={state.kind === "not-installed" ? t("vault.installFrom", { size: formatModelBytes(model.bytes), origin: plan.origin }) : t("vault.retry")} />
            ) : null
          ) : null}
          {state.kind === "delivering" && state.paused ? <Action testID={`resume-${model.id}`} theme={theme} primary onPress={onResume} label={t("vault.resume")} /> : null}
          {state.kind === "delivering" && !state.paused && plan?.via === "https" ? <Action testID={`pause-${model.id}`} theme={theme} onPress={onPause} label={t("vault.pause")} /> : null}
          {state.kind === "delivering" || state.kind === "verifying" ? <Action testID={`cancel-${model.id}`} theme={theme} onPress={onCancel} label={t("vault.cancel")} /> : null}
          {state.kind === "ready" && !active ? <Action testID={`use-${model.id}`} theme={theme} primary onPress={onUse} label={t("vault.use")} /> : null}
          {state.kind === "ready" && active ? <Text style={[type.mono, styles.inUse, { color: theme.sealed }]}>{t("vault.inUse")}</Text> : null}
          <Action testID={`details-${model.id}`} theme={theme} onPress={onDetails} label={t("vault.details")} />
        </View>
      )}
    </View>
  );
}

function Action({ label, onPress, theme, primary, testID }: { label: string; onPress: () => void; theme: Theme; primary?: boolean; testID: string }) {
  const type = useType();
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={[styles.btn, primary ? { backgroundColor: theme.ctaFill } : { borderWidth: 1, borderColor: theme.border }]}>
      <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: primary ? theme.ctaText : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 6, marginBottom: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { fontSize: 14, width: 16 },
  tier: { letterSpacing: 1 },
  name: { flex: 1 },
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  bar: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 2 },
  fill: { height: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, alignItems: "center" },
  btn: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  inUse: { paddingHorizontal: 4 },
});
