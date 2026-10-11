import { createHmac } from "node:crypto";
import { getAuthBridgeSecret } from "@/lib/auth";

export function createAuthBridgeHeaders(
  method: string,
  pathname: string,
  userId: string,
  email: string,
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = [method.toUpperCase(), pathname, userId, email, timestamp].join("\n");
  const signature = createHmac("sha256", getAuthBridgeSecret()).update(payload).digest("hex");
  return {
    "x-seu-user-id": userId,
    "x-seu-user-email": email,
    "x-seu-auth-timestamp": timestamp,
    "x-seu-auth-signature": signature,
  };
}
