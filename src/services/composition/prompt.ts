import type { SoundAsset } from '../../types/domain';
const textures:Record<string,string>={'builtin-glass':'delicate glass chimes','builtin-wood':'dry wooden percussion','builtin-rain':'soft rain noise','builtin-bell':'warm bells','builtin-water':'resonant water droplets','builtin-wind':'airy wind','builtin-drum':'low drum pulses','builtin-chime':'bright wind chimes','builtin-shaker':'shaker percussion','builtin-pluck':'plucked strings'};
const rules:[RegExp,string][]=[[/安静|平静|宁静/,'calm, spacious and restrained'],[/轻快|欢快|开心/,'light, playful and uplifting'],[/力量|有力|激昂/,'powerful low end and bold dynamics'],[/雨声|下雨/,'bring the rain texture forward'],[/放松|舒缓|温柔/,'relaxed, gentle and warm'],[/悲伤|忧伤/,'melancholic and introspective'],[/电子/,'electronic instrumentation'],[/钢琴/,'soft piano accompaniment'],[/自然/,'organic natural textures'],[/慢|缓慢/,'a slow feel without quantizing the input'],[/快|加速/,'an energetic feel with creative musical development']];
export function preferenceDescriptions(preference:string){return rules.filter(([pattern])=>pattern.test(preference)).map(([,description])=>description);}
export function buildAudioPrompt(preference:string,sounds:SoundAsset[]){
  const translated=preferenceDescriptions(preference);
  const english=preference.replace(/[^\x20-\x7E]/g,' ').trim();
  return {prompt:`TrackType: Music. Instrumental only. No vocals. Treat the reference as creative inspiration, not a recording to literally repeat or extend. Retain only approximate tempo, selected rhythmic motifs and signature textures. Prioritize a memorable melody, rich harmony and a complete musical journey. Develop the input into a complete musical arrangement with a new melodic theme, evolving harmonic progression, bass line and complementary instrumentation. Incorporate the selected sound textures: ${sounds.map(sound=>textures[sound.id]??'the user-recorded texture present in the reference audio').join(', ')}. ${translated.join('; ')}. ${english ? `Additional direction: ${english}.` : ''}Natural introduction, development and ending. Avoid imposing a uniform four-on-the-floor beat.`,matched:translated.length};
}

export const NINETY_SECOND_DIRECTION = `TrackType: Music. Instrumental only. No vocals.

Compose a beautiful, complete and emotionally engaging 90-second instrumental song inspired by the reference audio.

Treat the reference audio as creative inspiration, not as material to preserve, repeat or extend literally. Retain only the approximate tempo, a few distinctive rhythmic motifs and selected signature sound textures.

Prioritize a strong, memorable and singable lead melody, expressive musical phrases, rich chord progressions, a warm bass line and carefully arranged supporting instruments.

Create a clear musical journey with an engaging introduction, a recognizable main theme, contrasting sections, meaningful melodic and harmonic development, a powerful emotional climax and a satisfying ending.

Introduce substantial changes in instrumentation, dynamics, melodic phrasing, harmony and emotional intensity throughout the composition.

Style: melodic cinematic pop instrumental, elegant, imaginative, warm, emotionally expressive and professionally produced.

Use expressive piano or melodic synthesizer as the lead instrument, supported by strings, bass and tasteful percussion.

Avoid repetitive loops, monotonous rhythmic patterns, static ambient textures, aimless improvisation and excessive repetition of the original recording.

Maintain musical development throughout the full 90 seconds. Avoid long silent passages, abrupt cutoffs and unfinished endings.

The final result should sound like a beautifully composed, complete instrumental song rather than an extended audio sample.`;
export type Retention='low'|'medium'|'high';
const retentionDirection:Record<Retention,string>={
 low:'Reference influence: low. Use only the approximate tempo, a few rhythmic motifs and occasional signature textures. Freely recompose the music. Prioritize melody, harmony and a complete song over fidelity to the original recording.',
 medium:'Reference influence: medium. Moderately retain recognizable rhythmic motifs and signature textures while developing new melody, harmony, contrasting sections and a complete song. Do not literally loop or extend the recording.',
 high:'Reference influence: high. Keep the original distinctive rhythm and selected sound elements as recognizable as possible while adding melody, harmony, contrasting sections and a resolved ending. Avoid long silence and literal repetitive looping.'
};
/** 保留可编辑描述；保留程度只映射到官方prompt字段，不虚构额外API参数。 */
export function buildSubmissionPrompt(prompt:string,duration:number,retention:Retention='low'){
 const base=prompt===NINETY_SECOND_DIRECTION&&retention!=='low'?prompt.replace('Retain only the approximate tempo, a few distinctive rhythmic motifs and selected signature sound textures.',retentionDirection[retention]):prompt.trim();
 return `${base}\n\n${duration===90?'Compose a complete 90-second instrumental song with contrasting sections, thematic development, emotional climax and a natural ending. ':''}Target duration: ${duration} seconds. ${retentionDirection[retention]} Instrumental only. No vocals. Maintain musical development for the full duration, with no long silent passages.`;
}
