/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute backend base URL for the packaged mobile app (e.g. https://fct5.vercel.app). Empty on web. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
