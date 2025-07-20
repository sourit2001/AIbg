import { NextResponse } from "next/server";

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

// 初始化 Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);



// Helper: 上传图片 buffer 到 Supabase
async function uploadImageToSupabase(buffer, fileName) {
  const { error } = await supabase.storage
    .from('fusion-images')
    .upload(fileName, buffer, { contentType: 'image/png' });
  if (error) {
    throw new Error(`Supabase upload error: ${error.message}`);
  }
  const { data: { publicUrl } } = supabase.storage
    .from('fusion-images')
    .getPublicUrl(fileName);
  return publicUrl;
}

export async function POST(req) {
  try {
    const { action, prompt, mattingUrl, backgroundUrl } = await req.json();

    // --- Action 1: 生成背景图片 ---
    if (action === "generate-background") {
      if (!prompt || !mattingUrl) {
        return NextResponse.json({ error: '缺少prompt或抠图URL参数' }, { status: 400 });
      }

      // 自动优化提示词
      const enhancedPrompt = `${prompt}, masterpiece, best quality, ultra-detailed, photorealistic, 8k, sharp focus`;
      console.log(`Generating background with enhanced prompt: "${enhancedPrompt}"`);

      // 从抠图URL获取图片尺寸
      const mattingResponse = await fetch(mattingUrl);
      if (!mattingResponse.ok) {
        return NextResponse.json({ error: "无法下载抠图以获取尺寸" }, { status: 500 });
      }
      const mattingBuffer = Buffer.from(await mattingResponse.arrayBuffer());
      const mattingMeta = await sharp(mattingBuffer).metadata();

      // 将尺寸调整为64的倍数以符合API要求
      const roundTo64 = (n) => Math.max(64, Math.round(n / 64) * 64);
      const targetWidth = roundTo64(mattingMeta.width);
      const targetHeight = roundTo64(mattingMeta.height);
      console.log(`以原图比例为准，生成背景尺寸: ${targetWidth}x${targetHeight}`);

      const stabilityFormData = new FormData();
      stabilityFormData.append('prompt', enhancedPrompt);
      stabilityFormData.append('output_format', 'png');
      stabilityFormData.append('width', targetWidth);
      stabilityFormData.append('height', targetHeight);

      const stabilityRes = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
          'Accept': 'image/*',
        },
        body: stabilityFormData,
      });

      if (!stabilityRes.ok) {
        const errorBody = await stabilityRes.text();
        console.error('Stability AI background generation error:', errorBody);
        return NextResponse.json({ error: '背景生成失败，请检查提示词或联系支持' }, { status: 500 });
      }

      const bgBuffer = Buffer.from(await stabilityRes.arrayBuffer());
      const bgFileName = `${uuidv4()}-background.png`;
      const publicUrl = await uploadImageToSupabase(bgBuffer, bgFileName);

      // 返回单张高质量背景图
      return NextResponse.json({ backgrounds: [publicUrl] });
    }

    // --- Action 2: 融合图片 (使用 Stability AI Inpainting) ---
    else if (action === "fuse-image") {
      if (!mattingUrl || !backgroundUrl) {
        return NextResponse.json({ error: "缺少抠图或背景图URL参数" }, { status: 400 });
      }

      // 下载背景图和抠图
      const [backgroundResponse, mattingResponse] = await Promise.all([
        fetch(backgroundUrl),
        fetch(mattingUrl)
      ]);

      if (!backgroundResponse.ok || !mattingResponse.ok) {
        return NextResponse.json({ error: "无法下载用于融合的图片" }, { status: 500 });
      }

      const backgroundBuffer = Buffer.from(await backgroundResponse.arrayBuffer());
      const mattingBuffer = Buffer.from(await mattingResponse.arrayBuffer());

      // 获取抠图原始尺寸，以此作为最终图片的尺寸
      const mattingMeta = await sharp(mattingBuffer).metadata();
      const finalWidth = mattingMeta.width;
      const finalHeight = mattingMeta.height;
      console.log(`融合目标尺寸将以原图为准: ${finalWidth}x${finalHeight}`);

      // 将背景图调整为与抠图完全相同的尺寸，裁剪以填充
      const resizedBackgroundBuffer = await sharp(backgroundBuffer)
        .resize(finalWidth, finalHeight, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();

      // 直接将原始抠图（未经缩放）合成到调整好的背景上
      const bgImage = sharp(resizedBackgroundBuffer);

      // --- 颜色融合增强：分析背景色调并应用到前景 ---
      // 1. 获取背景图的主要颜色统计数据
      const bgStats = await bgImage.stats();
      // 从 most dominant color 中提取 R, G, B 值
      const dominantColor = bgStats.dominant;

      // 2. 将背景的主色调作为滤镜应用到抠图上，模拟环境光
      const colorCorrectedMattingBuffer = await sharp(mattingBuffer)
        .tint(dominantColor)
        .toBuffer();

      // 3. 核心融合逻辑：将经过颜色校正的抠图叠加到背景上
      const fusedBuffer = await bgImage
        .composite([{ input: colorCorrectedMattingBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();

      const fileName = `${uuidv4()}-fused.png`;
      const fusedUrl = await uploadImageToSupabase(fusedBuffer, fileName);

      return NextResponse.json({ fusedUrl });
    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });

  } catch (e) {
    console.error('AI Fuse API error:', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
