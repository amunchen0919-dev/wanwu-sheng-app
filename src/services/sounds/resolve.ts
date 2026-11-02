import type { SoundAsset } from '../../types/domain';
import { builtinSounds } from './catalog';
import { soundRepository } from '../storage/sounds';
/** 后续编曲通过素材ID读取真实音频字节，内置和个人素材统一处理。 */
export async function resolveSound(id: string): Promise<SoundAsset> {
  const sound = builtinSounds.find(asset => asset.id === id) ?? (await soundRepository.list()).find(asset => asset.id === id);
  if (!sound) throw new Error('声音素材不存在');
  return sound;
}
export async function soundBytes(asset: SoundAsset): Promise<ArrayBuffer> {
  if (asset.blobId) {
    const blob = await soundRepository.getBlob(asset.blobId);
    if (!blob) throw new Error('录音文件缺失');
    return blob.arrayBuffer();
  }
  if (!asset.builtinUrl) throw new Error('声音文件缺失');
  const response = await fetch(asset.builtinUrl);
  if (!response.ok) throw new Error('声音文件无法读取');
  return response.arrayBuffer();
}
export async function resolveSoundBytes(id: string) { return soundBytes(await resolveSound(id)); }
