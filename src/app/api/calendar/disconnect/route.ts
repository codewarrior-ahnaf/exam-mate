import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isTrustedMutationRequest } from "@/lib/api-security";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) {
      return NextResponse.json({ error: "A valid session is required to disconnect Google." }, { status: 401 });
    }

    const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
    const googleAccount = accounts.find((account) => account.providerId === "google");
    if (googleAccount) {
      const token = await auth.api.getAccessToken({
        body: { accountId: googleAccount.id },
        headers: requestHeaders,
      });
      const revokeResponse = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: token.accessToken }),
      });

      if (!revokeResponse.ok) {
        const details = await revokeResponse.json().catch(() => ({})) as { error?: string };
        if (details.error !== "invalid_token") {
          return NextResponse.json(
            { error: "Google could not revoke Calendar access. Please try disconnecting again." },
            { status: 502 }
          );
        }
      }
    }

    return NextResponse.json({ disconnected: true });
  } catch {
    return NextResponse.json(
      { error: "The server could not disconnect Google. Check the auth and database setup, then try again." },
      { status: 503 }
    );
  }
}
