export type QualityWindow={start:number;end:number;rmsDb:number;peakDb:number;silent:boolean};
export type AudioQuality={peakDb?:number;rmsDb?:number;clippedSampleRatio?:number;passed?:boolean;duration:number;expectedDuration:number;activeSeconds:number;longestSilence:number;trailingSilence:number;windows:QualityWindow[];warnings:string[]};
/** 100ms窗口，所有声道能量统计，避免反相信号相消；-60dBFS是近静音阈值，不是音乐性评分。 */
export function analyzeAudio(channels:Float32Array[],sampleRate:number,expectedDuration:number):AudioQuality{
  if(!channels.length||!channels[0].length||!Number.isFinite(sampleRate)||sampleRate<=0||channels.some(c=>c.length!==channels[0].length))throw Error('音频采样数据无效');
  const length=channels[0].length,duration=length/sampleRate,step=Math.max(1,Math.round(sampleRate*.1));
  const windows:QualityWindow[]=[];let totalPower=0,totalPeak=0,clipped=0;let activeSeconds=0,longestSilence=0,trailingSilence=0;
  for(let start=0;start<length;start+=step){const end=Math.min(length,start+step);let sum=0,peak=0;
    for(const channel of channels)for(let i=start;i<end;i++){const value=channel[i];if(!Number.isFinite(value))throw Error('音频含无效采样');sum+=value*value;peak=Math.max(peak,Math.abs(value));if(Math.abs(value)>=.999)clipped++;}
    totalPower+=sum;totalPeak=Math.max(totalPeak,peak);
    const rmsDb=sum?10*Math.log10(sum/((end-start)*channels.length)):-Infinity;
    const silent=rmsDb< -60,seconds=(end-start)/sampleRate;
    if(silent){trailingSilence+=seconds;longestSilence=Math.max(longestSilence,trailingSilence);}else{activeSeconds+=seconds;trailingSilence=0;}
    windows.push({start:start/sampleRate,end:end/sampleRate,rmsDb,peakDb:peak?20*Math.log10(peak):-Infinity,silent});
  }
  const warnings:string[]=[];
  if(duration<expectedDuration-2)warnings.push(`实际音频仅${duration.toFixed(1)}秒，短于目标${expectedDuration}秒。`);
  if(longestSilence>=10)warnings.push(`检测到连续${longestSilence.toFixed(1)}秒近静音${trailingSilence>=10?'（包含结尾长静音）':''}，作品可能不完整。`);
  if(activeSeconds<duration*.85)warnings.push('有效声音覆盖不足85%，请试听核查作品是否完整。');
  const clippedSampleRatio=clipped/(length*channels.length),rmsDb=totalPower?10*Math.log10(totalPower/(length*channels.length)):-Infinity;
  if(clippedSampleRatio>.001||totalPeak>1)warnings.push('检测到疑似削波、超出满刻度或满刻度采样比例偏高，请检查音量。');
  if(rmsDb< -45)warnings.push('整段音量异常微弱，不能认为声音覆盖正常。');
  if(duration>expectedDuration+2)warnings.push('实际时长明显超过目标，请核查输出。');
  return{peakDb:totalPeak?20*Math.log10(totalPeak):-Infinity,rmsDb,clippedSampleRatio,passed:warnings.length===0,duration,expectedDuration,activeSeconds,longestSilence,trailingSilence,windows,warnings};
}
/** 只解码检查，不重编码或修改Blob；不会请求网络或AI。 */
export async function inspectAudioQuality(blob:Blob,expectedDuration:number,signal?:AbortSignal):Promise<AudioQuality>{
  if(!globalThis.AudioContext)throw Error('此浏览器无法解码分析音频，请下载后人工检查');
  const context=new AudioContext();
  try{const decoded=await context.decodeAudioData(await blob.arrayBuffer());signal?.throwIfAborted();return analyzeAudio(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate,expectedDuration);}
  finally{await context.close();}
}
