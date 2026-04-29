import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${manrope.variable} antialiased`}
      >
        <TooltipProvider>
          <CartProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </CartProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
