"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Admin registration was moved to /loginadmin
export default function RegisterPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/loginadmin");
    }, [router]);
    return null;
}
