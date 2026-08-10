import { createContext, useContext } from "react";
import type { AdminRole } from "@/lib/tenant-status";

export interface AdminSession {
    adminId: string;
    email: string;
    /**
     * Papel da conta. Só decide o que a interface MOSTRA — o item de
     * Contratações na sidebar. Quem decide o que a conta PODE fazer é o
     * requireOwner() no servidor, que lê o papel do banco. Forjar este campo no
     * navegador revela um link e nada além dele.
     */
    role: AdminRole;
}

export interface ClientSession {
    clientId: string;
    name: string;
    phone: string;
    adminId: string;
}

export interface AuthContextValue {
    adminSession: AdminSession | null;
    loading: boolean;
    signOut: () => void;
    setAdminSession: (session: AdminSession) => void;
}

export const AuthContext = createContext<AuthContextValue>({
    adminSession: null,
    loading: true,
    signOut: () => {},
    setAdminSession: () => {},
});

export function useAuth() {
    return useContext(AuthContext);
}

export const ADMIN_SESSION_KEY = "pedidoai_admin_session";
