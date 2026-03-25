import { createContext, useContext } from "react";

export interface AdminSession {
    adminId: string;
    email: string;
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
