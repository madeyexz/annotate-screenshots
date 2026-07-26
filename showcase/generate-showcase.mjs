#!/usr/bin/env node

import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const showcaseDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(showcaseDirectory);
const skillDirectory = path.join(
  repositoryRoot,
  "skills",
  "annotate-screenshots",
);
const renderer = path.join(
  skillDirectory,
  "scripts",
  "annotate-screenshot.mjs",
);
const requireFromSkill = createRequire(path.join(skillDirectory, "package.json"));
const importedSharp = requireFromSkill("sharp");
const sharp = importedSharp.default ?? importedSharp;

const colors = {
  canvas: "#F2F0EA",
  sidebar: "#17191E",
  sidebarMuted: "#858A94",
  ink: "#202126",
  muted: "#74777F",
  line: "#DDD9D0",
  card: "#FFFFFF",
  accent: "#C96542",
  green: "#277D5A",
  blue: "#4356A8",
};

function text(x, y, value, options = {}) {
  const {
    fill = colors.ink,
    size = 14,
    weight = 500,
    anchor = "start",
    letterSpacing = 0,
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${value}</text>`;
}

function card(x, y, width, height, options = {}) {
  const {
    fill = colors.card,
    stroke = colors.line,
    radius = 16,
    strokeWidth = 1,
  } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function statusPill(x, y, label, color, width) {
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="26" rx="13" fill="${color}18"/>`,
    `<circle cx="${x + 14}" cy="${y + 13}" r="4" fill="${color}"/>`,
    text(x + 26, y + 18, label, { fill: color, size: 11, weight: 700 }),
  ].join("\n");
}

function navItem(y, label, active = false) {
  return [
    active
      ? `<rect x="18" y="${y - 22}" width="164" height="42" rx="10" fill="#FFFFFF12"/>`
      : "",
    `<circle cx="38" cy="${y - 1}" r="5" fill="${active ? colors.accent : colors.sidebarMuted}"/>`,
    text(54, y + 4, label, {
      fill: active ? "#FFFFFF" : "#A7ABB4",
      size: 13,
      weight: active ? 650 : 500,
    }),
  ].join("\n");
}

function statCard(x, label, value, delta, color) {
  return [
    card(x, 190, 174, 94),
    text(x + 18, 218, label.toUpperCase(), {
      fill: colors.muted,
      size: 10,
      weight: 700,
      letterSpacing: 0.8,
    }),
    text(x + 18, 258, value, { size: 26, weight: 720 }),
    text(x + 150, 257, delta, {
      fill: color,
      size: 11,
      weight: 700,
      anchor: "end",
    }),
  ].join("\n");
}

