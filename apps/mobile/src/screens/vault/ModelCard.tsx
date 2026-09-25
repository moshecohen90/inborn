import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { LANGUAGE_NAME_BY_CODE, downloadPercent, expectedSpeed, formatModelBytes, isHfModelId, ramFit, tooSlowHere, type CatalogModel, type InstallState, type UseCase } from "@inborn/core";
import { FitMap } from "./FitMap";
import type { DeliveryPlan } from "../../vault";
import type { DeviceInfo } from "../../vault";
import { useType } from "../../services/type";
import { deviceNoun } from "../../lib/deviceNoun";
import { modelCopy, modelLabel, modelName } from "../../lib/models";
import { installFailureText } from "../../vault/failureText";
import { includedWithApp } from "../../vault/included";
import { justResumed, keepOpenNote } from "../../vault/keepOpen";

export interface ModelCardProps {
  model: CatalogModel;
  state: InstallState;
  plan: DeliveryPlan | null;
  device: DeviceInfo;
  theme: Theme;
  recommended: boolean;
  /** Why the RECOMMENDED tag sits here (§7.8): the use and language it was chosen for. */
  /** `weak`: even this top pick is basic/none or weak for the pair; the tag then says so and names this card as the closest. */
  recommendedFor?: { use: UseCase; languageCode: string; weak?: boolean };
  active: boolean;
  /** The card an "install X" entry point opened the vault for. */
  highlighted?: boolean;
  /** Greyed row in the "Too big" group; no actions. */
  disabledReason?: "ram" | "engine";
  /** The PRO chip is a price tag, so it shows only while the current tier cannot install the model (QA F6). */
  lockedForTier?: boolean;
  onInstall: () => void;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onUse: () => void;
  onDetails: () => void;
  /** A stray file (QA B17): size + Remove only, never Use. */
  stray?: boolean;
  onRemove?: () => void;
  /** No store path on this platform for this file (§6.3: Android is Play or import): say so and offer the picker. */
  importOnly?: boolean;
  onImport?: () => void;
}

