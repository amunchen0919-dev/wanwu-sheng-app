import type { SoundAsset } from '../../types/domain';
const definitions = [
  ['glass', '玻璃杯的轻响'], ['wood', '木块敲击'], ['rain', '细雨沙沙'],
  ['bell', '温柔钟声'], ['water', '水滴回响'], ['wind', '微风低语'],
  ['drum', '低鼓脉动'], ['chime', '清脆风铃'], ['shaker', '沙锤节拍'], ['pluck', '弹拨琴音'],
];
/** 全部为项目脚本合成的声音意象，不冒充实地采样。 */
export const builtinSounds: SoundAsset[] = definitions.map(([id, name]) => ({
  id: `builtin-${id}`, name, source: 'builtin', createdAt: 0, duration: 2,
  mimeType: 'audio/wav', builtinUrl: `/assets/sounds/${id}.wav`, tags: ['合成示例'],
}));
export function soundById(id: string) { return builtinSounds.find(sound => sound.id === id); }
