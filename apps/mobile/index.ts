// Hermes ships without Intl.PluralRules; ICU plurals in @inborn/i18n need it on every platform.
import "@formatjs/intl-getcanonicallocales/polyfill";
import "@formatjs/intl-locale/polyfill";
import "@formatjs/intl-pluralrules/polyfill";
import "@formatjs/intl-pluralrules/locale-data/en";
import "@formatjs/intl-pluralrules/locale-data/ja";
import "@formatjs/intl-pluralrules/locale-data/de";
import "@formatjs/intl-pluralrules/locale-data/fr";
import "@formatjs/intl-pluralrules/locale-data/es";
import "@formatjs/intl-pluralrules/locale-data/pt";
import { LogBox } from "react-native";

/* Expo's dev-only DevLoadingView wraps a legacy module that has no addListener (SDK 57 on RN 0.86); its LogBox toast sat over the lock screen's Unlock button and ate the first tap (QA F10). */
if (__DEV__) LogBox.ignoreLogs(["`new NativeEventEmitter()` was called with a non-null argument"]);

// expo-router owns the root: routes live in src/app (see app.config.ts "root").
import "expo-router/entry";
