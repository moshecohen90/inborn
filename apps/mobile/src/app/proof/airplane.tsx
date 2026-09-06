import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { AirplaneTest } from "../../screens/Proof/AirplaneTest";

export default function ProofAirplane() {
  const router = useRouter();
  const { t } = useTranslation();
  return <AirplaneTest onDone={() => (router.canGoBack() ? router.back() : router.replace("/proof"))} doneLabel={t("airplane.done")} />;
}
