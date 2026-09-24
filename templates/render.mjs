#!/usr/bin/env node
// Renders every template in your brand: node render.mjs brand.json out/
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { brandTokens, applyBrandTokens } from "./lib/brand.mjs";

const [brandPath, outDir, style] = process.argv.slice(2);
if (!brandPath || !outDir) { console.error("Usage: node render.mjs brand.json out/ [brand|material|clarity|editorial|bold|luxe|playful|plain]"); process.exit(1); }
const brand = JSON.parse(readFileSync(brandPath, "utf8"));
const tokens = brandTokens(brand, {}, style);
mkdirSync(outDir, { recursive: true });
for (const id of readdirSync(".")) {
  if (!existsSync(join(id, "template.json"))) continue;
  const meta = JSON.parse(readFileSync(join(id, "template.json"), "utf8"));
  const content = Object.fromEntries(Object.entries(meta.content).map(([key, value]) => [key, applyBrandTokens(value, tokens)]));
  const html = applyBrandTokens(readFileSync(join(id, "template.html"), "utf8"), tokens)
    .replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, key) => key in content && content[key] ? content[key] : match);
  writeFileSync(join(outDir, id + ".html"), html);
}
console.log("Rendered into " + outDir + ". Remaining {{tokens}} are recipient fields and links for your platform to fill.");
