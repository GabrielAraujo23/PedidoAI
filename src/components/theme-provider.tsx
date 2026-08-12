"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isTheme, resolveTheme, nextTheme, THEME_KEY, type Theme, type ThemeAplicado } from "@/lib/theme";

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

    useEffect(() => {
        // setState roda dentro de um microtask, não direto no corpo do
        // efeito: mesmo timing (antes da pintura), mas fora do padrão que o
        // lint de efeitos sinaliza como possível cascata de renders.
        queueMicrotask(() => {
            const salvo = window.localStorage.getItem(THEME_KEY);
            const inicial: Theme = isTheme(salvo) ? salvo : "sistema";
            setTema(inicial);
            setAplicado(resolveTheme(inicial, sistemaEscuro()));
        });
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", aplicado === "escuro");
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
