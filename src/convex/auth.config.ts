import type { AuthConfig } from "convex/server";

// The app has no login: no route is gated and no provider asks the user for
// credentials. The lone entry below is the deployment's own Convex Auth
// provider (CONVEX_SITE_URL is always provided by Convex), kept so the auth
// component still validates its own session tokens. The freebuff.com
// federated provider was removed on purpose — it referenced
// VLY_CONVEX_AUTH_ISSUER, which Convex requires to be set on every push,
// blocking local `npx convex dev` for a sign-in nobody uses.
export default {
  providers: [
    // The deployment's own provider: it self-issues JWTs (iss =
    // CONVEX_SITE_URL, no `kid` header) validated via OIDC discovery at
    // `${domain}/.well-known/openid-configuration`, served by
    // auth.addHttpRoutes() in convex/http.ts. No route asks the user to
    // sign in — this entry only keeps the auth component's plumbing valid
    // at deploy time. Do NOT convert it to `type: "customJwt"`: that path
    // rejects tokens without a `kid` header.
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
