/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Компактный self-contained сервер для Docker (.next/standalone).
  output: 'standalone',
};

export default nextConfig;
