import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isTrustedMutationRequest, getClientIp, checkRateLimit } from "@/lib/api-security";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

function isSafeGoogleUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return (
      (host === "drive.google.com" ||
        host === "docs.google.com" ||
        host === "sheets.google.com" ||
        host === "drive.usercontent.google.com" ||
        host.endsWith(".google.com") ||
        host.endsWith(".googleusercontent.com")) &&
      (u.protocol === "https:" || u.protocol === "http:")
    );
  } catch {
    return false;
  }
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const COMMON_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/octet-stream,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://drive.google.com/",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

type DriveTarget = {
  id: string;
  isFolder?: boolean;
  isPublishedSheet?: boolean;
  isSpreadsheet?: boolean;
};

function parseDriveLink(raw: string): DriveTarget | null {
  let cleaned = raw.trim();
  if (!cleaned) return null;
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (!["drive.google.com", "docs.google.com", "sheets.google.com"].includes(hostname)) {
    return null;
  }

  // Folder check
  if (url.pathname.includes("/folders/")) {
    const folderMatch = url.pathname.match(/\/folders\/([\w-]{10,})/);
    return { id: folderMatch ? folderMatch[1] : "", isFolder: true };
  }

  // Published sheet: /spreadsheets/.../d/e/2PACX-.../
  const pubMatch = url.pathname.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/e\/([\w-]{20,})/);
  if (pubMatch) {
    return { id: pubMatch[1], isPublishedSheet: true, isSpreadsheet: true };
  }

  // Standard Google Sheet: /spreadsheets/.../d/ID/
  const sheetMatch = url.pathname.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]{10,})/);
  if (sheetMatch) {
    return { id: sheetMatch[1], isSpreadsheet: true };
  }

  // Drive file: /file/.../d/ID/
  const fileMatch = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/);
  if (fileMatch) {
    return { id: fileMatch[1], isSpreadsheet: false };
  }

  // Generic /d/ID/
  const genericMatch = url.pathname.match(/\/d\/([\w-]{10,})/);
  if (genericMatch) {
    return {
      id: genericMatch[1],
      isSpreadsheet: url.pathname.includes("spreadsheets") || hostname === "sheets.google.com",
    };
  }

  // Query parameter: ?id=ID
  const idParam = url.searchParams.get("id");
  if (idParam && /^[\w-]{10,}$/.test(idParam)) {
    return { id: idParam, isSpreadsheet: false };
  }

  return null;
}

function sniffExtension(bytes: Uint8Array): "xlsx" | "xls" | "csv" {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return "xls";
  return "csv";
}

function isHtmlPayload(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 1024))
    .toLowerCase();
  return (
    prefix.includes("<!doctype html") ||
    prefix.includes("<html") ||
    prefix.includes("<head") ||
    prefix.includes("<body") ||
    prefix.includes("<script")
  );
}

function extractHtmlError(html: string, hadLoginRedirect?: boolean): string {
  if (hadLoginRedirect) {
    return "This Google Drive link is private or restricted. Please open Google Drive, click 'Share', and change General Access to 'Anyone with the link can view' (Viewer). Or download the .xlsx file and upload it directly.";
  }

  const lower = html.toLowerCase();
  if (
    lower.includes("accounts.google.com") ||
    lower.includes("servicelogin") ||
    lower.includes("you need permission") ||
    lower.includes("need access") ||
    lower.includes("request access")
  ) {
    return "This Google Drive link is private or restricted. Please open Google Drive, click 'Share', and change General Access to 'Anyone with the link can view' (Viewer). Or download the .xlsx file and upload it directly.";
  }

  if (
    lower.includes("file not found") ||
    lower.includes("page not found") ||
    lower.includes("not exist")
  ) {
    return "The file was not found on Google Drive. Please verify the link or upload the .xlsx file directly.";
  }

  if (
    lower.includes("download quota") ||
    lower.includes("too many users") ||
    lower.includes("virus scan")
  ) {
    return "Google Drive download limit reached. Please download the file to your computer and upload the .xlsx file directly.";
  }

  return "Could not download this file from Google Drive. Make sure General Access is set to 'Anyone with the link can view' or upload the .xlsx file directly.";
}

