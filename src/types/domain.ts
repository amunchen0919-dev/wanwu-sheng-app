export type RhythmEvent = {
  id: string; time: number; duration: number; velocity: number;
  source: 'touch' | 'mouse' | 'keyboard' | 'hardware';
};
export type SoundAsset = {
  id: string; name: string; source: 'builtin' | 'recording' | 'photo'; createdAt: number;
  duration?: number; mimeType?: string; blobId?: string; builtinUrl?: string; tags?: string[];
};
export type MusicPreferences = { text: string; tempo: number; gain: number; density: number };
export type CompositionInput = { rhythm: RhythmEvent[]; selectedSoundIds: string[]; preferences: MusicPreferences };
export type CompositionEvent = { soundId: string; startTime: number; duration?: number; gain: number };
export type Composition = {
  id: string; title: string; createdAt: number; duration: number; events: CompositionEvent[];
  sourceRhythm: RhythmEvent[]; selectedSoundIds: string[]; preferences: MusicPreferences;
};
export type CreationDraft = { rhythm: RhythmEvent[]; selectedSoundIds: string[]; preferenceText: string; composition?: Composition };
