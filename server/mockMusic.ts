/** 免费确定性测试音频，不是AI作品；有旋律/和声变化与结尾，仅用于验证传输与混音。 */
export function mockMusic(duration:number):Blob{
 const rate=16000,length=Math.round(duration*rate),buffer=new ArrayBuffer(44+length*2),v=new DataView(buffer);
 const text=(o:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));text(0,'RIFF');text(8,'WAVE');text(12,'fmt ');text(36,'data');v.setUint32(4,buffer.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,length*2,true);
 const melody=[60,64,67,69,67,64,62,65,64,67,71,72,69,67,64,62];
 for(let i=0;i<length;i++){const t=i/rate,section=Math.min(4,Math.floor(t/duration*5)),note=melody[(Math.floor(t*2)+section*3)%melody.length],f=440*2**((note-69)/12),phase=t%.5,envelope=Math.min(1,phase/.012)*Math.exp(-phase*3),chord=[48,53,57,55][Math.floor(t/4)%4],base=440*2**((chord-69)/12);
 const fade=Math.min(1,t/.4,(duration-t)/.8),sample=fade*(.12*envelope*Math.sin(2*Math.PI*f*t)+.055*Math.sin(2*Math.PI*base*t)+.035*Math.sin(2*Math.PI*base*1.5*t));v.setInt16(44+i*2,Math.round(sample*32767),true);}
 return new Blob([buffer],{type:'audio/wav'});
}
