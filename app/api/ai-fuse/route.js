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
    const { action, prompt, mattingUrl, backgroundUrl, aspectRatio } = await req.json();

    // --- Action 1: 生成背景图片 ---
    if (action === "generate-background") {
      if (!prompt || !mattingUrl || !aspectRatio) {
        return NextResponse.json({ error: '缺少prompt、抠图URL或比例参数' }, { status: 400 });
      }

      console.log(`Generating background with prompt: "${prompt}", ratio: ${aspectRatio}`);

      const stabilityFormData = new FormData();
      stabilityFormData.append('prompt', prompt);
      stabilityFormData.append('output_format', 'png'); // 使用png保证质量
      stabilityFormData.append('aspect_ratio', aspectRatio); // 直接使用用户选择的比例

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
      if (!mattingUrl || !backgroundUrl || !aspectRatio) {
        return NextResponse.json({ error: "缺少抠图、背景图URL或比例参数" }, { status: 400 });
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

      // 计算用户选择比例的最终尺寸
      const ratioMap = {
        '9:16': { w: 9, h: 16 },
        '1:1': { w: 1, h: 1 },
        '3:4': { w: 3, h: 4 },
        '16:9': { w: 16, h: 9 }
      };
      
      const ratio = ratioMap[aspectRatio] || ratioMap['1:1'];
      const baseSize = 1024;
      let finalWidth, finalHeight;
      
      if (ratio.w >= ratio.h) {
        finalWidth = baseSize;
        finalHeight = Math.round(baseSize * ratio.h / ratio.w);
      } else {
        finalHeight = baseSize;
        finalWidth = Math.round(baseSize * ratio.w / ratio.h);
      }
      
      console.log(`融合目标尺寸: ${finalWidth}x${finalHeight} (${aspectRatio})`);
      
      // 获取抠图原始尺寸
      const mattingMeta = await sharp(mattingBuffer).metadata();
      console.log(`抠图原始尺寸: ${mattingMeta.width}x${mattingMeta.height}`);
      
      // 计算抠图在新比例下的合适尺寸（保持主体大小合理）
      const mattingScale = Math.min(
        finalWidth / mattingMeta.width * 0.8,  // 留一些边距
        finalHeight / mattingMeta.height * 0.8
      );
      const mattingNewWidth = Math.round(mattingMeta.width * mattingScale);
      const mattingNewHeight = Math.round(mattingMeta.height * mattingScale);
      
      console.log(`抠图调整到: ${mattingNewWidth}x${mattingNewHeight}`);
      
      // 调整背景到目标尺寸
      const resizedBackgroundBuffer = await sharp(backgroundBuffer)
        .resize(finalWidth, finalHeight, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();
      
      // 调整抠图尺寸并转为PNG
      const mattingPngBuffer = await sharp(mattingBuffer)
        .resize(mattingNewWidth, mattingNewHeight, { fit: 'contain' })
        .png()
        .toBuffer();

      // 计算抠图在背景中的居中位置
      const left = Math.round((finalWidth - mattingNewWidth) / 2);
      const top = Math.round((finalHeight - mattingNewHeight) / 2);
      
      console.log(`抠图位置: left=${left}, top=${top}`);
      
      // 使用 sharp 将抠图合成到背景图上（居中放置）
      const fusedImageBuffer = await sharp(resizedBackgroundBuffer)
        .composite([{ 
          input: mattingPngBuffer, 
          left: left, 
          top: top 
        }])
        .png()
        .toBuffer();

      const fileName = `${uuidv4()}-fused.png`;
      const fusedUrl = await uploadImageToSupabase(fusedImageBuffer, fileName);

      return NextResponse.json({ fusedUrl });
    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });

  } catch (e) {
    console.error('AI Fuse API error:', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
