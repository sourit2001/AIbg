/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "smixpzlkhscakdgrddun.supabase.co",
      },
      {
        protocol: 'https',
        hostname: 'clipdrop-api.co',
      },
      {
        protocol: 'https',
        hostname: 'your-ai-image-domain.com',
      },
    ],
  },
};

module.exports = nextConfig;
