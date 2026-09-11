const { withDangerousMod, withMainActivity } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Android cold start follows the theme the user chose (QA B14): the JS override reaches AppCompat only after the first
 * paint, so a Dark app under a Light system opened with a white window and light status icons. MainActivity reads the
 * stored `themeMode` from prefs.json (the app's document directory) in attachBaseContext, before the delegate
 * builds its configuration; the night resources give the splash window the app's dark ground.
 * @param {import("expo/config").ExpoConfig} config
 * @param {{ darkBackground: string }} props
 */
function withStoredNightMode(config, { darkBackground }) {
  config = withMainActivity(config, (config) => {
    const src = config.modResults.contents;
    if (src.includes("applyStoredNightMode")) return config;
    const imports = "import android.content.Context\nimport androidx.appcompat.app.AppCompatDelegate\n";
    const method = `
  override fun attachBaseContext(newBase: Context) {
    applyStoredNightMode(newBase)
    super.attachBaseContext(newBase)
  }

  private fun applyStoredNightMode(context: Context) {
    try {
      val prefs = java.io.File(context.filesDir, "prefs.json")
      if (!prefs.exists() || prefs.length() > 65536) return
      val mode = Regex("\\"themeMode\\"\\\\s*:\\\\s*\\"(dark|light|system)\\"").find(prefs.readText())?.groupValues?.get(1)
      when (mode) {
        "dark" -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        "light" -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        else -> AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
      }
    } catch (_: Exception) {
    }
  }
`;
    let out = src.replace("import android.os.Bundle\n", `import android.os.Bundle\n${imports}`);
    out = out.replace(/class MainActivity : ReactActivity\(\) \{\n/, (m) => `${m}${method}`);
    if (!out.includes("applyStoredNightMode(newBase)")) throw new Error("withStoredNightMode: MainActivity.kt has an unexpected shape");
    config.modResults.contents = out;
    return config;
  });
  return withDangerousMod(config, [
    "android",
    (config) => {
      const res = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "values-night");
      fs.mkdirSync(res, { recursive: true });
      fs.writeFileSync(path.join(res, "colors.xml"), `<resources>\n  <color name="splashscreen_background">${darkBackground}</color>\n</resources>\n`);
      fs.writeFileSync(path.join(res, "styles.xml"), `<resources>\n  <style name="Theme.App.SplashScreen" parent="AppTheme">\n    <item name="android:windowBackground">@color/splashscreen_background</item>\n  </style>\n</resources>\n`);
      return config;
    },
  ]);
}

module.exports = withStoredNightMode;
