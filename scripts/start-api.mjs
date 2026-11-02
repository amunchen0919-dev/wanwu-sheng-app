// 跨平台显式指定服务模式；只改变当前进程，不修改.env或密钥。
const mode = process.argv[2];
if (!['mock', 'live'].includes(mode)) {
  console.error('请指定 mock 或 live；未启动服务。');
  process.exit(1);
}
process.env.ENABLE_AUDIO_LAB = 'true';
process.env.STABLE_AUDIO_MODE = mode;
await import('../server/index.ts');
