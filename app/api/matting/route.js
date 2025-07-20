import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

// 初始化 Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 帮助函数：带重试逻辑的 fetch
async function fetchWithRetry(url, options, retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Calling Stability AI, attempt ${i + 1}/${retries}...`);
      const response = await fetch(url, options);
      // 如果请求成功，或遇到客户端错误（如4xx），则直接返回，不再重试
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      // 如果是服务器端错误 (5xx)，则等待后重试
      console.warn(`Attempt ${i + 1} failed with server status: ${response.status}. Retrying in ${delay / 1000}s...`);
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed with network error: ${error.message}. Retrying in ${delay / 1000}s...`);
      if (i === retries - 1) throw error; // 最后一次尝试失败则抛出错误
    }
    await new Promise(res => setTimeout(res, delay));
  }
  throw new Error('All retry attempts failed.');
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "未收到图片文件" }, { status: 400 });
    }

    // 1. 上传原图到 Supabase Storage
    const originalFileName = `${uuidv4()}-${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('fusion-images') // 你的 bucket 名称
      .upload(originalFileName, file);

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json({ error: '原图上传失败' }, { status: 500 });
    }

    const { data: { publicUrl: originalUrl } } = supabase.storage
      .from('fusion-images')
      .getPublicUrl(originalFileName);

    // 备份原始 Buffer，用于最终合成
    const originalFileBuffer = Buffer.from(await file.arrayBuffer());
    let bufferForApi = originalFileBuffer;
    const image = sharp(originalFileBuffer);
    const metadata = await image.metadata();

    // 如果图片过大，则缩放一个版本用于调用 API，以提高效率
    if (metadata.width > 1280 || metadata.height > 1280) {
      bufferForApi = await image.resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).toBuffer();
    }

    // 2. 调用 Stability AI API 进行抠图
    const stabilityFormData = new FormData();
    stabilityFormData.append('image', new Blob([bufferForApi]), file.name);

    const stabilityRes = await fetchWithRetry('https://api.stability.ai/v2beta/stable-image/edit/remove-background', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
        'Accept': 'application/json',
      },
      body: stabilityFormData,
    });

    if (!stabilityRes.ok) {
      const errorBody = await stabilityRes.text();
      console.error('Stability AI API error:', errorBody);
      return NextResponse.json({ error: `抠图失败: ${stabilityRes.statusText}` }, { status: 500 });
    }

    const data = await stabilityRes.json();
    const mattingBuffer = Buffer.from(data.image, 'base64');

    let mattedPng;
    try {
      const { width: origW, height: origH } = metadata;
      console.log(`Original image dimensions: ${origW}x${origH}`);

      // 使用 composite 方法进行合成，更加健壮
      console.log('Compositing matted image over a transparent canvas...');
      mattedPng = await sharp({
        create: {
          width: origW,
          height: origH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
      .composite([
        {
          input: mattingBuffer,
          gravity: 'center', // 将抠图结果居中放置
          blend: 'over',
        },
      ])
      .png()
      .toBuffer();
      console.log('Final image composed successfully.');

    } catch (sharpError) {
      console.error('Sharp image processing failed:', sharpError);
      return NextResponse.json({ error: '抠图后图像处理失败，请检查图片格式或联系技术支持' }, { status: 500 });
    }

    // 4. 上传抠图结果到 Supabase
    const mattedFileName = `${uuidv4()}-matted.png`;
    const { error: mattedUploadError } = await supabase.storage
      .from('fusion-images')
      .upload(mattedFileName, mattedPng);

    if (mattedUploadError) {
      console.error('Supabase matted upload error:', mattedUploadError);
      return NextResponse.json({ error: '抠图结果上传失败' }, { status: 500 });
    }

    const { data: { publicUrl: mattingUrl } } = supabase.storage
      .from('fusion-images')
      .getPublicUrl(mattedFileName);

    // 4. 返回两个 URL
    return NextResponse.json({ mattingUrl, originalUrl });

  } catch (e) {
    console.error('Matting API error:', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
