import { Capacitor } from "@capacitor/core";
import type { GeoPoint } from "../types";

/**
 * Device capabilities (GPS, camera, barcode) for the field-sales force.
 * Each helper runs the native Capacitor plugin on Android/iOS and degrades
 * gracefully to a Web API (or no-op) when running in a browser.
 */

export function isNativeDevice(): boolean {
  return Capacitor.isNativePlatform();
}

/** Current GPS position, or null if unavailable / denied. */
export async function getCurrentPosition(): Promise<GeoPoint | null> {
  if (isNativeDevice()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const req = await Geolocation.requestPermissions();
        if (req.location !== "granted") return null;
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }

  if (!("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

export interface CapturedPhoto {
  dataUrl: string;
  blob: Blob;
  filename: string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Capture a photo from the device camera. Returns null if cancelled. */
export async function takePhoto(): Promise<CapturedPhoto | null> {
  if (isNativeDevice()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 60,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      if (!photo.dataUrl) return null;
      const blob = dataUrlToBlob(photo.dataUrl);
      return { dataUrl: photo.dataUrl, blob, filename: `photo-${Date.now()}.${photo.format || "jpg"}` };
    } catch {
      return null;
    }
  }

  // Web fallback: hidden file input with camera capture hint.
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), blob: file, filename: file.name || `photo-${Date.now()}.jpg` });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Scan a barcode/QR. Returns the raw value, or null if cancelled/unsupported. */
export async function scanBarcode(): Promise<string | null> {
  if (isNativeDevice()) {
    try {
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
      const supported = await BarcodeScanner.isSupported();
      if (!supported.supported) return null;
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== "granted" && perm.camera !== "limited") return null;
      const { barcodes } = await BarcodeScanner.scan();
      return barcodes[0]?.rawValue ?? null;
    } catch {
      return null;
    }
  }

  // Web fallback: native BarcodeDetector when available, otherwise manual prompt.
  const detector = (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  if (!detector) {
    const manual = window.prompt("Saisir le code-barres (scanner natif requis sur mobile) :");
    return manual ? manual.trim() : null;
  }
  // BarcodeDetector exists but a full camera-stream UI is heavy for web; prompt as a safe default.
  const manual = window.prompt("Saisir ou scanner le code-barres :");
  return manual ? manual.trim() : null;
}
