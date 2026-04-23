/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tạo standalone output cho Docker (giảm image size đáng kể)
  output: 'standalone',
};

export default nextConfig;
