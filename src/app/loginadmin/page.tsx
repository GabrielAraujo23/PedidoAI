"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Esta rota foi descontinuada — redireciona para a página principal
export default function LoginAdminRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/login");
    }, [router]);
    return null;
}
