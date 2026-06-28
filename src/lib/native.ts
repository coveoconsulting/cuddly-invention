import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

const BRAND = "#0b3d2e";

/**
 * Native integration for the packaged (Capacitor) Android app.
 * Safe to call on web: it no-ops when not running on a native platform.
 */
export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: BRAND });
  } catch {
    /* status bar not available on this platform */
  }

  // Android hardware back button: navigate back within the SPA, exit at root.
  try {
    await App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch {
    /* ignore */
  }

  // Hide the splash once the web layer has booted.
  window.setTimeout(() => {
    void SplashScreen.hide().catch(() => undefined);
  }, 400);
}
