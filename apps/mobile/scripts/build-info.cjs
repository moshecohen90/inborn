/* The commit and date every bundle prints, as a file the app imports: its contents change with HEAD, so Metro's
   transform cache cannot serve an older one, as it did with the web's inlined app config (F452). */
const { execSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const BUILD_INFO_FILE = path.join(__dirname, "../src/work/buildInfo.generated.json");

function currentBuildInfo() {
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short=12 HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "unknown";
  } catch {
    /* Not a git checkout (a source tarball): the screens say "unknown". */
  }
  return { commit, builtAt: new Date().toISOString().slice(0, 10) };
}

function readIfPresent(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/* Metro workers evaluate app.config.ts again while bundling: rewriting identical bytes would race their reads. */
function writeBuildInfo(info = currentBuildInfo()) {
  const text = `${JSON.stringify(info)}\n`;
  if (readIfPresent(BUILD_INFO_FILE) !== text) writeFileSync(BUILD_INFO_FILE, text);
  return info;
}

module.exports = { BUILD_INFO_FILE, currentBuildInfo, writeBuildInfo };

if (require.main === module) {
  const info = writeBuildInfo();
  console.log(`build info: ${info.commit} ${info.builtAt}`);
}
