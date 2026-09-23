import { useMemo, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { HF_CDN_HOST, HF_HOST, daysSince, formatBytes, networkAllowlist } from "@inborn/core";
import { Icon, radius } from "@inborn/ui";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { permissionRows } from "../../proof/permissions";
import { lastWebDelivery } from "../../proof/webDelivery";
import { Screen } from "../../components/shell/Screen";
import { Actions, Button, Mono, MonoLabel, Section } from "../../components/shell/primitives";
import { Sheet } from "../../components/shell/Sheet";
import { font, useType } from "../../services/type";

const EXODUS = "https://reports.exodus-privacy.eu.org/en/reports/search/com.inbornapp.mobile/";
/* F51: the "Source code" link went to a private repository and 404'd for every user. There is no published
   bundle hash either, so this section now offers only what it can actually show. docs/legal/verification.md. */

/** S50: every privacy claim next to the way to verify it. Mono readouts, nothing decorative. */
export function Proof() {
  const type = useType();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { meter, networkLog, sealState, delivery } = useAppServices();
  const [logOpen, setLogOpen] = useState(false);
  const webDelivery = useMemo(lastWebDelivery, []);
  const iosMajor = Platform.OS === "ios" ? parseInt(String(Device.osVersion ?? "0"), 10) || 0 : 0;
  const platform = Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";
  const allow = networkAllowlist(platform, iosMajor);
  const sealLabel = sealState === "unsealed" ? t("proof.unsealed") : sealState === "lan" ? t("proof.lan") : t("proof.sealed");
  const sealColor = sealState === "unsealed" ? theme.danger : sealState === "lan" ? theme.accent : theme.sealed;
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.1";
  const build = Application.nativeBuildVersion ?? "web";
  const extra = (Constants.expoConfig?.extra ?? {}) as { commit?: string; builtAt?: string };
  const log = networkLog.list();

  return (
    <Screen header={{ back: true, seal: { state: sealState, label: sealLabel } }} testID="proof">
      <View testID="proof-readout" style={[styles.readout, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <ReadoutRow label={sealLabel} color={sealColor} value={t("proof.sinceInstall", { days: daysSince(meter.since, Date.now()) })} />
        <ReadoutRow label={t("proof.outIn", { out: formatBytes(meter.out), in: formatBytes(meter.in) })} value={t("proof.connections", { count: meter.connections })} testID="proof-meter" />
        {meter.kind !== "counter" ? <Text style={[styles.note, { color: theme.text3 }]}>{Platform.OS === "web" ? t("proof.meter.web") : t("proof.meter.ios")}</Text> : null}
      </View>

      <Section title={t("proof.allowlist")}>
        {allow.length === 0 ? <Line text={t("proof.allowlist.none")} /> : null}
        {Platform.OS === "android" ? <Line text={t("proof.allowlist.play")} /> : null}
        {allow.map((a) => (
          <Line key={a.host} mono={a.host} text={a.host === HF_HOST ? t("proof.allowlist.hf") : a.host === HF_CDN_HOST ? t("proof.allowlist.hfCdn") : t("proof.allowlist.models")} />
        ))}
      </Section>

      <Section title={t("proof.lastDelivery")}>
        {Platform.OS === "web" ? (
          webDelivery ? (
            <Line mono={`${webDelivery.name.toUpperCase()} · ${formatBytes(webDelivery.bytes)}`} text={t(webDelivery.verified ? "proof.delivery.web" : "proof.delivery.webUnverified", { origin: webDelivery.origin })} testID="proof-delivery-web" />
          ) : (
            <Line text={t("proof.delivery.webNone")} testID="proof-delivery-web" />
          )
        ) : delivery && delivery.status === "done" ? (
          <Line mono={`${delivery.name} · ${formatBytes(delivery.totalBytes)}`} text={Platform.OS === "android" ? t("proof.delivery.play") : t("proof.delivery.apple")} />
        ) : (
          <Line text={Platform.OS === "android" ? t("proof.delivery.builtinPlay") : t("proof.delivery.builtin")} />
        )}
      </Section>

      <Section title={t("proof.permissions")}>
        {permissionRows().map((p) => (
          <Line key={p.key} mono={t(`proof.permission.${p.key}`)} text={t(`proof.permissionState.${p.state}`)} testID={`perm-${p.key}`} />
        ))}
      </Section>

      <Section title={t("proof.trackers")}>
        <Line mono="0" text={t("proof.trackers.line")} />
        {Platform.OS === "android" ? <Button title={t("proof.exodus")} variant="link" onPress={() => void Linking.openURL(EXODUS)} /> : null}
      </Section>

      <Section title={t("proof.build")}>
        <Line mono={`${version} (${build}) · ${extra.commit ?? "unknown"}`} text={t("proof.build.line", { date: extra.builtAt ?? "" })} testID="proof-build" />
        <Text testID="proof-source-note" style={[type.bodySmall, { color: theme.text3 }]}>
          {t("proof.build.notPublished")}
        </Text>
      </Section>

      {/* The airplane invitation lives here, on the page that proves things, with the reason on the same line (F122). */}
      <Section title={t("proof.airplane.title")}>
        <View style={styles.invite}>
          <Text testID="proof-airplane-why" style={[type.bodySmall, { color: theme.text2 }]}>
            {t("airplane.why")}
          </Text>
          <Actions>
            <Button testID="proof-airplane" title={t("proof.runAirplane")} onPress={() => router.push("/proof/airplane")} />
          </Actions>
        </View>
      </Section>

      <Actions style={styles.actions}>
        <Button testID="proof-log" title={t("proof.viewLog")} variant="secondary" onPress={() => setLogOpen(true)} />
      </Actions>

      <Section title={t("proof.verify.title")}>
        <Text style={[type.bodySmall, { color: theme.text2 }]}>
          {Platform.OS === "android" ? t("proof.verify.android") : Platform.OS === "ios" ? t("proof.verify.ios") : t("proof.verify.web")}
        </Text>
        <Text style={[type.bodySmall, styles.spaced, { color: theme.text2 }]}>{t("proof.verify.firewall")}</Text>
      </Section>

      <Sheet visible={logOpen} onClose={() => setLogOpen(false)} title={t("proof.log.title")} testID="network-log">
        {log.length === 0 ? (
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("proof.log.empty")}</Text>
        ) : (
          log.map((r, i) => <Mono key={i}>{`${new Date(r.at).toLocaleTimeString()} · ${r.host} · ↑${formatBytes(r.bytesOut)} ↓${formatBytes(r.bytesIn)}`}</Mono>)
        )}
        <Text style={[styles.note, { color: theme.text3 }]}>{t("proof.log.note")}</Text>
      </Sheet>
    </Screen>
  );
}

function ReadoutRow({ label, value, color, testID }: { label: string; value: string; color?: string; testID?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <MonoLabel color={color ?? theme.text}>{label}</MonoLabel>
      <Mono color={theme.text2}>{value}</Mono>
    </View>
  );
}

/** IBM Plex Sans has no U+2713, so a literal tick fell back to a symmetric V and read as a square root (QA F254). */
const TICK = "\u2713";

function Line({ mono, text, testID }: { mono?: string; text: string; testID?: string }) {
  const type = useType();
  const { theme } = useTheme();
  const parts = text.split(TICK);
  return (
    <View style={[styles.line, { borderBottomColor: theme.border }]} testID={testID}>
      {mono ? <Mono color={theme.text}>{mono}</Mono> : null}
      <Text style={[type.bodySmall, { color: theme.text2 }]}>
        {parts.map((part, i) => (
          <Text key={i}>
            {i ? <Icon name="check" size={12} color={theme.text2} style={styles.tick} /> : null}
            {part}
          </Text>
        ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 10 },
  row: { gap: 2 },
  tick: { transform: [{ translateY: 1 }] },
  note: { ...font("sans"), fontSize: 12, lineHeight: 16 },
  line: { paddingVertical: 8, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { gap: 8, paddingTop: 20 },
  invite: { gap: 10, paddingTop: 4 },
  spaced: { paddingTop: 8 },
});
