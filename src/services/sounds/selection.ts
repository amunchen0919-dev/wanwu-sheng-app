import type { SoundAsset } from '../../types/domain';
import { builtinSounds } from './catalog';
export function createGroup(available: SoundAsset[], previous: string[] = [], random = Math.random): string[] {
  const ids = [...new Set([...available, ...builtinSounds].map(sound => sound.id))];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const result = ids.slice(0, 6);
  if (result.every(id => previous.includes(id)) && ids.length > 6) result[5] = ids.find(id => !previous.includes(id))!;
  return result;
}
export function chooseSound(selected: string[], id: string, liked: boolean) {
  return liked ? [...new Set([...selected, id])] : selected.filter(value => value !== id);
}
export function nextCard(index: number) { return (index + 1) % 6; }
