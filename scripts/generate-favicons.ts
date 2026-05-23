/**
 * One-off / on-demand: rasterize public/favicon.svg into PNG/ICO assets.
 * Run: npm run generate:favicons
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const root = process.cwd();
const svgPath = join(root, "public", "favicon.svg");
const svg = readFileSync(svgPath);

async function png(size: number, outPath: string): Promise<Buffer> {
  const buf = await sharp(svg).resize(size, size).png().toBuffer();
  writeFileSync(outPath, buf);
  return buf;
}

async function main(): Promise<void> {
  const png16 = await png(16, join(root, "public", "icon-16x16.png"));
  const png32 = await png(32, join(root, "public", "icon-32x32.png"));
  await png(180, join(root, "public", "apple-touch-icon.png"));
  await png(180, join(root, "src", "app", "apple-icon.png"));

  writeFileSync(join(root, "public", "favicon.ico"), await toIco([png16, png32]));

  console.log("Generated:");
  console.log("  public/favicon.ico");
  console.log("  public/icon-16x16.png");
  console.log("  public/icon-32x32.png");
  console.log("  public/apple-touch-icon.png");
  console.log("  src/app/apple-icon.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
