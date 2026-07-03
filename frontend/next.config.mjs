/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Компактный self-contained сервер для Docker (.next/standalone).
  output: 'standalone',
  // Не раскрываем стек в заголовках ответа.
  poweredByHeader: false,
};

export default nextConfig;
