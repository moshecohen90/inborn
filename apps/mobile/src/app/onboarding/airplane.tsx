import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { AirplaneTest } from "../../screens/Proof/AirplaneTest";

export default function OnboardingAirplane() {
  const router = useRouter();
  const { t } = useTranslation();
  return <AirplaneTest onDone={() => router.push("/onboarding/sealed")} doneLabel={t("airplane.sawIt")} skipLabel={t("airplane.skip")} />;
}
