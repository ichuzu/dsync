import { createServer, type Server } from "node:http";
import { shell } from "electron";
import { verifySteamLogin } from "../../src/lib/steam";

/**
 * Steam OpenID 2.0 sign-in for the desktop app.
 *
 * The login page is deliberately NOT rendered inside the app. Showing a
 * provider's password form in an embedded view is the anti-pattern native
 * OAuth/OpenID guidance exists to prevent: the user can't see the real URL or
 * the TLS padlock, so they can't tell a genuine Steam page from one the app
 * drew, and the app could read the credentials out of its own webview.
 *
 * Instead this follows the loopback-redirect pattern:
 *
 *   1. bind an HTTP server to 127.0.0.1 on an OS-assigned port
 *   2. open the *system browser* at steamcommunity.com, with return_to
 *      pointing back at that loopback address
 *   3. the user authenticates in their own browser, where the address bar and
 *      certificate are visible and their password manager works
 *   4. Steam redirects the browser to loopback with a signed assertion, which
 *      is replayed to Steam (mode=check_authentication) before being trusted
 *
 * The assertion is verified server-side, so a request forged at the loopback
 * port cannot mint a session.
 */

/** Abandon the flow if the user never finishes in the browser. */
const TIMEOUT_MS = 5 * 60 * 1000;

const page = (title: string, message: string, accent: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title><style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
       background:#0e1015;color:#e8eaf0;
       font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  .card{text-align:center;padding:40px 48px;border:1px solid #232733;
        border-radius:14px;background:#141824;max-width:420px}
  h1{margin:0 0 8px;font-size:20px;color:${accent}}
  p{margin:0;color:#98a0b3}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;

let active: Server | null = null;

/**
 * Runs the whole flow and resolves with the verified 64-bit Steam ID.
 * Rejects if the user cancels, the assertion fails verification, or it times out.
 */
export function signInWithSteam(): Promise<string> {
  // Only one sign-in can be in flight; a second press reuses nothing and would
  // leak a listener, so tear down any previous attempt first.
  active?.close();
  active = null;

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      active = null;
      fn();
    };

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (!url.pathname.startsWith("/steam-callback")) {
        res.writeHead(404).end();
        return;
      }

      try {
        const steamId = await verifySteamLogin(url.search);
        if (!steamId) throw new Error("Steam could not verify the sign-in.");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("Signed in", "You can close this tab and return to Dsync.", "#22d3ee"));
        finish(() => resolve(steamId));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          page("Sign-in failed", "Dsync could not verify that sign-in. Please try again.", "#f87171"),
        );
        finish(() => reject(err instanceof Error ? err : new Error("Steam sign-in failed")));
      }
    });

    const timer = setTimeout(
      () => finish(() => reject(new Error("Steam sign-in timed out."))),
      TIMEOUT_MS,
    );

    server.on("error", (err) => finish(() => reject(err)));

    // Port 0 asks the OS for a free port; loopback-only so nothing on the
    // network can reach it.
    server.listen(0, "127.0.0.1", () => {
      active = server;
      const address = server.address();
      if (!address || typeof address === "string") {
        return finish(() => reject(new Error("Could not open a local callback port.")));
      }

      const realm = `http://127.0.0.1:${address.port}`;
      const params = new URLSearchParams({
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": `${realm}/steam-callback`,
        "openid.realm": realm,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
      });

      void shell.openExternal(`https://steamcommunity.com/openid/login?${params}`);
    });
  });
}

/** Drops any in-flight sign-in, e.g. when the app is quitting. */
export function cancelSteamSignIn(): void {
  active?.close();
  active = null;
}
