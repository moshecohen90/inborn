/* Markdown files become string modules so docs/legal ships inside the bundle (no fetch, no network). */
const upstream = require("@expo/metro-config/babel-transformer");

module.exports = {
  ...upstream,
  transform(args) {
    if (args.filename.endsWith(".md")) return upstream.transform({ ...args, src: `export default ${JSON.stringify(args.src)};` });
    return upstream.transform(args);
  },
};
