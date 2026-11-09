import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 모노레포 루트 기준으로 파일 추적 (상위 package-lock.json 감지 경고 방지)
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  turbopack: { root: path.resolve(process.cwd(), '../..') },
};

export default nextConfig;
