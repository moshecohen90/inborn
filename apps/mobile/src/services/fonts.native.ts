import { useFonts } from "expo-font";
import SansRegular from "../../assets/fonts/IBMPlexSans-Regular.ttf";
import SansMedium from "../../assets/fonts/IBMPlexSans-Medium.ttf";
import SansSemiBold from "../../assets/fonts/IBMPlexSans-SemiBold.ttf";
import MonoRegular from "../../assets/fonts/IBMPlexMono-Regular.ttf";
import MonoMedium from "../../assets/fonts/IBMPlexMono-Medium.ttf";

/** IBM Plex faces registered under the names `fontFaces` in @inborn/ui expects; the splash stays up until they are in. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    IBMPlexSans: SansRegular,
    "IBMPlexSans-Medium": SansMedium,
    "IBMPlexSans-SemiBold": SansSemiBold,
    IBMPlexMono: MonoRegular,
    "IBMPlexMono-Medium": MonoMedium,
  });
  if (error) console.warn("[inborn] fonts", error);
  return loaded || !!error;
}
