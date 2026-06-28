import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "com.clerivo.app",
  appName: "coveoconsulting",
  webDir: "dist",
  server: {
    // https scheme → WebView origin is https://localhost (secure context).
    androidScheme: "https",
  },
  plugins: {
    // Route fetch/XHR through the native HTTP client so cross-origin calls to
    // the deployed backend work without browser CORS / third-party-cookie limits.
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0b3d2e",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    // Resize the WebView when the keyboard opens so fixed footers (e.g. the
    // WhatsApp composer) stay visible above it.
    Keyboard: {
      resize: KeyboardResize.Native,
    },
  },
};

export default config;
