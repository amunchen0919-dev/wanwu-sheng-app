import {ApiError} from './provider.ts';
// 只读解析，不转码或改写参考音频。接受额外合法RIFF块，不假定data位于偏移36。
export async function validateReference(audio:Blob){
  const fail=(detail:string):never=>{throw new ApiError(`参考WAV校验失败：${detail}`,400,'upload','INVALID_REFERENCE');};
  if(audio.size>6_000_000||audio.size<44)fail('本地限制为6MB以内');
  const bytes=await audio.arrayBuffer(),view=new DataView(bytes);
  const text=(offset:number)=>new TextDecoder().decode(bytes.slice(offset,offset+4));
  if(text(0)!=='RIFF'||text(8)!=='WAVE'||view.getUint32(4,true)+8!==bytes.byteLength)fail('RIFF/WAVE容器或文件长度不一致');
  let offset=12,format:{channels:number;rate:number;byteRate:number;align:number;bits:number}|undefined,dataBytes:number|undefined;
  while(offset+8<=bytes.byteLength){
    const name=text(offset),size=view.getUint32(offset+4,true),start=offset+8,end=start+size;
    if(end>bytes.byteLength||end+(size%2)>bytes.byteLength)fail('音频块长度或填充字节不完整');
    if(name==='fmt '){
      if(format||size<16)fail('fmt块无效');
      if(view.getUint16(start,true)!==1)fail('实验室目前只接受PCM16参考；这是本地限制，不代表官方WAV仅支持此格式');
      format={channels:view.getUint16(start+2,true),rate:view.getUint32(start+4,true),byteRate:view.getUint32(start+8,true),align:view.getUint16(start+12,true),bits:view.getUint16(start+14,true)};
    }
    if(name==='data'){if(dataBytes!==undefined)fail('存在重复data块');dataBytes=size;}
    offset=end+(size%2);
  }
  if(offset!==bytes.byteLength||!format||dataBytes===undefined)fail('缺少fmt/data块或存在残余字节');
  const fmt=format!,data=dataBytes!;
  if(![1,2].includes(fmt.channels)||fmt.rate!==44100||fmt.bits!==16||fmt.align!==fmt.channels*2||fmt.byteRate!==fmt.rate*fmt.align||data!==30*fmt.rate*fmt.align)fail('实验室需要30秒、44.1kHz单/双声道PCM16 WAV，或块对齐/时长不一致');
  return{channels:fmt.channels,sampleRate:fmt.rate,bits:fmt.bits,duration:30};
}
