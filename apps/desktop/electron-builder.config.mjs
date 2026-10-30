
import { BRAND } from "../../packages/shared/src/brand.ts";

/** @type {import("electron-builder").Configuration} */
export default {
  appId: BRAND.appId,
  productName: BRAND.name,
  executableName: BRAND.name,
  copyright: `© ${new Date().getFullYear()} ${BRAND.name}`,

  directories: {
    output: "release",
    buildResources: "build",
  },

  files: ["out/**", "package.json"],
  asar: true,
  asarUnpack: ["**/node_modules/node-pty/**"],
  npmRebuild: false,

  // Windows
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

  // macOS
  mac: {
    target: [
      { target: "dmg", arch: ["x64", "arm64"] },
    ],
    category: "public.app-category.developer-tools",
  },

  // Linux
  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Development",
    artifactName: "Kodim-\${version}-\${arch}.\${ext}",
  },

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
