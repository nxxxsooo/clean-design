import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "../..");
const workspaceRoot = join(desktopRoot, "../..");

function source(relativePath: string): string {
  return readFileSync(join(desktopRoot, relativePath), "utf8");
}

function functionBody(contents: string, declaration: string): string {
  const start = contents.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThanOrEqual(0);
  const next = contents.indexOf("\nexport ", start + declaration.length);
  return contents.slice(start, next < 0 ? undefined : next);
}

function pngCornerAlpha(filePath: string): number {
  const png = readFileSync(filePath);
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");

  let offset = 8;
  let colorType = -1;
  const compressed: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      expect(data[8], "icon PNG must remain 8-bit").toBe(8);
      colorType = data[9] ?? -1;
    }
    if (type === "IDAT") compressed.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }

  expect(colorType, "icon PNG must have an RGBA channel").toBe(6);
  const scanlines = inflateSync(Buffer.concat(compressed));
  // The first pixel has no left or upper neighbour, so every PNG filter
  // reconstructs its four RGBA bytes directly from the stored values.
  return scanlines[4] ?? -1;
}

describe("macOS application identity", () => {
  it("sets the product name before Electron becomes ready and builds its menu", () => {
    const body = functionBody(source("src/main/index.ts"), "export async function runDesktopMain");
    const setName = body.indexOf('app.setName("Clean Design")');
    const whenReady = body.indexOf("await app.whenReady()");
    expect(setName).toBeGreaterThanOrEqual(0);
    expect(setName).toBeLessThan(whenReady);
  });

  it("applies the branded Dock icon before creating the splash window", () => {
    const body = functionBody(source("src/main/runtime.ts"), "export function createSplashWindow");
    const setIcon = body.indexOf("applyDockIcon()");
    const createWindow = body.indexOf("new BrowserWindow(");
    expect(setIcon).toBeGreaterThanOrEqual(0);
    expect(setIcon).toBeLessThan(createWindow);
  });

  it("ships a transparent outer canvas instead of a white square", () => {
    const webIcon = join(workspaceRoot, "apps/web/public/app-icon.png");
    const packagedIcon = join(workspaceRoot, "tools/pack/resources/mac/icon.png");
    expect(pngCornerAlpha(webIcon)).toBe(0);
    expect(pngCornerAlpha(packagedIcon)).toBe(0);
    expect(readFileSync(packagedIcon)).toEqual(readFileSync(webIcon));
  });
});
