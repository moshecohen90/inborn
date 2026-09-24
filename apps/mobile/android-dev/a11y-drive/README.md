# a11y-drive — accessibility driver for phones that ignore injected touches

Dev-only. A self-instrumenting test APK (`com.inbornapp.mobile.uitest` + `.test`) that performs accessibility node actions in any app:
`click`, `longclick`, `focus`, `setsel`, `settext`, `sleep`, `dump` (log tag `UIDRIVE`). Used on the OnePlus 6T, where `input tap` is ignored.

```
cp ../../android/gradlew . && cp -R ../../android/gradle . && echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
GRADLE_USER_HOME=~/.gradle-<stream> ./gradlew assembleDebug assembleDebugAndroidTest --no-daemon
adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk
adb -s <serial> install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s <serial> shell "am instrument -w -e steps 'longclick:<view id>;sleep:1500;click:Select all;click:More options;click:Ask Inborn' com.inbornapp.mobile.uitest.test/androidx.test.runner.AndroidJUnitRunner"
adb -s <serial> logcat -d -s UIDRIVE
adb -s <serial> uninstall com.inbornapp.mobile.uitest.test; adb -s <serial> uninstall com.inbornapp.mobile.uitest
```
Node lookup: exact text / content-description / view id first, then substring; click walks up to the nearest clickable ancestor.

The driver acts on whatever is in front, so it needs no package name. The app under test does: since F279 a build made
with `APP_VARIANT=development` is `com.inbornapp.mobile.qa`, and `com.inbornapp.mobile` is the store build — Moshe's own
install on the 6T. Address the QA one in every `adb install`, `uninstall`, `run-as` and `am force-stop`; the store id is
never the target of a QA run. Play Protect blocks the sideload of both APKs here with "Send app for a security check?";
answer **Don't send** with `input keyevent KEYCODE_DPAD_DOWN` / `KEYCODE_DPAD_CENTER`, and change no phone setting.
