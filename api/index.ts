import { createApp } from "../server.js";

const appPromise = createApp({ serveFrontend: false });

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === "string" ? value : null;
}

function restoreApiUrl(req: any) {
  const requestUrl = new URL(req.url || "/", "https://vercel.local");
  const pathFromQuery = requestUrl.searchParams.get("path") || firstQueryValue(req.query?.path);
  if (!pathFromQuery) {
    return;
  }

  requestUrl.searchParams.delete("path");
  const cleanPath = pathFromQuery.replace(/^\/+/, "");
  const queryString = requestUrl.searchParams.toString();
  req.url = `/api/${cleanPath}${queryString ? `?${queryString}` : ""}`;
}

export default async function handler(req: any, res: any) {
  restoreApiUrl(req);
  const app = await appPromise;
  return app(req, res);
}
