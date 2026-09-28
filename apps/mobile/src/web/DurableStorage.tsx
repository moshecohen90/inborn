import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { Theme } from "@inborn/ui";
import { Row } from "../components/shell/primitives";
import { useType } from "../services/type";
import { webDoorsApply } from "./doors";
import { durableStateKey, installHint, lastProtection, storageProtected } from "./durable";

/** F411, Settings -> Privacy & storage on the browser tier: whether this browser keeps the model through a cleanup. */
export function DurableStorage({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  const [kept, setKept] = useState<boolean | null>(() => lastProtection()?.granted ?? null);
  useEffect(() => {
    void storageProtected().then((now) => {
      if (now !== null) setKept(now);
    });
  }, []);
  if (Platform.OS !== "web" || !webDoorsApply()) return null;
  return (
    <>
      <Row
        testID="storage-durable"
        label={t("storage.durable.label")}
        sub={t(kept === null ? "storage.durable.unknown" : kept ? "storage.durable.protected" : "storage.durable.notProtected")}
        value={t(durableStateKey(kept))}
      />
      <InstallHint theme={theme} />
    </>
  );
}

/** Safari deletes an unvisited site's data after 7 days; an installed web app is exempt, so the hint says how, and hides once installed. */
export function InstallHint({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  const type = useType();
  const [hint] = useState(() => (Platform.OS === "web" && webDoorsApply() ? installHint() : null));
  if (!hint) return null;
  return (
    <Text testID="install-hint" style={[type.bodySmall, { color: theme.text2 }]}>
      {t(hint === "ios" ? "web.durable.hintIos" : "web.durable.hintMac")}
    </Text>
  );
}
