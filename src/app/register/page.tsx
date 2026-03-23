"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Rota descontinuada — redireciona para a página principal
export default function RegisterPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/login");
    }, [router]);
    return null;
}
