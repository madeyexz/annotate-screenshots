#!/usr/bin/env node

import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXAMPLE = {
  header: {
    height: 96,
    background: "#292522",
    accent: "#C96542",
    badge: "AFTER · PR",
    title: "Actual localhost /admin/analytics",
    subtitle: "The real route now includes per-post audience analytics.",
  },
  annotations: [
    {
      type: "rect",
      x: 187,
      y: 471,
      width: 1137,
      height: 160,
      style: "solid",
      label: "NEW ON THIS BRANCH",
    },
    {
      type: "arrow",
      from: [400, 300],
      to: [650, 430],
      bend: -45,
    },
    {
      type: "callout",
      x: 36,
      y: 48,
      width: 300,
      badge: "WHY IT MATTERS",
      title: "Audience context is now visible",
      body: ["Reviewers can see the new region", "without guessing what changed."],
      target: [650, 430],
    },
  ],
  output: {
    quality: 92,
    chromaSubsampling: "4:4:4",
  },
};

function usage() {
  return `Usage:
  bun annotate-screenshot.mjs --input raw.png --output annotated.jpg --spec annotation.json
  bun annotate-screenshot.mjs --print-example

Coordinates are relative to the raw screenshot. The header offset is applied automatically.`;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }
    if (argument === "--print-example") {
      result.printExample = true;
      continue;
    }
    if (["--input", "--output", "--spec"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`);
      }
      result[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a finite number`);
  }
  return number;
}

function point(value, label) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must be [x, y]`);
  }
  return [
    finiteNumber(value[0], `${label}[0]`),
    finiteNumber(value[1], `${label}[1]`),
  ];
}

function pillWidth(label) {
  return Math.max(132, Math.min(300, String(label).length * 7.2 + 32));
}

function text(svgParts, x, y, value, attributes = "") {
  svgParts.push(
    `<text x="${x}" y="${y}" ${attributes}>${escapeXml(value)}</text>`,
  );
}

function renderRect(svgParts, annotation, headerHeight, accent) {
  const x = finiteNumber(annotation.x, "rect.x");
  const y = headerHeight + finiteNumber(annotation.y, "rect.y");
  const width = finiteNumber(annotation.width, "rect.width");
  const height = finiteNumber(annotation.height, "rect.height");
  const color = annotation.color ?? accent;
  const radius = finiteNumber(annotation.radius ?? 18, "rect.radius");
  const strokeWidth = finiteNumber(
    annotation.strokeWidth ?? (annotation.style === "dashed" ? 3 : 4),
    "rect.strokeWidth",
  );
  const dash =
    annotation.style === "dashed"
      ? ` stroke-dasharray="${escapeXml(annotation.dash ?? "9 7")}"`
      : "";

  svgParts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="none" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}"${dash}/>`,
  );

  if (!annotation.label) return;

  const widthOfPill = pillWidth(annotation.label);
  const left =
    annotation.labelPosition === "top-left"
      ? x + 18
      : x + width - widthOfPill - 18;
  const top = Math.max(headerHeight + 4, y - 21);
  svgParts.push(
    `<rect x="${left}" y="${top}" width="${widthOfPill}" height="30" rx="15" fill="${escapeXml(color)}"/>`,
  );
  text(
    svgParts,
    left + widthOfPill / 2,
    top + 20,
    annotation.label,
    `text-anchor="middle" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11" font-weight="700" letter-spacing="0.5"`,
  );
}

function renderArrow(svgParts, annotation, headerHeight, accent, markerId) {
  const [fromX, fromYRaw] = point(annotation.from, "arrow.from");
  const [toX, toYRaw] = point(annotation.to, "arrow.to");
  const fromY = headerHeight + fromYRaw;
  const toY = headerHeight + toYRaw;
  const bend = finiteNumber(annotation.bend ?? 0, "arrow.bend");
  const color = annotation.color ?? accent;
  const strokeWidth = finiteNumber(annotation.strokeWidth ?? 4, "arrow.strokeWidth");
  const middleX = (fromX + toX) / 2;
  const middleY = (fromY + toY) / 2;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const controlX = middleX + (-deltaY / length) * bend;
  const controlY = middleY + (deltaX / length) * bend;

  svgParts.push(
    `<path d="M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}" fill="none" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="url(#${markerId})"/>`,
  );
}

