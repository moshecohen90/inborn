import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { joinList } from "@inborn/i18n";
import { LANGUAGE_NAME_BY_CODE, downloadPercent, formatModelBytes, type CatalogModel, type InstallState, type LanguageTier, type ModelChoice, type ModelChoices, type LicenceTier, type PaywallReason, type UseCase } from "@inborn/core";
import { Sheet } from "./Sheet";
import { useType } from "../../services/type";
import { deviceNoun } from "../../lib/deviceNoun";
import { modelLabel } from "../../lib/models";
import { WEB_HERE, goodAtUses, recommendationKey } from "../../lib/modelSheetLines";
import { Toggle } from "../shell/primitives";
import { ChipGlyph } from "../shell/ChipGlyph";

export interface ModelSheetProps {
  visible: boolean;
  onClose: () => void;
  choices: ModelChoices;
  /** What the recommendation line was computed for: this chat's task and language. */
  recommendedFor: { use: UseCase; languageCode: string | null };
  theme: Theme;
  /** For "Too big for N GB" on the rows this device cannot run. */
  deviceRamGB: number;
  /** Download progress of a model being fetched from here. */
  stateOf?: (id: string) => InstallState;
  /** Where the file would come from ("Google Play", "models.inbornapp.com"); null when this platform cannot fetch it. */
  originOf?: (id: string) => string | null;
  wifiOnly?: boolean;
  onWifiOnly?: (value: boolean) => void;
  lockedFor?: (model: CatalogModel) => boolean;
  onSwitch?: (id: string) => void;
  onDownload?: (id: string) => void;
  /** Every locked row in this sheet is the §12.3 model moment, so the reason never varies. */
  onUnlock?: (reason?: PaywallReason) => void;
  /** The chat header opens this sheet, so this is where the tier is visible without anything being refused (§12.3). */
  tier?: LicenceTier;
  onSeePro?: () => void;
  onManage: () => void;
  onChatSettings: () => void;
  /** §14.3 browser tier: the page holds one model, so the rows are read-only and the app is the way to the rest. */
  managed?: boolean;
  /** Browser tier: the models the door offers are chosen here as at the door; set, it replaces the read-only rows. */
  onChoose?: (id: string) => void;
  /** Browser tier: the catalog models only the app runs, the one section that honestly says "In the app". */
  inTheApp?: ModelChoice[];
}

/**
 * §7.8 model switching where the user is: the chat header's chip opens this. Installed models first (one tap switches),
 * then what this device can still download, each with what it is good at, how it rates this chat's language, and its size.
 */