async function fetchWithCookieJar(
  initialUrl: string,
  cookieJar: Record<string, string>,
  maxRedirects = 5
): Promise<{ response: Response; finalUrl: string; hitLoginRedirect?: boolean }> {
  let currentUrl = initialUrl;

  for (let i = 0; i < maxRedirects; i++) {
    if (!isSafeGoogleUrl(currentUrl)) {
      throw new Error("Invalid or untrusted download URL target.");
    }

    const cookieHeader = Object.entries(cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const res = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        ...COMMON_HEADERS,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });

    // Capture cookies
    const rawSetCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie")].filter((v): v is string => Boolean(v));

    for (const cookieStr of rawSetCookies) {
      if (cookieStr) {
        const firstPart = cookieStr.split(";")[0]?.trim();
        if (firstPart) {
          const eqIdx = firstPart.indexOf("=");
          if (eqIdx > 0) {
            const key = firstPart.slice(0, eqIdx).trim();
            const val = firstPart.slice(eqIdx + 1).trim();
            cookieJar[key] = val;
          }
        }
      }
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) return { response: res, finalUrl: currentUrl };
      const nextUrl = new URL(location, currentUrl).toString();
      if (!isSafeGoogleUrl(nextUrl)) {
        throw new Error("Redirected to an untrusted domain.");
      }
      const lowerNext = nextUrl.toLowerCase();
      if (lowerNext.includes("accounts.google.com") || lowerNext.includes("servicelogin")) {
        // Redirection to login means endpoint is unauthenticated or restricted
        return { response: res, finalUrl: nextUrl, hitLoginRedirect: true };
      }
      currentUrl = nextUrl;
      continue;
    }

    return { response: res, finalUrl: currentUrl };
  }

  throw new Error("Too many redirects while accessing Google Drive.");
}

function extractDownloadLinkFromHtml(html: string, baseUrl: string): string | null {
  // 1. Direct downloadUrl in script/state
  const jsonMatch = html.match(/"downloadUrl"\s*:\s*"([^"]+)"/i);
  if (jsonMatch && jsonMatch[1]) {
    const raw = jsonMatch[1]
      .replace(/\\u003d/g, "=")
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
    if (isSafeGoogleUrl(raw)) return raw;
  }

  // 2. Direct drive.usercontent link in href
  const usercontentMatch = html.match(
    /href="([^"]*drive\.usercontent\.google\.com\/download[^"]*)"/i
  );
  if (usercontentMatch && usercontentMatch[1]) {
    const raw = usercontentMatch[1].replace(/&amp;/g, "&");
    if (isSafeGoogleUrl(raw)) return raw;
  }

  // 3. /uc?export=download href
  const ucMatch =
    html.match(/href="(\/uc\?export=download[^"]*)"/i) ||
    html.match(/id="uc-download-link"[^>]*href="([^"]+)"/i);
  if (ucMatch && ucMatch[1]) {
    const full = ucMatch[1].replace(/&amp;/g, "&");
    const parsed = new URL(full, baseUrl).toString();
    if (isSafeGoogleUrl(parsed)) return parsed;
  }

  // 4. Form #download-form
  const formMatch = html.match(/<form[^>]*id="download-form"[^>]*action="([^"]+)"/i);
  if (formMatch && formMatch[1]) {
    const actionUrl = new URL(formMatch[1].replace(/&amp;/g, "&"), baseUrl);
    const inputs = [
      ...html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi),
    ];
    for (const [, name, val] of inputs) {
      actionUrl.searchParams.set(name, val);
    }
    const finalFormUrl = actionUrl.toString();
    if (isSafeGoogleUrl(finalFormUrl)) return finalFormUrl;
  }

  return null;
}

