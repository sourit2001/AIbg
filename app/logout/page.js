"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LogoutPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  useEffect(() => {
    supabase.auth.signOut().then(() => router.replace("/login"));
  }, []);
  return <main className="min-h-screen flex items-center justify-center">正在登出...</main>;
}
