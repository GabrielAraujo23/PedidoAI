"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isTheme, resolveTheme, nextTheme, THEME_KEY, type Theme, type ThemeAplicado } from "@/lib/theme";
import { aplicarPaletaDoTema } from "@/lib/palette-cookie";

interface ThemeContextValue {
    tema: Theme;
    aplicado: ThemeAplicado;
    alternar: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    tema: "sistema", aplicado: "claro", alternar: () => {},
});

export function useTheme() {
    return useContext(ThemeContext);
}

function sistemaEscuro(): boolean {
    return typeof window !== "undefined"
        && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Estado inicial "sistema" para bater com o que o servidor renderiza. O
    // script inline do <head> já pintou a tela certa antes disto montar; aqui
    // só assumimos o controle.
    const [tema, setTema] = useState<Theme>("sistema");
    const [aplicado, setAplicado] = useState<ThemeAplicado>("claro");

    // Lê a preferência do aparelho depois da montagem. `localStorage` e
    // `matchMedia` não existem no servidor, então isto não pode acontecer
    // durante o render — o estado inicial "sistema" é só o que o HTML do
    // servidor consegue afirmar, e o script inline do <head> já pintou a tela
    // certa antes daqui.
    //
    // DÍVIDA CONHECIDA: isto dispara `react-hooks/set-state-in-effect`, e o
    // aviso tem razão — são dois renders na montagem. A correção de verdade é
    // `useSyncExternalStore`, que existe exatamente para ler store externo
    // (localStorage + matchMedia) sem cascata. Ficou de fora por ser reescrita
    // do provider inteiro no fim de um sprint grande.
    //
    // O que NÃO fazer: embrulhar em `queueMicrotask` só para o lint calar. Isso
    // esconde o mesmo comportamento atrás de um timing diferente e faz o
    // próximo leitor achar que estava resolvido.
    useEffect(() => {
        const salvo = window.localStorage.getItem(THEME_KEY);
        const inicial: Theme = isTheme(salvo) ? salvo : "sistema";
        setTema(inicial);
        setAplicado(resolveTheme(inicial, sistemaEscuro()));
    }, []);

    useEffect(() => {
        const escuro = aplicado === "escuro";
        document.documentElement.classList.toggle("dark", escuro);
        // A paleta da loja vive como estilo INLINE no documentElement, gravada
        // pelo script do <head>. Estilo inline vence qualquer CSS, então trocar
        // a classe `.dark` sozinha não muda cor nenhuma — o fundo só mudaria
        // recarregando, e o texto secundário ficaria com o tom do outro tema.
        aplicarPaletaDoTema(escuro);
    }, [aplicado]);

    // Quem está em "sistema" acompanha o aparelho ao vivo: trocar o tema do
    // celular ao anoitecer muda a tela sem recarregar.
    useEffect(() => {
        if (tema !== "sistema") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const aoMudar = () => setAplicado(mq.matches ? "escuro" : "claro");
        mq.addEventListener("change", aoMudar);
        return () => mq.removeEventListener("change", aoMudar);
    }, [tema]);

    const alternar = useCallback(() => {
        const proximo = nextTheme(tema, sistemaEscuro());
        window.localStorage.setItem(THEME_KEY, proximo);
        setTema(proximo);
        setAplicado(proximo);
    }, [tema]);

    return (
        <ThemeContext.Provider value={{ tema, aplicado, alternar }}>
            {children}
        </ThemeContext.Provider>
    );
}
