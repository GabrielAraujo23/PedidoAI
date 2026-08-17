import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import { BrandProvider } from "@/components/brand-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/context/CartContext";
import { CopyProvider } from "@/components/copy-provider";
import { lerOverridesDaLoja } from "@/lib/copy/servidor";

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

/**
 * O layout raiz é `async` e lê o cookie de tenant para trazer o texto da loja
 * já resolvido. Isso torna as rotas dinâmicas — custo assumido de propósito:
 * este é um SaaS com sessão em quase tudo, e a alternativa (buscar o texto no
 * cliente, como o BrandProvider faz com a marca) trocaria esse custo por texto
 * mudando na cara de quem está lendo.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const copyOverrides = await lerOverridesDaLoja();

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
        {/* Os valores repetem os de src/lib/palette.ts porque este
            script não pode importar módulo — ele roda antes de tudo.
            Ao mudar uma família lá, mude aqui. O teste de palette.ts
            protege os valores originais; esta cópia não tem rede. */}
        <script
          // Aplica a cor da loja antes da primeira pintura, pelo mesmo
          // motivo do script de tema: o React monta depois do HTML
          // chegar, e até lá o visitante já viu a cor errada. Aqui isso
          // seria pior que no tema — é a marca da loja piscando para a
          // do fornecedor em toda navegação.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )pedidoai_paleta=([^;]*)/);if(!m)return;var p=decodeURIComponent(m[1]).split('|');var F={creme:{c:['#F7F2EA','#FFFFFF','#EFE9E1','#1C1917','#57534E','#D6CDBF'],e:['#17130F','#221C17','#2C241E','#F0E9E0','#B0A398','#453A31']},neve:{c:['#F8FAFC','#FFFFFF','#F1F5F9','#0F172A','#475569','#CBD5E1'],e:['#0F1115','#191C22','#23272F','#E8ECF2','#A3ADBB','#363B45']},areia:{c:['#F5F3F0','#FFFFFF','#EAE7E2','#1F1D1A','#55514B','#D3CEC6'],e:['#151412','#201E1B','#2A2724','#EFEDE9','#ADA79F','#423E39']},grafite:{c:['#F4F4F5','#FFFFFF','#E4E4E7','#18181B','#52525B','#CBCBD1'],e:['#101012','#1B1B1F','#26262B','#EDEDF0','#A1A1AA','#3A3A41']}};var f=F[p[0]]||F.creme;var d=document.documentElement.classList.contains('dark');var v=d?f.e:f.c;var hx=/^#[0-9A-Fa-f]{6}$/;var a=hx.test(p[d?2:1]||'')?p[d?2:1]:(d?'#E8935A':'#C2410C');var af=hx.test(p[d?4:3]||'')?p[d?4:3]:'#FFFFFF';var s=document.documentElement.style;s.setProperty('--background',v[0]);s.setProperty('--card',v[1]);s.setProperty('--popover',v[1]);s.setProperty('--muted',v[2]);s.setProperty('--secondary',v[2]);s.setProperty('--accent',v[2]);s.setProperty('--foreground',v[3]);s.setProperty('--card-foreground',v[3]);s.setProperty('--popover-foreground',v[3]);s.setProperty('--secondary-foreground',v[3]);s.setProperty('--accent-foreground',v[3]);s.setProperty('--muted-foreground',v[4]);s.setProperty('--border',v[5]);s.setProperty('--input',v[5]);s.setProperty('--primary',a);s.setProperty('--primary-foreground',af);s.setProperty('--sidebar',v[0]);s.setProperty('--sidebar-foreground',v[3]);s.setProperty('--sidebar-border',v[5]);s.setProperty('--sidebar-primary',a);}catch(_){}})()`,
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
                <CopyProvider overrides={copyOverrides}>
                  <AuthProvider>
                    {children}
                  </AuthProvider>
                </CopyProvider>
              </BrandProvider>
            </CartProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
