"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Client login was moved to /login
export default function ClienteEntrarPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/login");
    }, [router]);
    return null;
}
