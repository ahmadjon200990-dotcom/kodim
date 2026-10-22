// Windows o'rnatuvchisi (NSIS). Nom va identifikator — packages/shared/src/brand.ts dan (Node 22.18+/24 TS'ni o'zi o'qiydi).
// Build: pnpm --filter @exam-ide/desktop dist  (SERVER_URL standart: https://teacher.<BRAND.domain>)
import { BRAND } from "../../packages/shared/src/brand.ts";

/** @type {import("electron-builder").Configuration} */
export default {
  appId: BRAND.appId,
  productName: BRAND.name,
  executableName: BRAND.name,
  copyright: `© ${new Date().getFullYear()} ${BRAND.name}`,
  directories: { output: "release", buildResources: "build" },
  // Faqat build natijasi: renderer/preload/main bundle. Renderer kutubxonalari bundle ichida.
  files: ["out/**", "package.json"],
  asar: true,
  // node-pty native moduli asar'dan tashqarida bo'lishi shart (conpty.dll, pty.node).
  asarUnpack: ["**/node_modules/node-pty/**"],
  // node-pty 1.1 N-API prebuild'lari bilan keladi — Electron uchun qayta kompilyatsiya kerak emas.
  npmRebuild: false,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build/icon.ico",
    artifactName: `${BRAND.name}-Setup-\${version}.\${ext}`,
    requestedExecutionLevel: "asInvoker",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: "always",
    createStartMenuShortcut: true,
    shortcutName: BRAND.name,
    uninstallDisplayName: BRAND.name,
    deleteAppDataOnUninstall: true,
  },
  // Production himoyasi: Node rejimi, --inspect, NODE_OPTIONS va asar'dan tashqaridagi kod o'chiriladi.
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
};
