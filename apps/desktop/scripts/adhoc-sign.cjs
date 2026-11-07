// Ad-hoc sign the unpacked .app so Apple Silicon will launch it (no Developer ID needed).
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], {
    stdio: "inherit",
  });
};
