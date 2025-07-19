"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) router.replace("/");
    });
  }, []);

  const signInWithProvider = async (provider) => {
    await supabase.auth.signInWithOAuth({ provider });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-6">登录 AI 图片融合工具</h1>
      <button onClick={() => signInWithProvider("google")}
        className="btn mb-2">Google 登录</button>
      <button onClick={() => signInWithProvider("github")}
        className="btn mb-2">GitHub 登录</button>
      {/* 邮箱登录可选扩展 */}
    </main>
  );
}
