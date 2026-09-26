import { useState } from "react";
import { useRouter } from "expo-router";
import { useTheme } from "../services/theme";
import { Screen } from "../components/shell/Screen";
import { webBoot, webReady } from "./boot";
import { ModelOffer } from "./ModelOffer";

/**
 * S02 on the browser tier: the model offer is the step, and the download runs inside it (round 103). Sealed follows
 * a model, so a finished download goes there by a full load: the engine is picked once per page, before the file existed.
 */
export function WebModelStep() {
  const boot = webBoot();
  const { theme } = useTheme();
  const router = useRouter();
  const [loaded] = useState(() => ({ ready: webReady(boot), id: boot.source?.id ?? null }));
  const next = () => {
    if (loaded.ready && (boot.engine === "chrome-nano" || boot.source?.id === loaded.id)) router.push("/onboarding/sealed");
    else location.assign("/onboarding/sealed");
  };
  return (
    <Screen header={{ back: true }} mesh card testID="onboarding-model">
      <ModelOffer boot={boot} theme={theme} framed={false} onReady={next} onContinue={boot.engine === "chrome-nano" ? next : undefined} />
    </Screen>
  );
}