function calloutHeight(annotation) {
  const body = Array.isArray(annotation.body) ? annotation.body : [];
  return finiteNumber(
    annotation.height ?? 72 + body.length * 17,
    "callout.height",
  );
}

function renderCallout(svgParts, annotation, headerHeight, accent, markerId) {
  const x = finiteNumber(annotation.x, "callout.x");
  const y = headerHeight + finiteNumber(annotation.y, "callout.y");
  const width = finiteNumber(annotation.width, "callout.width");
  const height = calloutHeight(annotation);
  const background = annotation.background ?? "#292522";
  const foreground = annotation.foreground ?? "#FFFFFF";
  const muted = annotation.muted ?? "#D9D4CF";
  const color = annotation.color ?? accent;
  const body = Array.isArray(annotation.body) ? annotation.body : [];

  svgParts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${escapeXml(background)}"/>`,
  );
  if (annotation.badge) {
    text(
      svgParts,
      x + 16,
      y + 23,
      annotation.badge,
      `fill="${escapeXml(color)}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="10" font-weight="700" letter-spacing="0.8"`,
    );
  }
  const titleY = y + (annotation.badge ? 48 : 28);
  text(
    svgParts,
    x + 16,
    titleY,
    annotation.title,
    `fill="${escapeXml(foreground)}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="15" font-weight="650"`,
  );
  body.forEach((line, index) => {
    text(
      svgParts,
      x + 16,
      titleY + 24 + index * 17,
      line,
      `fill="${escapeXml(muted)}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12"`,
    );
  });

  if (!annotation.target) return;

  const [targetX, targetYRaw] = point(annotation.target, "callout.target");
  const targetY = headerHeight + targetYRaw;
  const startX = targetX >= x + width / 2 ? x + width : x;
  const startY = y + height / 2;
  const bend = finiteNumber(annotation.bend ?? 0, "callout.bend");
  const middleX = (startX + targetX) / 2;
  const middleY = (startY + targetY) / 2;
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const controlX = middleX + (-deltaY / length) * bend;
  const controlY = middleY + (deltaX / length) * bend;
  svgParts.push(
    `<path d="M ${startX} ${startY} Q ${controlX} ${controlY} ${targetX} ${targetY}" fill="none" stroke="${escapeXml(color)}" stroke-width="4" stroke-linecap="round" marker-end="url(#${markerId})"/>`,
  );
}

