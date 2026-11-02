import type {RhythmEvent,SoundAsset} from '../../types/domain';
export type GenerationMode='text-to-audio'|'audio-to-audio';
export type MusicIntent={version:1;eventCount:number;spanMs:number;densityPerSecond:number;tempo:{estimate?:number;candidates:number[];confidence:'insufficient'|'low'|'medium';note:string};dynamics:{min:number;max:number;mean:number};motifs:{intervalsMs:number[];occurrences:number}[];events:RhythmEvent[];sounds:{id:string;name:string;source:SoundAsset['source'];tags:string[];triggerTimesMs:number[]}[];preference:string;unknowns:string[]};
export function extractMusicIntent(rhythm:RhythmEvent[],sounds:SoundAsset[],preference=''):MusicIntent{
 if(rhythm.length>2000||rhythm.some(e=>![e.time,e.duration,e.velocity].every(Number.isFinite)||e.time<0||e.duration<0||e.velocity<0||e.velocity>1))throw Error('节奏事件无效');
 const events=rhythm.map(e=>({...e})).sort((a,b)=>a.time-b.time),gaps=events.slice(1).map((e,i)=>e.time-events[i].time).filter(g=>g>0);
 const sorted=[...gaps].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
 const raw=median?60000/median:undefined,candidates=raw?[raw/2,raw,raw*2].filter(b=>b>=30&&b<=300).map(b=>Math.round(b)):[];
 const variation=median?gaps.reduce((sum,g)=>sum+Math.abs(g-median)/median,0)/gaps.length:Infinity;
 const confidence=events.length<4?'insufficient':variation<.18&&events.length>=6?'medium':'low';
 const estimate=confidence!=='insufficient'&&raw&&raw>=30&&raw<=300?Math.round(raw):undefined;
 const motifs:MusicIntent['motifs']=[],seen=new Map<string,{intervalsMs:number[];occurrences:number}>();
 for(let i=0;i+2<gaps.length;i++){const intervalsMs=gaps.slice(i,i+3),key=intervalsMs.map(g=>Math.round(g/25)).join(',');const old=seen.get(key);if(old)old.occurrences++;else seen.set(key,{intervalsMs,occurrences:1});}
 for(const motif of seen.values())if(motif.occurrences>1)motifs.push(motif);
 const spanMs=events.length?events.at(-1)!.time-events[0].time:0,velocities=events.map(e=>e.velocity);
 return{version:1,eventCount:events.length,spanMs,densityPerSecond:spanMs>0?(events.length-1)/(spanMs/1000):0,tempo:{estimate,candidates:[...new Set(candidates)],confidence,note:'由敲击间隔推测，不等同歌曲真实拍速；存在半速/倍速歧义，未识别拍号。'},dynamics:{min:velocities.length?Math.min(...velocities):0,max:velocities.length?Math.max(...velocities):0,mean:velocities.length?velocities.reduce((a,b)=>a+b,0)/velocities.length:0},motifs,events,sounds:sounds.map(s=>({id:s.id,name:s.name,source:s.source,tags:s.tags??[],triggerTimesMs:events.map(e=>e.time)})),preference,unknowns:['未从音频识别个人录音内容、音高或调性','未检测生成歌曲的真实BPM、强拍或和弦；素材触发时间采用现有所有选中素材共同触发的参考映射']};
}
