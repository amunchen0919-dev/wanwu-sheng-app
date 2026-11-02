import {encodeAudioRequest} from './multipart.ts';
export type FailureStage='setup'|'upload'|'generation'|'query';
export type GenerateInput={audio?:Blob;prompt:string;strength:number;generationMode?:'text-to-audio'|'audio-to-audio';duration?:number};
export interface AudioGenerationProvider{submit(input:GenerateInput):Promise<{upstreamId:string}>;result(id:string):Promise<Blob|undefined>;}
export type SubmissionDiagnostic={source:'local-transport'|'upstream-http';elapsedMs:number;timeoutMs:number;cause:string;upstreamStatus?:number};
export class ApiError extends Error{
  diagnostic?:SubmissionDiagnostic;
  status:number;stage:FailureStage;code:string;requestId?:string;submissionUnknown:boolean;
  constructor(message:string,status=502,stage:FailureStage='upload',code='REQUEST_FAILED',requestId?:string,submissionUnknown=false){super(message);this.status=status;this.stage=stage;this.code=code;this.requestId=requestId;this.submissionUnknown=submissionUnknown;}
}
function redact(text:string,key:string){return (key?text.split(key).join('[redacted]'):text).replace(/(?:Bearer\s+)[^\s"',;]+/gi,'Bearer [redacted]').replace(/sk-[\w-]+/g,'[redacted]');}
async function apiError(response:Response,key:string,phase:'upload'|'query'){
  const descriptions:Record<number,string>={400:'参数无效',401:'服务端密钥无效',402:'账户额度不足',403:'鉴权或内容审核拒绝',404:'任务不存在或已过期',413:'上传文件过大',415:'不支持的音频类型',422:'音频或参数无法处理',429:'服务限流，请稍后查询',500:'上游服务错误'};
  let detail='',requestId:string|undefined;
  try{const body=await response.json();detail=[body.name,...(Array.isArray(body.errors)?body.errors:[])].filter(value=>typeof value==='string').join(' · ');if(typeof body.id==='string')requestId=redact(body.id,key).slice(0,128);}catch{/* 不泄露未知正文 */}
  const stage=phase==='query'?'query':[400,413,415,422].includes(response.status)?'upload':'generation';
  return new ApiError(`Stable Audio ${response.status}：${descriptions[response.status]??'请求失败'}${detail?` · ${redact(detail,key).slice(0,600)}`:''}`,response.status,stage,`UPSTREAM_${response.status}`,requestId,phase==='upload'&&response.status>=500);
}
export class StableAudioProvider implements AudioGenerationProvider{
  private key:string;private fetcher:typeof fetch;
  constructor(key:string,fetcher:typeof fetch=fetch){this.key=key.trim();this.fetcher=fetcher;}
  async submit(input:GenerateInput){
    const prompt=typeof input.prompt==='string'?input.prompt.trim():'';
    if(!prompt||prompt.length>10000)throw new ApiError('Prompt必填且不能超过10000字符；未发送上游请求',400,'upload','INVALID_PROMPT');
    if(input.generationMode!=='text-to-audio'&&(!(input.audio instanceof Blob)||!input.audio.size))throw new ApiError('参考音频为空；未发送上游请求',400,'upload','INVALID_REFERENCE');
    let encoded:Awaited<ReturnType<typeof encodeAudioRequest>>;
    try{encoded=await encodeAudioRequest({...input,prompt});}catch{throw new ApiError('本地multipart编码失败；未发送上游请求',400,'upload','MULTIPART_ENCODING');}
    if(process.env.NODE_ENV!=='production')console.info('[audio-lab] upstream request metadata',{promptPresent:encoded.promptPresent,promptLength:encoded.promptLength,generationMode:input.generationMode??'audio-to-audio',audioBytes:input.audio?.size??0,duration:input.duration??30,multipartBytes:encoded.body.size});
    const started=Date.now();
    let response:Response;
    try{response=await this.fetcher(`https://api.stability.ai/v2beta/audio/stable-audio/${input.generationMode==='text-to-audio'?'text-to-audio':'audio-to-audio'}`,{method:'POST',headers:{Authorization:`Bearer ${this.key}`,Accept:'audio/*','Content-Type':encoded.contentType,'Content-Length':encoded.contentLength},body:encoded.body,signal:AbortSignal.timeout(90000)});}
    catch(error){
      const value=error as {name?:string;cause?:{code?:string}};
      const allowed=['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','ECONNRESET','ECONNREFUSED','ENOTFOUND','ETIMEDOUT'];
      const cause=value?.name==='TimeoutError'?'LOCAL_SUBMIT_TIMEOUT':allowed.includes(value?.cause?.code??'')?value.cause!.code!:'TRANSPORT_INTERRUPTED';
      const problem=new ApiError('本地提交连接中断或超时；未收到可恢复的任务ID，无法确认上游是否已创建任务，请勿重新提交',502,'upload','SUBMISSION_UNCERTAIN',undefined,true);
      problem.diagnostic={source:'local-transport',elapsedMs:Date.now()-started,timeoutMs:90000,cause};
      console.info('[audio-lab] submission diagnostic',problem.diagnostic);throw problem;
    }
    if(response.status!==202){const problem=await apiError(response,this.key,'upload');problem.diagnostic={source:'upstream-http',elapsedMs:Date.now()-started,timeoutMs:90000,cause:`HTTP_${response.status}`,upstreamStatus:response.status};throw problem;}
    let data:unknown;try{data=await response.json();}catch{throw new ApiError('已收到202但任务响应不是有效JSON，请勿重新付费提交',502,'generation','INVALID_JOB_RESPONSE',undefined,true);}
    const id=(data as {id?:unknown})?.id;
    if(typeof id!=='string'||!/^[a-zA-Z0-9]{64}$/.test(id))throw new ApiError('已收到202但任务ID格式异常，请核查账户',502,'generation','INVALID_JOB_ID',undefined,true);
    return{upstreamId:id};
  }
  async result(id:string){
    if(!/^[a-zA-Z0-9]{64}$/.test(id))throw new ApiError('任务ID格式无效',400,'query','INVALID_JOB_ID');
    let response:Response;
    try{response=await this.fetcher(`https://api.stability.ai/v2beta/audio/results/${id}`,{headers:{Authorization:`Bearer ${this.key}`,Accept:'audio/*'},signal:AbortSignal.timeout(60000)});}
    catch{throw new ApiError('任务查询连接失败；生成状态未知，可仅查询已有任务，不要重新生成',502,'query','QUERY_NETWORK');}
    if(response.status===202)return;
    if(response.status!==200)throw await apiError(response,this.key,'query');
    if(response.headers.get('finish-reason')==='CONTENT_FILTERED')throw new ApiError('生成结果被内容审核过滤',403,'generation','CONTENT_FILTERED');
    if(!response.headers.get('content-type')?.toLowerCase().startsWith('audio/'))throw new ApiError('查询响应不是音频，不能当作生成成功',502,'query','INVALID_RESULT_TYPE');
    const blob=await response.blob();if(!blob.size)throw new ApiError('查询返回空音频',502,'query','EMPTY_RESULT');return blob;
  }
}
