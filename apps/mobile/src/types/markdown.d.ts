/* docs/legal/*.md arrive as strings through metro/mdTransformer.js. */
declare module "*.md" {
  const source: string;
  export default source;
}