export function ModelSheet({ visible, onClose, choices, recommendedFor, theme, deviceRamGB, stateOf, originOf, wifiOnly, onWifiOnly, lockedFor, onSwitch, onDownload, onUnlock, onManage, onChatSettings, managed, onChoose, inTheApp, tier, onSeePro }: ModelSheetProps) {
  const type = useType();
  const { t, i18n } = useTranslation();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) setConfirmId(null);
  }, [visible]);

  const languageName = (code: string) => t(`language.${code}`, { defaultValue: LANGUAGE_NAME_BY_CODE[code] ?? code });
  const { use, languageCode } = recommendedFor;
  const recommended = choices.recommended;
  /* The same three lines the vault's picker uses (§7.8), so the chip and the vault never disagree about what is best here. */
  const key = recommendationKey(choices, languageCode);
  const recommendedLine = !key || !recommended ? null : t(key, { device: deviceNoun(), model: modelLabel(recommended.model.id), use: t(`use.${use}`).toUpperCase(), ...(languageCode ? { language: languageName(languageCode).toUpperCase() } : {}) });

  const row = (choice: ModelChoice) => (
    <ModelRow
      key={choice.model.id}
      choice={choice}
      theme={theme}
      deviceRamGB={deviceRamGB}
      languageCode={languageCode}
      languageName={languageName}
      locale={i18n.language}
      recommended={recommended?.model.id === choice.model.id && !choices.recommendedWeak}
      state={stateOf?.(choice.model.id)}
      origin={originOf?.(choice.model.id) ?? null}
      locked={!!lockedFor?.(choice.model)}
      managed={!!managed}
      onChoose={onChoose ? () => onChoose(choice.model.id) : undefined}
      confirming={confirmId === choice.model.id}
      wifiOnly={wifiOnly}
      onWifiOnly={onWifiOnly}
      onSwitch={() => onSwitch?.(choice.model.id)}
      onAskDownload={() => setConfirmId(choice.model.id)}
      onCancelDownload={() => setConfirmId(null)}
      onDownload={() => {
        setConfirmId(null);
        onDownload?.(choice.model.id);
      }}
      onUnlock={() => onUnlock?.("model")}
    />
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={t("modelSheet.title")} testID="model-sheet">
      <View style={styles.body}>
        {tier ? (
          <View style={styles.tierRow}>
            <View testID="tier-chip" style={[styles.tierChip, { backgroundColor: theme.surface2, borderColor: tier === "free" ? theme.border : theme.accent }]}>
              <Text style={[type.monoLabel, { color: tier === "free" ? theme.text2 : theme.accent }]}>{t(`paywall.tier.${tier}`)}</Text>
            </View>
            {onSeePro ? (
              <Pressable testID="see-whats-in-pro" accessibilityRole="button" hitSlop={8} onPress={onSeePro}>
                <Text style={[type.bodySmall, type.strong, styles.seeProLink, { color: theme.text }]}>{t("paywall.seeWhatsIn")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {recommendedLine ? (
          <Text testID="model-sheet-recommended" style={[type.monoLabel, { color: choices.recommendedWeak ? theme.text2 : theme.accent }]}>
            {recommendedLine}
          </Text>
        ) : null}
        {managed ? (
          <Text testID="model-sheet-managed" style={[type.bodySmall, { color: theme.text2 }]}>
            {/* The IN THE APP rows below already say what only the app runs; the sentence would say it twice (F388). */}
            {inTheApp?.length ? t("vault.web.explain") : `${t("vault.web.explain")} ${t("vault.web.fullVault")}`}
          </Text>
        ) : null}

        <Text style={[type.monoLabel, styles.section, { color: theme.text3 }]}>{t("vault.onDevice")}</Text>
        {choices.installed.map(row)}
        {choices.available.length ? (
          <>
            <Text style={[type.monoLabel, styles.section, { color: theme.text }]}>{managed && !onChoose ? t("modelSheet.inTheApp") : t("vault.fits", { device: deviceNoun() })}</Text>
            {choices.available.map(row)}
          </>
        ) : null}
        {choices.unavailable.length ? (
          <>
            <Text style={[type.monoLabel, styles.section, { color: theme.text3 }]}>{t("vault.tooBig", { ram: deviceRamGB })}</Text>
            {choices.unavailable.map(row)}
          </>
        ) : null}
        {inTheApp?.length ? (
          <>
            <Text testID="model-sheet-in-the-app" style={[type.monoLabel, styles.section, { color: theme.text3 }]}>{t("modelSheet.inTheApp")}</Text>
            {inTheApp.map((choice) => (
              <ModelRow key={choice.model.id} choice={choice} theme={theme} deviceRamGB={deviceRamGB} languageCode={languageCode} languageName={languageName} locale={i18n.language} recommended={false} state={undefined} origin={null} locked={!!lockedFor?.(choice.model)} managed confirming={false} onSwitch={() => {}} onAskDownload={() => {}} onCancelDownload={() => {}} onDownload={() => {}} onUnlock={() => {}} />
            ))}
          </>
        ) : null}

        <View style={styles.footer}>
          <Pressable testID="model-sheet-manage" accessibilityRole="button" onPress={onManage} style={[styles.footerBtn, { borderColor: theme.border }]}>
            <Text style={[type.body, { color: theme.text }]}>{t("vault.title")}</Text>
          </Pressable>
          <Pressable testID="model-sheet-chat-settings" accessibilityRole="button" onPress={onChatSettings} style={[styles.footerBtn, { borderColor: theme.border }]}>
            <Text style={[type.body, { color: theme.text }]}>{t("chatSettings.title")}</Text>
          </Pressable>
          <Pressable testID="model-sheet-close" accessibilityRole="button" onPress={onClose} style={[styles.footerBtn, { borderColor: theme.border }]}>
            <Text style={[type.body, { color: theme.text2 }]}>{t("vault.close")}</Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

interface RowProps {
  choice: ModelChoice;
  theme: Theme;
  deviceRamGB: number;
  languageCode: string | null;
  languageName: (code: string) => string;
  locale: string;
  recommended: boolean;
  state: InstallState | undefined;
  origin: string | null;
  locked: boolean;
  managed: boolean;
  /** Browser tier: take this model instead (the door delivers it). */
  onChoose?: () => void;
  confirming: boolean;
  wifiOnly?: boolean;
  onWifiOnly?: (value: boolean) => void;
  onSwitch: () => void;
  onAskDownload: () => void;
  onCancelDownload: () => void;
  onDownload: () => void;
  onUnlock: () => void;
}

const TIER_KEY: Record<LanguageTier, string> = { native: "vault.fit.tier.native", good: "vault.fit.tier.good", basic: "vault.fit.tier.basic", none: "vault.fit.tier.none" };

function ModelRow({ choice, theme, deviceRamGB, languageCode, languageName, locale, recommended, state, origin, locked, managed, onChoose, confirming, wifiOnly, onWifiOnly, onSwitch, onAskDownload, onCancelDownload, onDownload, onUnlock }: RowProps) {
  const type = useType();
  const { t } = useTranslation();
  const { model, reason } = choice;
  /* "Good at" names the jobs the fit map rates best or good, plus photos, which no use case covers. */
  const goodAt = goodAtUses(model, Platform.OS === "web" ? WEB_HERE : undefined).map((u) => (u === "photos" ? t("vault.details.vision") : t(`use.${u}`)));
  const tier = reason.languageTier;
  /* §9.9 keeps the sealed green for the seal: the language tier is a ladder of ink weight instead (QA F247). */
  const tierColor = tier === "native" ? theme.text : tier === "good" ? theme.text2 : tier === "none" ? theme.danger : theme.text3;
  const downloading = state?.kind === "delivering" || state?.kind === "verifying";
  const percent = state?.kind === "delivering" ? downloadPercent(state.bytes, state.total || model.bytes) : 0;
  /* A model this tier cannot install is not offered at the weight of the one in use (QA F248). */
  const dim = !!choice.blocked || (managed && !choice.current && !onChoose);

  return (
    <View testID={`model-sheet-row-${model.id}`} style={[styles.row, { borderColor: choice.current ? theme.text : theme.border, backgroundColor: theme.surface1, opacity: dim ? 0.5 : 1 }]}>
      <View style={styles.head}>
        <ChipGlyph size={12} color={choice.current ? theme.text : theme.text2} />
        <Text style={[type.monoLabel, styles.name, { color: theme.text }]}>{modelLabel(model.id)}</Text>
        {recommended ? (
          <Text testID={`model-sheet-recommended-${model.id}`} style={[type.monoLabel, { color: theme.accent }]}>
            {t("modelSheet.tag")}
          </Text>
        ) : null}
        {locked && !choice.installed ? <Text style={[type.monoLabel, styles.chip, { color: theme.accent, borderColor: theme.accent }]}>{t("vault.pro")}</Text> : null}
      </View>
      {goodAt.length ? (
        <Text testID={`model-sheet-goodat-${model.id}`} style={[type.bodySmall, { color: theme.text2 }]}>
          {t("modelSheet.goodAt", { list: joinList(locale, goodAt) })}
        </Text>
      ) : null}
      {languageCode ? (
        <Text testID={`model-sheet-language-${model.id}`} style={[type.mono, { color: theme.text3 }]}>
          {languageName(languageCode)} · <Text style={{ color: tier ? tierColor : theme.text3 }}>{tier ? t(TIER_KEY[tier]) : t("modelSheet.languageUnrated")}</Text>
        </Text>
      ) : null}
      <Text style={[type.mono, { color: theme.text3 }]}>
        {formatModelBytes(model.bytes)}
        {choice.blocked === "engine" ? ` · ${t("vault.state.updateApp")}` : choice.blocked === "ram" ? ` · ${t("vault.willNotRun", { ram: deviceRamGB })}` : choice.blocked === "slow" ? ` · ${t("vault.tooSlowHere", { device: deviceNoun() })}` : ""}
      </Text>
      {downloading ? (
        <Text testID={`model-sheet-progress-${model.id}`} style={[type.mono, { color: theme.text2 }]}>
          {state?.kind === "verifying" ? t("vault.state.verifying") : t("vault.state.delivering", { percent, done: formatModelBytes(state?.kind === "delivering" ? state.bytes : 0), total: formatModelBytes(model.bytes) })}
        </Text>
      ) : null}

      {confirming ? (
        <View testID={`model-sheet-confirm-${model.id}`} style={styles.confirm}>
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.confirm.https", { size: formatModelBytes(model.bytes), host: origin ?? "" })}</Text>
          {onWifiOnly ? (
            <View style={styles.wifiRow}>
              <Text style={[type.bodySmall, styles.grow, { color: theme.text }]}>{t("vault.confirm.wifiOnly")}</Text>
              <Toggle testID={`model-sheet-wifi-${model.id}`} label={t("vault.confirm.wifiOnly")} value={!!wifiOnly} onChange={onWifiOnly} />
            </View>
          ) : null}
          <View style={styles.actions}>
            <Pressable testID={`model-sheet-go-${model.id}`} accessibilityRole="button" onPress={onDownload} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>{t("vault.confirm.go")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onCancelDownload} hitSlop={8} style={styles.textBtn}>
              <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      ) : dim ? null : onChoose && !choice.current ? (
        <View style={styles.actions}>
          <Pressable testID={`model-sheet-choose-${model.id}`} accessibilityRole="button" onPress={onChoose} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {choice.installed ? t("vault.use") : t("web.models.choose", { size: formatModelBytes(model.bytes) })}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          {choice.current ? (
            <Text testID={`model-sheet-inuse-${model.id}`} style={[type.mono, { color: theme.text2 }]}>
              {t("vault.inUse")}
            </Text>
          ) : choice.installed ? (
            <Pressable testID={`model-sheet-use-${model.id}`} accessibilityRole="button" onPress={onSwitch} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>{t("vault.use")}</Text>
            </Pressable>
          ) : downloading ? null : origin ? (
            <Pressable testID={`model-sheet-download-${model.id}`} accessibilityRole="button" onPress={locked ? onUnlock : onAskDownload} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
              <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
                {t("vault.installFrom", { size: formatModelBytes(model.bytes), origin })}
              </Text>
            </Pressable>
          ) : (
            <Text testID={`model-sheet-nodelivery-${model.id}`} style={[type.mono, { color: theme.text3 }]}>
              {t("vault.state.importOnly.android")}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tierRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  tierChip: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 2, minHeight: 22, justifyContent: "center" },
  seeProLink: { textDecorationLine: "underline" },
  body: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  section: { paddingTop: 10 },
  row: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flex: 1, letterSpacing: 1 },
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 4 },
  btn: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  textBtn: { minHeight: 36, justifyContent: "center", paddingHorizontal: 4 },
  confirm: { gap: 8, marginTop: 4 },
  wifiRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1 },
  footer: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 14 },
  footerBtn: { minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