function extractConfirmToken(
  html: string,
  cookieJar: Record<string, string>,
  fileId: string
): string | null {
  if (cookieJar[`download_warning_${fileId}`]) {
    return cookieJar[`download_warning_${fileId}`];
  }
  if (cookieJar["download_warning"]) {
    return cookieJar["download_warning"];
  }
  const match = html.match(/confirm=([0-9A-Za-z_-]{4,})/i);
  return match ? match[1] : null;
}

async function downloadDriveFile(
  target: DriveTarget
): Promise<{ buffer: Uint8Array; ext: "xlsx" | "xls" | "csv" } | { error: string }> {
  if (target.isFolder) {
    return {
      error:
        "This is a Google Drive folder link. Please open the Excel file inside the folder and share that file's link.",
    };
  }

  // 1. Published Google Sheet
  if (target.isPublishedSheet) {
    const pubUrls = [
      `https://docs.google.com/spreadsheets/d/e/${target.id}/pub?output=xlsx`,
      `https://docs.google.com/spreadsheets/d/e/${target.id}/pub?output=csv`,
    ];
    for (const url of pubUrls) {
      try {
        const { response } = await fetchWithCookieJar(url, {});
        if (response.ok) {
          const buf = new Uint8Array(await response.arrayBuffer());
          if (!isHtmlPayload(buf) && buf.byteLength > 0) {
            return { buffer: buf, ext: sniffExtension(buf) };
          }
        }
      } catch {
        // try next
      }
    }
  }

  // 2. Standard Google Sheet (/spreadsheets/d/ID)
  if (target.isSpreadsheet) {
    const sheetEndpoints = [
      `https://docs.google.com/spreadsheets/d/${target.id}/export?format=xlsx`,
      `https://docs.google.com/spreadsheets/d/${target.id}/gviz/tq?tqx=out:csv`,
      `https://docs.google.com/spreadsheets/d/${target.id}/export?format=csv`,
    ];

    let hadLogin = false;
    for (const endpoint of sheetEndpoints) {
      try {
        const { response, hitLoginRedirect } = await fetchWithCookieJar(endpoint, {});
        if (hitLoginRedirect) {
          hadLogin = true;
          continue;
        }
        if (response.ok) {
          const buf = new Uint8Array(await response.arrayBuffer());
          if (!isHtmlPayload(buf) && buf.byteLength > 0) {
            return { buffer: buf, ext: sniffExtension(buf) };
          }
        }
      } catch {
        // try next
      }
    }

    if (hadLogin) {
      return {
        error:
          "This Google Sheet is private or restricted to university accounts. Please click Share in Google Drive and set General Access to 'Anyone with the link can view' (Viewer).",
      };
    }
  }

  // 3. Google Drive File downloads (uploaded .xlsx, .xls, .csv, or general files)
  const cookieJar: Record<string, string> = {};
  let lastHtml = "";
  let hadLoginRedirect = false;

  const fileAttempts = [
    `https://docs.google.com/uc?export=download&id=${target.id}`,
    `https://drive.google.com/uc?export=download&id=${target.id}&confirm=t`,
    `https://drive.usercontent.google.com/download?id=${target.id}&export=download&authuser=0&confirm=t`,
  ];

  console.log(`[Drive API] Processing target: ID=${target.id}, isSpreadsheet=${Boolean(target.isSpreadsheet)}`);

  for (const url of fileAttempts) {
    try {
      console.log(`[Drive API] Fetching: ${url}`);
      const { response, finalUrl, hitLoginRedirect } = await fetchWithCookieJar(url, cookieJar);
      console.log(`[Drive API] Result: ${url} -> status=${response.status}, hitLoginRedirect=${Boolean(hitLoginRedirect)}`);
      if (hitLoginRedirect) {
        hadLoginRedirect = true;
        continue;
      }

      const buf = new Uint8Array(await response.arrayBuffer());
      if (response.ok && !isHtmlPayload(buf) && buf.byteLength > 0) {
        return { buffer: buf, ext: sniffExtension(buf) };
      }

      if (buf.byteLength > 0) {
        const html = new TextDecoder().decode(buf);
        lastHtml = html;

        // Check if there is an extracted direct download link or confirmation form
        const extractedUrl = extractDownloadLinkFromHtml(html, finalUrl);
        if (extractedUrl) {
          const confirmed = await fetchWithCookieJar(extractedUrl, cookieJar);
          const confBuf = new Uint8Array(await confirmed.response.arrayBuffer());
          if (confirmed.response.ok && !isHtmlPayload(confBuf) && confBuf.byteLength > 0) {
            return { buffer: confBuf, ext: sniffExtension(confBuf) };
          }
        }

        // Check if there is a confirm token
        const token = extractConfirmToken(html, cookieJar, target.id);
        if (token) {
          const retryWithToken = `https://drive.google.com/uc?export=download&id=${target.id}&confirm=${token}`;
          const tokenRes = await fetchWithCookieJar(retryWithToken, cookieJar);
          const tokenBuf = new Uint8Array(await tokenRes.response.arrayBuffer());
          if (tokenRes.response.ok && !isHtmlPayload(tokenBuf) && tokenBuf.byteLength > 0) {
            return { buffer: tokenBuf, ext: sniffExtension(tokenBuf) };
          }
        }
      }
    } catch {
      // try next
    }
  }

  // 4. Try fetching the file's view preview page (drive.google.com/file/d/ID/view) to find the downloadUrl
  try {
    const viewUrl = `https://drive.google.com/file/d/${target.id}/view`;
    const { response, finalUrl, hitLoginRedirect } = await fetchWithCookieJar(viewUrl, cookieJar);
    if (hitLoginRedirect) {
      hadLoginRedirect = true;
    } else {
      const buf = new Uint8Array(await response.arrayBuffer());
      const html = new TextDecoder().decode(buf);
      if (html) {
        lastHtml = html;
        const extractedUrl = extractDownloadLinkFromHtml(html, finalUrl);
        if (extractedUrl) {
          const dlRes = await fetchWithCookieJar(extractedUrl, cookieJar);
          const dlBuf = new Uint8Array(await dlRes.response.arrayBuffer());
          if (dlRes.response.ok && !isHtmlPayload(dlBuf) && dlBuf.byteLength > 0) {
            return { buffer: dlBuf, ext: sniffExtension(dlBuf) };
          }
        }
      }
    }
  } catch {
    // try fallback
  }

  // 5. Fallback: In case the file was converted or opened in Google Sheets
  if (!target.isSpreadsheet) {
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${target.id}/gviz/tq?tqx=out:csv`;
      const { response, hitLoginRedirect } = await fetchWithCookieJar(gvizUrl, {});
      if (!hitLoginRedirect && response.ok) {
        const buf = new Uint8Array(await response.arrayBuffer());
        if (!isHtmlPayload(buf) && buf.byteLength > 0) {
          return { buffer: buf, ext: "csv" };
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    error: extractHtmlError(lastHtml, hadLoginRedirect),
  };
}

async function downloadViaGoogleDriveApi(
  fileId: string,
  accessToken: string
): Promise<{ buffer: Uint8Array; ext: "xlsx" | "xls" | "csv" } | { error: string } | null> {
  let capturedError = "";

  // 1. Direct binary download for uploaded files (.xlsx, .xls, .csv)
  try {
    console.log(`[Drive API] Calling Google Drive API v3 (direct media) for fileId=${fileId}`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    console.log(`[Drive API] Direct media response status: ${res.status}`);
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > 0 && !isHtmlPayload(buf)) {
        console.log(`[Drive API] Successfully downloaded ${buf.byteLength} bytes via Drive API!`);
        return { buffer: buf, ext: sniffExtension(buf) };
      }
    } else {
      const errText = await res.text();
      console.log(`[Drive API] Direct media non-ok body: ${errText.slice(0, 300)}`);
      try {
        const parsed = JSON.parse(errText) as { error?: { message?: string; status?: string } };
        if (parsed.error?.message) {
          const msg = parsed.error.message;
          if (msg.includes("Google Drive API has not been used") || msg.includes("is not enabled")) {
            capturedError = "Google Drive API is not enabled in your Google Cloud project. Please enable Google Drive API in Google Cloud Console.";
          } else if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("scope")) {
            capturedError = "Google Drive permission is missing. Please disconnect and reconnect Google to grant Drive access.";
          } else if (res.status === 404 || msg.toLowerCase().includes("not found")) {
            capturedError = "File not found or your connected Google account does not have permission to view it. Make sure you connect with your Southeast University (@seu.edu.bd) account.";
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }
  } catch (err) {
    console.log("[Drive API] Direct media fetch error:", err);
  }

  // 2. Export endpoint for native Google Sheets
  try {
    console.log(`[Drive API] Calling Google Drive API v3 (export xlsx) for fileId=${fileId}`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&supportsAllDrives=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    console.log(`[Drive API] Export response status: ${res.status}`);
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > 0 && !isHtmlPayload(buf)) {
        console.log(`[Drive API] Successfully exported ${buf.byteLength} bytes via Drive API!`);
        return { buffer: buf, ext: "xlsx" };
      }
    } else {
      const errText = await res.text();
      console.log(`[Drive API] Export non-ok body: ${errText.slice(0, 300)}`);
    }
  } catch (err) {
    console.log("[Drive API] Export fetch error:", err);
  }

  if (capturedError) {
    return { error: capturedError };
  }

  return null;
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`drive_fetch:${clientIp}`, 20, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
      { status: 429 }
    );
  }

  let link = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    link = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!link) {
    return NextResponse.json({ error: "Please paste a Google Drive link." }, { status: 400 });
  }

  console.log(`[Drive API] Received link from client: "${link}"`);
  const target = parseDriveLink(link);
  if (!target) {
    return NextResponse.json(
      {
        error:
          "Please paste a valid Google Drive or Google Sheets share link (e.g. drive.google.com/file/d/...).",
      },
      { status: 400 }
    );
  }

  // 1. Check if the user has an active Google OAuth session with Drive access
  let userGoogleToken: string | null = null;
  try {
    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });
    if (session) {
      const accounts = await auth.api.listUserAccounts({ headers: reqHeaders });
      const googleAccount = accounts?.find((account) => account.providerId === "google");
      if (googleAccount) {
        const tokenRes = await auth.api.getAccessToken({
          body: { accountId: googleAccount.id },
          headers: reqHeaders,
        });
        if (tokenRes?.accessToken) {
          userGoogleToken = tokenRes.accessToken;
        }
      }
    }
  } catch (authErr) {
    console.log("[Drive API] Session check error:", authErr);
  }

  // 2. If Google access token is available, attempt download via official Google Drive API
  let driveApiError: string | null = null;
  if (userGoogleToken) {
    console.log(`[Drive API] Attempting authenticated download using user Google token for ${target.id}`);
    const apiResult = await downloadViaGoogleDriveApi(target.id, userGoogleToken);
    if (apiResult && "buffer" in apiResult && apiResult.buffer.byteLength > 0 && apiResult.buffer.byteLength <= MAX_BYTES) {
      return new Response(apiResult.buffer as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": `drive-routine.${apiResult.ext}`,
          "Cache-Control": "no-store",
        },
      });
    } else if (apiResult && "error" in apiResult) {
      driveApiError = apiResult.error;
    }
  }

  // 3. Otherwise (or as fallback), attempt public scraper download
  try {
    const result = await downloadDriveFile(target);
    if ("error" in result) {
      return NextResponse.json(
        {
          error: driveApiError || result.error,
          fileId: target.id,
          requiresGoogleAuth: !userGoogleToken,
        },
        { status: 422 }
      );
    }

    if (result.buffer.byteLength === 0 || result.buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "The file is empty or larger than 15 MB." },
        { status: 413 }
      );
    }

    return new Response(result.buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-File-Name": `drive-routine.${result.ext}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not reach Google Drive. Please check your network and try again.",
      },
      { status: 502 }
    );
  }
}
