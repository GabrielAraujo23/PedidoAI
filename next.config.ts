import type { NextConfig } from "next";

// Supabase project URL — used in connect-src CSP directive.
// Falls back to wildcard if not set (development).
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : "*.supabase.co";

const securityHeaders = [
    // Prevent browsers from MIME-sniffing the content type
    { key: "X-Content-Type-Options", value: "nosniff" },

    // Block the site from being embedded in iframes (clickjacking protection)
    { key: "X-Frame-Options", value: "DENY" },

    // Minimal referrer info sent to external sites
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

    // Disable browser features not used by the app
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
    },

    // Content Security Policy
    // Notes:
    //  - script-src 'unsafe-inline'/'unsafe-eval' required by Next.js App Router
    //    (hydration scripts are inline). Remove in Next.js 15+ with nonce support.
    //  - connect-src lists every external service the app contacts
    //  - frame-ancestors 'none' blocks ALL iframe embedding (stronger than X-Frame-Options)
    {
        key: "Content-Security-Policy",
        value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://viacep.com.br https://brasilapi.com.br https://cep.awesomeapi.com.br https://nominatim.openstreetmap.org`,
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "frame-src 'none'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
        ].join("; "),
    },
];

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                // Apply to every route
                source: "/(.*)",
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
