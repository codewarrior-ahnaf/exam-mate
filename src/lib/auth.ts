import { randomBytes } from "node:crypto";
import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";

type GoogleClientConfig = {
  web?: {
    client_id?: string;
    client_secret?: string;
  };
};

const googleConfigPath = path.join(process.cwd(), "gcalendercred.json");
let googleConfigError: Error | undefined;
let googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
let googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

try {
  const rawConfig = process.env.GOOGLE_CLIENT_CONFIG_JSON
    ?? (existsSync(googleConfigPath) ? readFileSync(googleConfigPath, "utf8") : undefined);
  if (rawConfig) {
    const config = JSON.parse(rawConfig) as GoogleClientConfig;
    googleClientId ||= config.web?.client_id ?? "";
    googleClientSecret ||= config.web?.client_secret ?? "";
  }
} catch (error) {
  googleConfigError = error instanceof Error ? error : new Error("Google OAuth configuration is invalid.");
}

function getLocalSecret() {
  const secretPath = path.join(process.cwd(), ".session_secret");
  try {
    return readFileSync(secretPath, "utf8").trim();
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const secret = randomBytes(48).toString("base64url");
  try {
    writeFileSync(secretPath, secret, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return secret;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      throw error;
    }
    return readFileSync(secretPath, "utf8").trim();
  }
}

const isProduction = process.env.NODE_ENV === "production";
const localSecret = isProduction ? "" : getLocalSecret();

function resolveBaseURL(): string {
  let raw = process.env.BETTER_AUTH_URL ?? process.env.FRONTEND_ORIGIN;
  if (raw) {
    raw = raw.split("#")[0].trim();
  }

  if (process.env.VERCEL) {
    if (!raw || raw.includes("localhost") || raw.includes("127.0.0.1")) {
      const vercelHost =
        process.env.VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_URL ||
        "exammate.vercel.app";
      raw = `https://${vercelHost}`;
    }
  }

  if (!raw) {
    return isProduction ? "https://exammate.vercel.app" : "http://localhost:3000";
  }

  // Prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    const url = new URL(raw);
    if (isProduction && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      url.protocol = "https:";
    }
    return url.origin;
  } catch {
    return isProduction ? "https://exammate.vercel.app" : "http://localhost:3000";
  }
}

const baseURL = resolveBaseURL();
const productionSecret = process.env.BETTER_AUTH_SECRET ?? "";
if (isProduction) {
  if (productionSecret.length < 32 && !process.env.VERCEL) {
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 characters in the Vercel environment.");
  }
}
const secret = process.env.BETTER_AUTH_SECRET || localSecret || "0123456789abcdef0123456789abcdef";
const databaseUri = process.env.DB_URI;
if (!databaseUri && !process.env.VERCEL) {
  throw new Error("Set DB_URI to your MongoDB connection string.");
}

const globalForMongo = globalThis as typeof globalThis & {
  mongoClient?: MongoClient;
};
const mongoClient = databaseUri
  ? (globalForMongo.mongoClient ?? new MongoClient(databaseUri))
  : (null as unknown as MongoClient);
if (process.env.NODE_ENV !== "production" && databaseUri) {
  globalForMongo.mongoClient = mongoClient;
}

export const auth = betterAuth({
  appName: "SEU Exam Routine",
  baseURL,
  secret,
  account: {
    encryptOAuthTokens: true,
    updateAccountOnSignIn: true,
    storeAccountCookie: false,
    storeStateStrategy: "database",
  },
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  },
  trustedOrigins: isProduction
    ? [
        new URL(baseURL).origin,
        "https://exammate.vercel.app",
        process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "",
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
      ].filter((origin): origin is string => Boolean(origin))
    : [
        process.env.BETTER_AUTH_URL,
        process.env.FRONTEND_ORIGIN,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ].filter((origin): origin is string => Boolean(origin)),
  rateLimit: {
    enabled: isProduction,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/social": { window: 60, max: 10 },
    },
  },
  database: mongodbAdapter(mongoClient.db()),
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      accessType: "offline",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    },
  },
});

export function assertAuthConfiguration() {
  if (googleConfigError) {
    throw new Error(`Google OAuth configuration could not be loaded: ${googleConfigError.message}`);
  }
  if (!googleClientId || !googleClientSecret) {
    throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or provide GOOGLE_CLIENT_CONFIG_JSON.");
  }
  if (isProduction && !process.env.BETTER_AUTH_SECRET) {
    throw new Error("Set BETTER_AUTH_SECRET to a private random value in production.");
  }
  if (isProduction && !process.env.AUTH_BRIDGE_SECRET) {
    throw new Error("Set AUTH_BRIDGE_SECRET to the same private random value on the web and API services.");
  }
}

export function getAuthBridgeSecret() {
  const bridgeSecret = process.env.AUTH_BRIDGE_SECRET;
  if (bridgeSecret) return bridgeSecret;
  if (isProduction) {
    throw new Error("AUTH_BRIDGE_SECRET is required in production.");
  }
  return process.env.SESSION_SECRET_KEY ?? localSecret;
}