function buildSvg(width, rawHeight, spec) {
  const header = spec.header === false ? { height: 0 } : (spec.header ?? {});
  const headerHeight = finiteNumber(header.height ?? 96, "header.height");
  const canvasHeight = rawHeight + headerHeight;
  const background = header.background ?? "#292522";
  const accent = header.accent ?? "#C96542";
  const markerId = "annotation-arrow";
  const svgParts = [
    `<svg width="${width}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><marker id="${markerId}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${escapeXml(accent)}"/></marker></defs>`,
  ];

  if (headerHeight > 0) {
    svgParts.push(
      `<rect width="${width}" height="${headerHeight}" fill="${escapeXml(background)}"/>`,
    );
    const badge = header.badge ?? "ANNOTATED";
    const badgeWidth = pillWidth(badge);
    const badgeY = Math.max(12, (headerHeight - 34) / 2 - 4);
    svgParts.push(
      `<rect x="28" y="${badgeY}" width="${badgeWidth}" height="34" rx="17" fill="${escapeXml(accent)}"/>`,
    );
    text(
      svgParts,
      28 + badgeWidth / 2,
      badgeY + 22,
      badge,
      `text-anchor="middle" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="700" letter-spacing="0.7"`,
    );
    const copyX = 28 + badgeWidth + 24;
    text(
      svgParts,
      copyX,
      Math.max(30, headerHeight / 2 - 12),
      header.title ?? "",
      `fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="650"`,
    );
    text(
      svgParts,
      copyX,
      Math.max(57, headerHeight / 2 + 15),
      header.subtitle ?? "",
      `fill="${escapeXml(header.muted ?? "#D9D4CF")}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="14"`,
    );
    svgParts.push(
      `<rect x="0" y="${Math.max(0, headerHeight - 3)}" width="${width}" height="3" fill="${escapeXml(accent)}"/>`,
    );
  }

  for (const annotation of spec.annotations ?? []) {
    if (annotation.type === "rect") {
      renderRect(svgParts, annotation, headerHeight, accent);
      continue;
    }
    if (annotation.type === "arrow") {
      renderArrow(svgParts, annotation, headerHeight, accent, markerId);
      continue;
    }
    if (annotation.type === "callout") {
      renderCallout(svgParts, annotation, headerHeight, accent, markerId);
      continue;
    }
    throw new Error(`Unsupported annotation type: ${annotation.type}`);
  }

  svgParts.push("</svg>");
  return { svg: svgParts.join("\n"), headerHeight };
}

function ancestorDirectories(start) {
  const directories = [];
  let current = path.resolve(start);
  while (true) {
    directories.push(current);
    const parent = path.dirname(current);
    if (parent === current) return directories;
    current = parent;
  }
}

async function loadSharp(inputPath) {
  const skillDirectory = path.dirname(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const candidates = [
    process.cwd(),
    ...ancestorDirectories(path.dirname(inputPath)),
    ...ancestorDirectories(skillDirectory),
  ];
  const uniqueCandidates = [...new Set(candidates)];
  const errors = [];

  for (const directory of uniqueCandidates) {
    try {
      const requireFromProject = createRequire(
        path.join(directory, "package.json"),
      );
      const imported = requireFromProject("sharp");
      return imported.default ?? imported;
    } catch (error) {
      errors.push(`${directory}: ${error.code ?? error.message}`);
    }
  }

  throw new Error(
    `Could not load sharp from the current directory, input image's parent project, or skill directory. Run npm install --prefix ${skillDirectory} once, or use a project with sharp installed.\nTried:\n${errors.join("\n")}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.printExample) {
    console.log(JSON.stringify(EXAMPLE, null, 2));
    return;
  }
  if (!args.input || !args.output || !args.spec) {
    throw new Error(usage());
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const spec = JSON.parse(await readFile(path.resolve(args.spec), "utf8"));
  const sharp = await loadSharp(inputPath);
  const metadata = await sharp(inputPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read image dimensions from ${inputPath}`);
  }
  const { svg, headerHeight } = buildSvg(metadata.width, metadata.height, spec);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let pipeline = sharp(inputPath)
    .extend({
      top: headerHeight,
      bottom: 0,
      left: 0,
      right: 0,
      background: spec.header?.background ?? "#292522",
    })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);

  const extension = path.extname(outputPath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    pipeline = pipeline.jpeg({
      quality: spec.output?.quality ?? 92,
      chromaSubsampling: spec.output?.chromaSubsampling ?? "4:4:4",
    });
  } else if (extension === ".png") {
    pipeline = pipeline.png({
      compressionLevel: spec.output?.compressionLevel ?? 9,
    });
  } else if (extension === ".webp") {
    pipeline = pipeline.webp({ quality: spec.output?.quality ?? 92 });
  } else {
    throw new Error("Output extension must be .jpg, .jpeg, .png, or .webp");
  }

  await pipeline.toFile(outputPath);
  console.log(
    JSON.stringify(
      {
        input: inputPath,
        output: outputPath,
        raw: { width: metadata.width, height: metadata.height },
        final: {
          width: metadata.width,
          height: metadata.height + headerHeight,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