/** One cartridge (spec §8.4 S30): plain-language name, "why it is good", battery tag, expected speed, state and actions. */
export function ModelCard({ model, state, plan, device, theme, recommended, recommendedFor, active, highlighted, disabledReason, lockedForTier, onInstall, onCancel, onPause, onResume, onUse, onDetails, stray, onRemove, importOnly, onImport }: ModelCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const copy = modelCopy(t, model, { photos: Platform.OS !== "web" });
  const speed = expectedSpeed(device.chip, model.tier);
  /* Installable, but the measured rate on this chip class is not worth waiting for: the card says so beside the number (QA F37). */
  const tooSlow = tooSlowHere(device.chip, model.tier);
  const fit = ramFit(model, device.ramGB);
  const dot = state.kind === "ready" ? (active ? "●" : "◉") : state.kind === "quarantined" || state.kind === "corrupt" ? "⊗" : "○";
  const dotColor = state.kind === "ready" ? (active ? theme.text : theme.text2) : state.kind === "corrupt" || state.kind === "quarantined" ? theme.danger : theme.text3;
  const disabled = !!disabledReason;
  const included = includedWithApp(model, state);
  const imported = model.id.startsWith("import:");
  const hf = isHfModelId(model.id);
  /* A companion (photos, voice, documents) is part of the app, not a model to chat with: its own name, no "Use". */
  const companion = model.role !== "chat";
  const tierLabel = (companion ? modelName(t, model) : (model.tier ?? (imported ? t("vault.imported") : hf ? t("vault.hf.label") : model.role))).toUpperCase();
  const technical = `${model.family} ${model.params}`;

  const statusLine = (): { text: string; danger?: boolean } | null => {
    switch (state.kind) {
      case "delivering":
        if (state.needsConfirmation) return { text: t("vault.state.needsConfirmation") };
        if (state.waitingForWifi) return { text: t("vault.state.waitingWifi") };
        return { text: t(state.paused ? "vault.state.paused" : justResumed(state, Date.now()) ? "vault.state.resumed" : "vault.state.delivering", { percent: downloadPercent(state.bytes, state.total || model.bytes), done: formatModelBytes(state.bytes), total: formatModelBytes(state.total || model.bytes) }) };
      case "verifying":
        return { text: t("vault.state.verifying") };
      case "needs-space":
        return { text: t("vault.state.needsSpace", { size: formatModelBytes(state.requiredBytes - state.freeBytes) }), danger: true };
      case "corrupt":
        return { text: t(state.reason === "hash-mismatch" ? "vault.state.corruptHash" : "vault.state.corrupt"), danger: true };
      case "quarantined":
        return { text: t("vault.state.quarantined"), danger: true };
      case "failed":
        return { text: installFailureText(t, state.error, device.os), danger: true };
      case "ready":
        return { text: included ? t("vault.state.bundled") : active ? t("vault.loaded") : t("vault.installed") };
      case "not-installed":
        if (plan) return null;
        if (importOnly) return { text: t("vault.state.importOnly.android") };
        return device.os === "android" ? { text: t("vault.state.noDelivery.android") } : null;
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
    <View testID={`model-card-${model.id}`} accessibilityState={{ selected: !!highlighted }} style={[styles.card, { backgroundColor: theme.surface1, borderColor: highlighted ? theme.accent : active ? theme.text : theme.border, borderWidth: highlighted ? 2 : 1, opacity: disabled ? 0.45 : 1 }]}>
      <View style={styles.head}>
        <Text style={[styles.dot, { color: dotColor }]}>{dot}</Text>
        <Text style={[type.monoLabel, styles.tier, { color: theme.text }]}>{tierLabel}</Text>
        {companion ? <View style={styles.name} /> : (
          <Text numberOfLines={1} style={[type.bodySmall, styles.name, { color: theme.text2 }]}>
            · {imported ? model.name : hf ? `${model.name} · ${model.family}` : technical}
          </Text>
        )}
        {model.proOnly && lockedForTier ? <Text style={[type.monoLabel, styles.chip, { color: theme.accent, borderColor: theme.accent }]}>{t("vault.pro")}</Text> : null}
      </View>
      {recommended && !disabled ? (
        <Text testID={recommendedFor?.weak ? `recommended-none-${model.id}` : `recommended-${model.id}`} style={[type.monoLabel, { color: recommendedFor?.weak ? theme.text2 : theme.accent }]}>
          {recommendedFor
            ? t(recommendedFor.weak ? "models.recommendedNone" : "models.recommendedFor", {
                device: deviceNoun(),
                model: modelLabel(model.id),
                use: t(`use.${recommendedFor.use}`).toUpperCase(),
                language: t(`language.${recommendedFor.languageCode}`, { defaultValue: LANGUAGE_NAME_BY_CODE[recommendedFor.languageCode] ?? recommendedFor.languageCode }).toUpperCase(),
              })
            : t("models.recommended", { device: deviceNoun() })}
        </Text>
      ) : null}
      {copy.goodFor ? (
        <Text testID={`model-goodfor-${model.id}`} style={[type.bodySmall, { color: theme.text }]}>
          {copy.goodFor}
        </Text>
      ) : null}
      {model.fit ? <FitMap fit={model.fit} weakAt={copy.weakAt} theme={theme} testID={`fit-${model.id}`} /> : null}
      <Text testID={`model-spec-${model.id}`} style={[type.mono, { color: theme.text3 }]}>
        {companion ? `${technical} · ` : ""}{model.quant ? t("vault.spec", { size: formatModelBytes(model.bytes), quant: model.quant }) : formatModelBytes(model.bytes)} · {t("models.battery", { level: t(`vault.battery.${model.battery}`) })}
      </Text>
      {companion && !disabledReason && fit !== "no" ? null : (
        <Text style={[type.mono, { color: theme.text3 }]}>
          {disabledReason === "engine"
          ? t("vault.state.updateApp")
          : disabledReason === "ram" || fit === "no"
            ? t("vault.willNotRun", { ram: device.ramGB })
            : speed
              ? t("vault.speed", { min: speed[0], max: speed[1], device: deviceNoun() })
              : t("vault.speedUnknown", { device: deviceNoun() })}
          {!disabled && tooSlow ? ` · ${t("vault.tooSlowHere", { device: deviceNoun() })}` : !disabled && fit === "slowly" ? ` · ${t("vault.runsSlowly", { ram: device.ramGB })}` : ""}
        </Text>
      )}
      {progress > 0 ? (
        <View style={[styles.bar, { backgroundColor: theme.well }]}>
          {/* The same floor as the status line's percent (F376): a round here would show the bar a hair ahead of the number beside it. */}
          <View style={[styles.fill, { width: `${state.kind === "delivering" ? downloadPercent(state.bytes, state.total || model.bytes) : Math.round(progress * 100)}%`, backgroundColor: state.kind === "ready" ? theme.sealed : theme.accent }]} />
        </View>
      ) : null}
      {status ? (
        <Text testID={`model-status-${model.id}`} style={[type.mono, { color: status.danger ? theme.danger : theme.text2 }]}>
          {status.text}
        </Text>
      ) : null}
      {keepOpenNote(Platform.OS, state) ? (
        <Text testID={`model-keep-open-${model.id}`} style={[type.bodySmall, { color: theme.text2 }]}>
          {t("vault.keepOpen")}
        </Text>
      ) : null}
      {disabled ? null : (
        <View style={styles.actions}>
          {state.kind === "not-installed" || state.kind === "needs-space" || state.kind === "corrupt" || state.kind === "failed" ? (
            plan ? (
              <Action testID={`install-${model.id}`} theme={theme} primary onPress={onInstall} label={state.kind === "not-installed" ? t("vault.installFrom", { size: formatModelBytes(model.bytes), origin: plan.origin }) : t("vault.retry")} />
            ) : onImport ? (
              <Action testID={`import-${model.id}`} theme={theme} primary onPress={onImport} label={t("vault.import")} />
            ) : null
          ) : null}
          {state.kind === "delivering" && state.paused ? <Action testID={`resume-${model.id}`} theme={theme} primary onPress={onResume} label={t("vault.resume")} /> : null}
          {state.kind === "delivering" && !state.paused && plan?.via === "https" ? <Action testID={`pause-${model.id}`} theme={theme} onPress={onPause} label={t("vault.pause")} /> : null}
          {state.kind === "delivering" || state.kind === "verifying" ? <Action testID={`cancel-${model.id}`} theme={theme} onPress={onCancel} label={t("vault.cancel")} /> : null}
          {state.kind === "ready" && !active && !companion ? <Action testID={`use-${model.id}`} theme={theme} primary onPress={onUse} label={t("vault.use")} /> : null}
          {state.kind === "ready" && active && !companion ? <Text style={[type.mono, styles.inUse, { color: theme.text2 }]}>{t("vault.inUse")}</Text> : null}
          {hf && onRemove && (state.kind === "not-installed" || state.kind === "failed" || state.kind === "corrupt" || state.kind === "needs-space") ? <Action testID={`remove-${model.id}`} theme={theme} onPress={onRemove} label={t("vault.remove")} /> : null}
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
