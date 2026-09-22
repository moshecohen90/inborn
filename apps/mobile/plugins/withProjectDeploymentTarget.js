const { withXcodeProject } = require("expo/config-plugins");

/**
 * Expo's own `ios.deploymentTarget` sets the Podfile property and the *main target's* two build configurations, and
 * leaves the project-level pair at the template's 16.4 — which every target added later would inherit. This carries
 * the same number down to them, so the floor is one number everywhere (gap #18, `test/iosDeploymentTarget.test.ts`).
 * @param {import("expo/config").ExpoConfig} config
 */
function withProjectDeploymentTarget(config) {
  const target = config.ios?.deploymentTarget;
  if (!target) throw new Error("withProjectDeploymentTarget: set ios.deploymentTarget in app.config.ts");
  return withXcodeProject(config, (c) => {
    const project = c.modResults;
    const sections = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(sections)) {
      const settings = sections[key]?.buildSettings;
      if (settings && settings.IPHONEOS_DEPLOYMENT_TARGET !== undefined) settings.IPHONEOS_DEPLOYMENT_TARGET = target;
    }
    return c;
  });
}

module.exports = withProjectDeploymentTarget;
