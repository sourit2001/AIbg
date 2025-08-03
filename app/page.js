"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Image from "next/image";

export default function HomePage() {
  // 状态管理
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [originalUrl, setOriginalUrl] = useState("");
  const [mattingUrl, setMattingUrl] = useState("");
  const [bgPrompt, setBgPrompt] = useState("");

  const [bgCandidates, setBgCandidates] = useState([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [selectedBg, setSelectedBg] = useState("");
  const [fusedUrl, setFusedUrl] = useState("");
  const [fusing, setFusing] = useState(false);
  const [error, setError] = useState("");

  // Supabase 客户端
  const supabase = createClientComponentClient();

  // 登录检查
  const router = useRouter();
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.replace("/login");
      } else {
        setUser(data.user);
      }
    };
    checkUser();
  }, [router, supabase.auth]);

  // 上传图片
  const handleUpload = async (e) => {
    setError("");
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/matting", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "抠图失败，请重试");
      }
      setMattingUrl(data.mattingUrl);
      setOriginalUrl(data.originalUrl || "");
      setStep(2);
    } catch (err) {
      setError(err.message);
      setStep(1); // 失败则停留在第一步
    } finally {
      setUploading(false);
    }
  };

  // 生成背景
  const handleGenerateBg = async () => {
    // Allow generation on step 2 (initial) and step 3 (regenerate)
    if ((step !== 2 && step !== 3) || !mattingUrl || !bgPrompt || bgLoading) return;

    // If regenerating from step 3, go back to a loading state view
    if (step === 3) {
      setStep(2);
    }
    
    setError("");
    setBgLoading(true);
    setBgCandidates([]); // 清空旧的候选
    setSelectedBg("");
    
    try {
      const res = await fetch("/api/ai-fuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-background", prompt: bgPrompt, mattingUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "背景生成失败，请重试");
      }
      setBgCandidates(data.backgrounds || []);
      setStep(3);
    } catch (err) {
      setError(err.message);
      setStep(2); // 失败则停留在第二步
    } finally {
      setBgLoading(false);
    }
  };

  // 融合图片
  const handleFuse = async () => {
    if (step !== 3 || !selectedBg || fusing) return;
    setError("");
    setFusing(true);
    try {
      const res = await fetch("/api/ai-fuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fuse-image",
          mattingUrl,
          backgroundUrl: selectedBg,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "融合失败，请重试");
      }
      setFusedUrl(data.fusedUrl);
      setStep(4);
    } catch (err) {
      setError(err.message);
      setStep(3);
    } finally {
      setFusing(false);
    }
  };

  // 下载图片
  const handleDownload = () => {
    if (!fusedUrl) return;
    const link = document.createElement('a');
    link.href = fusedUrl;
    link.download = `fused-image-${new Date().getTime()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 重新开始
  const handleRestart = () => {
    setStep(1);
    setOriginalUrl("");
    setMattingUrl("");
    setBgPrompt("");
    setBgCandidates([]);
    setSelectedBg("");
    setFusedUrl("");
    setError("");
  };

  // UI 渲染
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">AI 图片融合工具</h1>
        {user && (
          <button onClick={() => supabase.auth.signOut()} className="btn-secondary">登出</button>
        )}
      </header>

      <main className="bg-white shadow-md rounded-lg p-6 min-h-[600px]">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">出错了：</strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
      
        {/* Step 1: 上传 */}
        {step === 1 && (
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">第一步：上传你的图片</h2>
            <p className="text-gray-600 mb-6">上传一张图片，我们将自动为您抠出主体。</p>
            <label htmlFor="upload-button" className={`btn-primary px-8 py-4 text-lg ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {uploading ? '正在抠图...' : '选择图片'}
            </label>
            <input
              id="upload-button"
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
            <div className="mt-4 text-gray-500 text-sm">支持 JPG, PNG, WebP 等格式，最大 5MB</div>
          </div>
        )}

        {/* Step 2: 抠图预览 + 生成背景 */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">第二步：描述背景</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
              <div className="text-center">
                <h3 className="font-semibold mb-2">主体预览</h3>
                <div className="p-2 border rounded-lg bg-gray-100">
                  {mattingUrl && <img src={mattingUrl} alt="抠图结果" className="w-full h-auto object-contain max-h-80" />}
                </div>
              </div>
              <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">输入背景描述</label>
                  <textarea
                    value={bgPrompt}
                    onChange={(e) => setBgPrompt(e.target.value)}
                    placeholder="例如：未来城市的夜景，赛博朋克风格"
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="3"
                  />
                </div>
                <button 
                  type="button" 
                  onClick={handleGenerateBg} 
                  disabled={!bgPrompt || bgLoading}
                  className="btn-primary w-full mt-4 py-3">
                  {bgLoading ? '正在生成...' : '生成背景'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 选择背景并融合 */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">第三步：选择心仪的背景</h2>
            {bgLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold">正在重新生成背景...</h3>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {bgCandidates.map((url, idx) => (
                  url && (
                    <div key={idx} 
                         className={`rounded-lg overflow-hidden shadow-md transition-all cursor-pointer border-4 ${selectedBg === url ? 'border-blue-500' : 'border-transparent'}`}
                         onClick={() => setSelectedBg(url)}>
                      <img src={url} alt={`背景候选 ${idx + 1}`} className="w-full h-full object-cover" />
                    </div>
                  )
                ))}
              </div>
            )}
            <div className="flex justify-center gap-4 mt-6">
              <button type="button" onClick={handleGenerateBg} disabled={bgLoading} className="btn-secondary">不满意，再生成一次</button>
              <button type="button" onClick={handleFuse} disabled={!selectedBg || fusing} className="btn-primary">
                {fusing ? '融合中...' : '开始融合'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: 融合结果 */}
        {step === 4 && (
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">最终效果</h2>
            <div className="inline-block shadow-lg rounded-lg overflow-hidden border">
              {fusedUrl && <img src={fusedUrl} alt="融合图片" className="max-w-full h-auto" style={{ maxWidth: '80vw', maxHeight: '70vh' }} />}
            </div>
            <div className="mt-6 flex justify-center gap-4">
              <button type="button" onClick={handleDownload} className="btn-primary">下载图片</button>
              <button type="button" onClick={handleRestart} className="btn-secondary">再试一次</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