function checkRow(y, label, detail) {
  return [
    `<line x1="256" y1="${y + 25}" x2="748" y2="${y + 25}" stroke="#ECE9E2"/>`,
    `<circle cx="276" cy="${y - 2}" r="13" fill="${colors.green}18"/>`,
    `<path d="M270 ${y - 2} l4 4 l8 -9" fill="none" stroke="${colors.green}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    text(302, y + 2, label, { size: 13, weight: 650 }),
    text(302, y + 19, detail, { fill: colors.muted, size: 10 }),
    text(728, y + 3, "PASSED", {
      fill: colors.green,
      size: 10,
      weight: 700,
      anchor: "end",
      letterSpacing: 0.5,
    }),
  ].join("\n");
}

function impactPanel() {
  return [
    card(814, 400, 350, 246, {
      fill: "#FFFEFC",
      stroke: "#D9D3C8",
      radius: 18,
    }),
    `<rect x="814" y="400" width="6" height="246" rx="3" fill="${colors.accent}"/>`,
    text(842, 436, "CHANGE IMPACT", {
      fill: colors.accent,
      size: 10,
      weight: 750,
      letterSpacing: 0.9,
    }),
    text(842, 474, "3 surfaces affected", { size: 22, weight: 720 }),
    text(842, 498, "A concise reviewer summary from the diff.", {
      fill: colors.muted,
      size: 11,
    }),
    `<rect x="842" y="520" width="72" height="28" rx="14" fill="#F1EEE7"/>`,
    `<rect x="922" y="520" width="84" height="28" rx="14" fill="#F1EEE7"/>`,
    `<rect x="1014" y="520" width="56" height="28" rx="14" fill="#F1EEE7"/>`,
    text(878, 539, "Admin", { size: 11, weight: 650, anchor: "middle" }),
    text(964, 539, "Calendar", { size: 11, weight: 650, anchor: "middle" }),
    text(1042, 539, "API", { size: 11, weight: 650, anchor: "middle" }),
    `<circle cx="850" cy="579" r="5" fill="${colors.green}"/>`,
    text(866, 583, "No migrations", { size: 12, weight: 600 }),
    `<circle cx="970" cy="579" r="5" fill="${colors.green}"/>`,
    text(986, 583, "No env changes", { size: 12, weight: 600 }),
    `<rect x="842" y="603" width="294" height="1" fill="#ECE8DF"/>`,
    text(842, 628, "Ready for reviewer context", {
      fill: colors.green,
      size: 11,
      weight: 700,
    }),
  ].join("\n");
}

function fixtureSvg(after) {
  return `<svg width="1200" height="720" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="720" fill="${colors.canvas}"/>
    <rect width="202" height="720" fill="${colors.sidebar}"/>
    <circle cx="38" cy="42" r="13" fill="${colors.accent}"/>
    <path d="M32 42 h12 M38 36 v12" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    ${text(60, 47, "SHIPBOARD", { fill: "#FFFFFF", size: 14, weight: 760, letterSpacing: 0.8 })}
    ${text(24, 94, "WORKSPACE", { fill: "#666C77", size: 9, weight: 750, letterSpacing: 1.2 })}
    ${navItem(130, "Release review", true)}
    ${navItem(178, "Deployments")}
    ${navItem(226, "Checks")}
    ${navItem(274, "Settings")}
    ${text(24, 676, "DEMO WORKSPACE", { fill: "#666C77", size: 9, weight: 750, letterSpacing: 1.1 })}
    ${text(24, 698, "Neutral component fixture", { fill: "#A7ABB4", size: 10 })}

    <rect x="202" width="998" height="78" fill="#FFFFFF" stroke="${colors.line}"/>
    ${text(240, 34, "release / web-v2.4.0", { fill: colors.muted, size: 11, weight: 650 })}
    ${statusPill(1028, 24, "candidate", colors.blue, 114)}

    ${text(240, 128, "Release review", { size: 30, weight: 760 })}
    ${text(240, 153, "Compare the candidate against main before promoting it.", { fill: colors.muted, size: 12 })}
    <rect x="1010" y="110" width="154" height="42" rx="12" fill="${colors.ink}"/>
    ${text(1087, 136, "Request approval", { fill: "#FFFFFF", size: 12, weight: 680, anchor: "middle" })}

    ${statCard(240, "Changed files", "7", "+2", colors.accent)}
    ${statCard(430, "Checks", "18", "all passed", colors.green)}
    ${statCard(620, "Approvals", "1", "required", colors.blue)}

    ${card(240, 310, 540, 336)}
    ${text(262, 346, "Deployment checks", { size: 15, weight: 700 })}
    ${text(262, 368, "Required signals before production promotion.", { fill: colors.muted, size: 10 })}
    ${checkRow(410, "Type safety", "Frontend and API contracts")}
    ${checkRow(476, "UI regression", "Matched desktop viewport")}
    ${checkRow(542, "Security scan", "Dependencies and secret detection")}
    ${checkRow(608, "Production readiness", "Deployment configuration")}

    ${card(814, 190, 350, 180)}
    ${text(838, 226, "Deployment", { size: 15, weight: 700 })}
    ${statusPill(1018, 208, "ready", colors.green, 116)}
    ${text(838, 266, "Target", { fill: colors.muted, size: 10, weight: 650 })}
    ${text(1138, 266, "Production", { size: 11, weight: 650, anchor: "end" })}
    <line x1="838" y1="284" x2="1138" y2="284" stroke="#ECE9E2"/>
    ${text(838, 310, "Commit", { fill: colors.muted, size: 10, weight: 650 })}
    ${text(1138, 310, "8f4c12a", { size: 11, weight: 650, anchor: "end" })}
    <line x1="838" y1="328" x2="1138" y2="328" stroke="#ECE9E2"/>
    ${text(838, 352, "Updated 2 minutes ago", { fill: colors.muted, size: 10 })}

    ${after ? impactPanel() : ""}
  </svg>`;
}

const specs = {
  before: {
    header: {
      height: 96,
      badge: "BEFORE · MAIN",
      title: "Focused component fixture · Release review",
      subtitle:
        "The existing UI ends after deployment checks — no reviewer summary exists.",
    },
    annotations: [
      {
        type: "rect",
        x: 814,
        y: 400,
        width: 350,
        height: 246,
        style: "dashed",
        label: "NO PRIOR EQUIVALENT",
      },
    ],
    output: { quality: 92 },
  },
  after: {
    header: {
      height: 96,
      badge: "AFTER · BRANCH",
      title: "Focused component fixture · Release review",
      subtitle:
        "A compact impact summary now gives reviewers context beside the checks.",
    },
    annotations: [
      {
        type: "rect",
        x: 814,
        y: 400,
        width: 350,
        height: 246,
        style: "solid",
        label: "NEW ON THIS BRANCH",
      },
    ],
    output: { quality: 92 },
  },
};

const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "annotate-screenshots-showcase-"),
);

try {
  await mkdir(showcaseDirectory, { recursive: true });
  for (const state of ["before", "after"]) {
    const rawPath = path.join(temporaryDirectory, `${state}.png`);
    const specPath = path.join(temporaryDirectory, `${state}.json`);
    const outputPath = path.join(showcaseDirectory, `${state}.jpg`);
    await sharp(Buffer.from(fixtureSvg(state === "after")))
      .png({ compressionLevel: 9 })
      .toFile(rawPath);
    await writeFile(specPath, JSON.stringify(specs[state], null, 2));
    const result = spawnSync(
      process.execPath,
      [
        renderer,
        "--input",
        rawPath,
        "--output",
        outputPath,
        "--spec",
        specPath,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    process.stdout.write(result.stdout);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
