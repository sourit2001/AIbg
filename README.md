# AI图片融合工具（Next.js + Supabase）

## 项目简介
本项目是一个基于 Next.js 和 Supabase 的多步骤 AI 图像融合 Web 应用。支持用户登录、图片上传、AI 抠图、AI 生成背景、AI 融合、进度与错误提示、图片展示等。

## 主要依赖
- Next.js 14+
- Supabase
- @supabase/auth-helpers-nextjs
- next/image
- ClipDrop API（抠图）
- Stability AI API（背景生成）

## 目录结构
- `app/page.js`：主页面组件
- `app/api/matting/route.js`：抠图 API 路由
- `app/api/ai-fuse/route.js`：AI 生成与融合 API 路由
- 其他如 `layout.js`、`auth/callback/route.js` 用于全局布局和登录回调

## 快速开始
```bash
npm install
cp .env.local.example .env.local
npx next dev
```

## 环境变量
请在 `.env.local` 中配置以下内容：
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
CLIPDROP_API_KEY=your_clipdrop_api_key
STABILITY_API_KEY=your_stability_api_key
```

## 版权声明
本项目仅供学习与个人研究使用，涉及的模型与 API 请遵守相关服务条款。
