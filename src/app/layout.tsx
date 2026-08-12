import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import { BrandProvider } from "@/components/brand-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/context/CartContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PedidoAI - Gestão Inteligente",
  description: "Sistema inteligente de gestão de pedidos de construção",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#F7F2EA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          // Roda ANTES da primeira pintura. Sem isto, quem escolheu
          // escuro vê um flash branco a cada carregamento: o React só
          // monta depois que o HTML chega, e aí já é tarde. Não há
          // outra forma — qualquer coisa presa ao ciclo de vida do
          // React chega atrasada.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pedidoai_tema');var e=t==='escuro'||((!t||t==='sistema')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(e)document.documentElement.classList.add('dark')}catch(_){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${manrope.variable} antialiased`}
      >
        <ThemeProvider>
          <TooltipProvider>
            <CartProvider>
              <BrandProvider>
                <AuthProvider>
                  {children}
                </AuthProvider>
              </BrandProvider>
            </CartProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
