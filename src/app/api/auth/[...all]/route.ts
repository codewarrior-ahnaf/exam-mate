import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

export const { POST, PATCH, PUT, DELETE } = handlers;

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.includes("/oauth-popup/start")) {
    let userEmail: string | undefined;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (session?.user?.email) {
        userEmail = session.user.email;
      }
    } catch {
      // ignore
    }

    const response = await handlers.GET(request);
    const location = response.headers.get("location");
    if (location && location.includes("accounts.google.com")) {
      const googleUrl = new URL(location);
      if (userEmail) {
        googleUrl.searchParams.set("login_hint", userEmail);
      }
      const prompt = googleUrl.searchParams.get("prompt");
      if (prompt && prompt.includes("select_account")) {
        const cleaned = prompt.replace("select_account", "").trim();
        if (cleaned) {
          googleUrl.searchParams.set("prompt", cleaned);
        } else {
          googleUrl.searchParams.delete("prompt");
        }
      }
      const newHeaders = new Headers(response.headers);
      newHeaders.set("location", googleUrl.toString());
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }
    return response;
  }

  return handlers.GET(request);
}
