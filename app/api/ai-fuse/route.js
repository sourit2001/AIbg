import { NextResponse } from 'next/server';

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
function rgbToHsl(r, g, b) {
  r /= 255, g /= 255, b /= 255;

  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;

  if (max == min) {
    h = s = 0; // achromatic
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }

    h /= 6;
  }

  return [ h, s, l ];
}

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

      // --- AI动态提示词增强逻辑 ---
      // 根据用户要求，更新meta-prompt，强制要求LLM在扩写时，必须包含清晰度、光线和风格的描述
      const metaPrompt = `As a prompt engineer for a text-to-image AI, expand the user's simple prompt into a rich, detailed, photorealistic scene. It is crucial to include specific keywords related to image clarity (e.g., '8k', 'ultra-detailed', 'sharp focus'), lighting (e.g., 'cinematic lighting', 'soft light', 'volumetric lighting'), and style (e.g., 'photorealistic', 'masterpiece', 'professional photography').

User's simple prompt: "${prompt}"

Your expanded, detailed prompt in English:`

      // 使用 OpenRouter API 进行英文提示词扩写
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      console.log('OPENROUTER_API_KEY:', OPENROUTER_API_KEY); // 临时调试用，确认 token 是否被正确读取
      const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemma-3n-e2b-it:free',
          messages: [
            { role: 'user', content: metaPrompt }
          ],
          max_tokens: 256,
          temperature: 0.8
        }),
      });
      const orData = await orResponse.json();
      let enhancedPrompt = prompt; // 默认fallback
      if (orData.choices && orData.choices[0] && orData.choices[0].message && orData.choices[0].message.content) {
        enhancedPrompt = orData.choices[0].message.content.trim();
        console.log('AI-Generated Enhanced Prompt:', enhancedPrompt);
      } else {
        console.error('OpenRouter prompt expansion failed:', orData);
        return NextResponse.json({ error: orData?.error?.message || 'AI prompt generation failed' }, { status: 502 });
      }

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

      // --- 高级颜色融合：使用高斯模糊的背景作为光源，并用原图作为遮罩 --- 

      // 1. 创建一个高斯模糊的背景图层，作为柔和的光源
      const blurredBgLayer = await sharp(resizedBackgroundBuffer)
        // .blur(15) // 根据用户要求，暂时取消高斯模糊，以保留背景细节
        .toBuffer();

      // 直接将抠图主体（mattingBuffer）按 alpha 遮罩叠加到背景，不做光影层叠加
      const finalFusedBuffer = await sharp(resizedBackgroundBuffer)
        .composite([
          {
            input: mattingBuffer,
            blend: 'over' // 按 alpha 正常叠加
          }
        ])
        .toBuffer();

      // 直接返回最终融合的 buffer
      const fusedUrl = await uploadImageToSupabase(finalFusedBuffer, `fused-${uuidv4()}.png`);
      return NextResponse.json({ fusedUrl });


    }

    return NextResponse.json({ error: "无效的操作" }, { status: 400 });

  } catch (e) {
    console.error('AI Fuse API error:', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
