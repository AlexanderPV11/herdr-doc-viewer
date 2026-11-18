// File icons for the Files panel: one glyph and one color per kind of file or folder.
// iconFor(name, isDir, open) -> { path, color }  (path is for svg(), color for .text_color()).
// Edit the tables below to change an icon or a color; add an SVG to ./icons/ for a new glyph.

const P = (n) => `mods/<TU-MOD>/icons/${n}.svg`;

// Colors (readable on dark and light themes).
const C = {
  js: "#e5b800", ts: "#3b82f6", json: "#d9a441", html: "#e8693b", css: "#3da0e0", scss: "#d6568f",
  md: "#5aa9e6", text: "#8b95a5", img: "#3fb98a", sheet: "#2fa66a", pdf: "#e5484d", doc: "#3b82f6",
  slides: "#f08a2c", zip: "#b9873a", sh: "#4cc38a", env: "#d6a23a", cfg: "#8b95a5", py: "#4b8bbe",
  java: "#e0702f", php: "#7a86b8", go: "#29b6c5", rust: "#d2683f", docker: "#2496ed", git: "#f1502f",
  sql: "#c084fc", vue: "#41b883", angular: "#dd3b3b", lock: "#8b95a5", def: "#9aa4b2",
};

const BY_NAME = {
  "package.json": ["json", C.js], "package-lock.json": ["lock", C.lock], "yarn.lock": ["lock", C.lock],
  "pnpm-lock.yaml": ["lock", C.lock], "tsconfig.json": ["json", C.ts], "angular.json": ["json", C.angular],
  "nest-cli.json": ["json", C.angular], "dockerfile": ["config", C.docker], "docker-compose.yml": ["config", C.docker],
  "docker-compose.yaml": ["config", C.docker], ".dockerignore": ["config", C.docker], ".gitignore": ["config", C.git],
  ".gitattributes": ["config", C.git], ".editorconfig": ["config", C.cfg], ".prettierrc": ["config", C.cfg],
  ".eslintrc": ["config", C.cfg], "eslint.config.js": ["config", C.cfg], "readme.md": ["text", C.md],
  "claude.md": ["text", "#d97757"], "agents.md": ["text", "#d97757"], "license": ["text", C.text], "makefile": ["terminal", C.sh],
};

const BY_EXT = {
  js: ["code", C.js], mjs: ["code", C.js], cjs: ["code", C.js], jsx: ["code", C.js],
  ts: ["code", C.ts], tsx: ["code", C.ts], mts: ["code", C.ts],
  json: ["json", C.json], jsonc: ["json", C.json], json5: ["json", C.json],
  yml: ["config", C.cfg], yaml: ["config", C.cfg], toml: ["config", C.cfg], ini: ["config", C.cfg], conf: ["config", C.cfg],
  xml: ["web", C.html], html: ["web", C.html], htm: ["web", C.html],
  css: ["style", C.css], scss: ["style", C.scss], sass: ["style", C.scss], less: ["style", C.css],
  md: ["text", C.md], mdx: ["text", C.md], txt: ["text", C.text], log: ["text", C.text], rtf: ["text", C.text],
  png: ["image", C.img], jpg: ["image", C.img], jpeg: ["image", C.img], gif: ["image", C.img], webp: ["image", C.img],
  svg: ["image", C.img], ico: ["image", C.img], bmp: ["image", C.img], avif: ["image", C.img],
  csv: ["sheet", C.sheet], tsv: ["sheet", C.sheet], xls: ["sheet", C.sheet], xlsx: ["sheet", C.sheet], ods: ["sheet", C.sheet],
  pdf: ["pdf", C.pdf], doc: ["text", C.doc], docx: ["text", C.doc], odt: ["text", C.doc],
  ppt: ["pdf", C.slides], pptx: ["pdf", C.slides],
  zip: ["archive", C.zip], rar: ["archive", C.zip], "7z": ["archive", C.zip], tar: ["archive", C.zip], gz: ["archive", C.zip], tgz: ["archive", C.zip],
  sh: ["terminal", C.sh], bash: ["terminal", C.sh], zsh: ["terminal", C.sh], ps1: ["terminal", C.sh], bat: ["terminal", C.sh], cmd: ["terminal", C.sh],
  env: ["lock", C.env], pem: ["lock", C.env], key: ["lock", C.env], crt: ["lock", C.env],
  py: ["code", C.py], java: ["code", C.java], php: ["code", C.php], go: ["code", C.go], rs: ["code", C.rust],
  c: ["code", C.ts], h: ["code", C.ts], cpp: ["code", C.ts], cs: ["code", C.go], rb: ["code", C.angular], kt: ["code", C.sql],
  sql: ["code", C.sql], vue: ["code", C.vue], svelte: ["code", C.angular], dart: ["code", C.css],
};

// Folders by name get their own color; every other folder uses the default.
const FOLDERS = {
  src: "#4c9be8", app: "#4c9be8", lib: "#4c9be8", dist: "#8b95a5", build: "#8b95a5", out: "#8b95a5", node_modules: "#7fae5a",
  ".git": C.git, ".github": C.git, ".vscode": "#3b82f6", ".claude": "#d97757", docs: "#5aa9e6", doc: "#5aa9e6",
  test: "#e5a13a", tests: "#e5a13a", spec: "#e5a13a", scripts: C.sh, public: C.img, assets: C.img, images: C.img,
  docker: C.docker, config: C.cfg, environments: C.env, proyectos: "#c084fc", agentes: "#d97757", pipeline: C.sh,
};

export function iconFor(name, isDir, open) {
  const lower = String(name).toLowerCase();
  if (isDir) return { path: P(open ? "folder-open" : "folder"), color: FOLDERS[lower] ?? "#6ea8d8" };
  const hit = BY_NAME[lower];
  if (hit) return { path: P(hit[0]), color: hit[1] };
  if (lower.startsWith(".env")) return { path: P("lock"), color: C.env };
  if (lower.endsWith(".d.ts")) return { path: P("code"), color: C.ts };
  if (lower.endsWith(".spec.ts") || lower.endsWith(".test.ts")) return { path: P("code"), color: "#e5a13a" };
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  const e = BY_EXT[ext];
  return e ? { path: P(e[0]), color: e[1] } : { path: P("file"), color: C.def };
}
