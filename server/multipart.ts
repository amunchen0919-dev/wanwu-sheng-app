import type {GenerateInput} from './provider.ts';
/** 使用原生FormData编码字段；文本先于文件，保留标准结束边界后的CRLF。 */
export async function encodeAudioRequest(input:GenerateInput){
  const form=new FormData();
  const normalizedPrompt=input.prompt.trim().replace(/\r\n|\r|\n/g,'\r\n');
  form.set('prompt',normalizedPrompt);
  form.set('model','stable-audio-3');
  form.set('duration',String(input.duration??30));
  if(input.generationMode!=='text-to-audio')form.set('strength',String(input.strength));
  form.set('output_format','mp3');
  if(input.generationMode!=='text-to-audio'){if(!input.audio)throw Error('参考音频缺失');form.set('audio',input.audio,'reference.wav');}
  const encoded=new Request('http://localhost/multipart-encoding-only',{method:'POST',body:form}); // 只序列化，不发送请求
  const type=encoded.headers.get('content-type')!;
  const bytes=new Uint8Array(await encoded.arrayBuffer());
  const hasCrlf=bytes.at(-2)===13&&bytes.at(-1)===10;
  const body=new Blob(hasCrlf?[bytes]:[bytes,new Uint8Array([13,10])],{type});
  const decoded=await new Request('http://localhost/multipart-self-check-only',{method:'POST',headers:{'Content-Type':type},body}).formData();
  const prompt=decoded.get('prompt'),audio=decoded.get('audio');
  if(typeof prompt!=='string'||prompt!==normalizedPrompt||(input.generationMode==='text-to-audio'?audio!==null:!(audio instanceof Blob)||audio.size!==input.audio?.size))throw new Error('本地multipart序列化自检失败');
  return{body,contentType:type,contentLength:String(body.size),promptPresent:!!prompt,promptLength:prompt.length};
}
