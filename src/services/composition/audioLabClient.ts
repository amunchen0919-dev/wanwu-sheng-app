import type {GenerationMode} from './musicIntent';
export type LabConfig={runtime?:{pid:number;instanceId:string;startedAt:string;requestedMode:string;effectiveMode:'live'|'mock';envFileMode:string;keyConfigured:boolean;explanation:string};mode:'mock'|'live';token:string;model:string;duration:number;allowedDurations?:number[];generationModes?:GenerationMode[];uiProtocol?:number;pricing?:{credits:number;usd:number;checkedAt:string;basis:string}};
export type FailureStage='setup'|'reference'|'upload'|'generation'|'query';
export class LabRequestError extends Error{
  stage:FailureStage;code?:string;httpStatus?:number;requestId?:string;submissionUnknown:boolean;
  constructor(message:string,stage:FailureStage,details:{code?:string;httpStatus?:number;requestId?:string;submissionUnknown?:boolean}={}){super(message);this.stage=stage;this.code=details.code;this.httpStatus=details.httpStatus;this.requestId=details.requestId;this.submissionUnknown=details.submissionUnknown??false;}
}
export function formatLabError(error:unknown,fallback:FailureStage){
  const problem=error instanceof LabRequestError?error:undefined;
  const labels:Record<FailureStage,string>={setup:'本地服务连接/配置失败',reference:'本地参考音频制作失败',upload:'上传/提交失败',generation:'生成失败或生成请求被拒绝',query:'任务查询失败（不代表生成失败）'};
  return `${labels[problem?.stage??fallback]}：${error instanceof Error?error.message:'未知错误'}${problem?.httpStatus?` [HTTP ${problem.httpStatus}]`:''}${problem?.code?` [${problem.code}]`:''}${problem?.requestId?` 上游错误ID：${problem.requestId}`:''}${problem?.submissionUnknown?' 提交结果不确定，可能已计费，请勿重新提交。':''}`;
}
const base='/api/audio-lab';
async function error(response:Response,stage:FailureStage){
  try{const body=await response.json();const known:FailureStage[]=['setup','upload','generation','query'];return new LabRequestError(typeof body.error==='string'?body.error:`请求失败 ${response.status}`,known.includes(body.stage)?body.stage:stage,{code:body.code,httpStatus:body.httpStatus??response.status,requestId:body.requestId,submissionUnknown:body.submissionUnknown});}
  catch{return new LabRequestError(`本地测试服务返回非JSON错误，请检查后端和Vite代理`,stage,{code:'LOCAL_RESPONSE',httpStatus:response.status});}
}
async function send(url:string,options:RequestInit,stage:FailureStage){
  try{return await fetch(url,options);}catch(e){if(e instanceof DOMException&&e.name==='AbortError')throw e;throw new LabRequestError(stage==='upload'?'连接中断，不能确定是否已提交；不要重复生成':'网络连接失败，请检查本地后端',stage,{code:'NETWORK_ERROR',submissionUnknown:stage==='upload'});}
}
export async function getLabConfig(signal?:AbortSignal):Promise<LabConfig>{
  const response=await send(`${base}/config`,{signal,cache:'no-store'},'setup');if(!response.ok)throw await error(response,'setup');
  try{const data=await response.json();if(!['mock','live'].includes(data.mode)||typeof data.token!=='string')throw Error();return data;}
  catch{throw new LabRequestError('请启动npm run dev:api并重启Vite以加载代理配置','setup',{code:'INVALID_CONFIG'});}
}
export async function submitAudio(config:LabConfig,id:string,audio:Blob|undefined,prompt:string,strength:number,confirmed:boolean,signal?:AbortSignal,duration=30,mockScenario='success',generationMode:GenerationMode='audio-to-audio'){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.trim().length>10000)throw new LabRequestError('Prompt必填且最多10000字符，未发起请求','upload',{code:'INVALID_PROMPT'});
  const form=new FormData();if(generationMode==='audio-to-audio'){if(!audio)throw new LabRequestError('缺少参考音频','upload');form.set('audio',audio,'reference.wav');}form.set('generationMode',generationMode);form.set('prompt',prompt.trim());form.set('strength',String(strength));form.set('confirmed',confirmed?'yes':'no');form.set('duration',String(duration));
  if(config.mode==='mock')form.set('mockScenario',mockScenario);
  const response=await send(`${base}/jobs`,{method:'POST',headers:{'X-Lab-Token':config.token,'X-Request-Id':id},body:form,signal},'upload');
  if(!response.ok)throw await error(response,'upload');
  try{const body=await response.json();if(body.error)throw new LabRequestError(body.error,body.stage??'generation',body);return body;}
  catch(e){if(e instanceof LabRequestError)throw e;throw new LabRequestError('提交响应格式异常，不能确定是否已创建任务','upload',{code:'INVALID_SUBMIT_RESPONSE',submissionUnknown:true});}
}
export async function fetchAudioResult(config:LabConfig,id:string,signal?:AbortSignal):Promise<Blob|undefined>{
  const response=await send(`${base}/jobs/${encodeURIComponent(id)}`,{headers:{'X-Lab-Token':config.token},signal},'query');
  if(response.status===202)return;
  if(!response.ok)throw await error(response,'query');
  if(!response.headers.get('content-type')?.toLowerCase().startsWith('audio/'))throw new LabRequestError('查询返回的内容不是音频','query',{code:'INVALID_RESULT_TYPE'});
  const blob=await response.blob();if(!blob.size)throw new LabRequestError('查询返回空音频','query',{code:'EMPTY_RESULT'});return blob;
}

/** 只解除本地已拒绝任务的锁，不会触发生成。 */
export async function prepareRejectedTest(config:LabConfig,id:string,acknowledgedRejected:boolean,signal?:AbortSignal){
  const response=await send(`${base}/jobs/${encodeURIComponent(id)}/prepare`,{method:'POST',headers:{'X-Lab-Token':config.token,'Content-Type':'application/json'},body:JSON.stringify({acknowledgedRejected}),signal},'setup');
  if(!response.ok)throw await error(response,'setup');
  return response.json() as Promise<{prepared:boolean;previousStateVerified:boolean;message:string}>;
}

/** 只读本地Map，不轮询Stability，不调用付费服务。 */
export async function getLocalTaskStatus(config:LabConfig,id:string,signal?:AbortSignal):Promise<{state:'unknown'|'submitting'|'pending'|'complete'|'rejected'|'error';canPrepare:boolean;executionMode?:'mock'|'live';requiresModeSwitch?:boolean;modeMismatch?:boolean;generationMode?:GenerationMode;duration?:number;canManualRecover?:boolean;manuallyArchived?:boolean;error?:string;upstreamId?:string;outcome?:string;diagnostic?:{source:string;elapsedMs:number;timeoutMs:number;cause:string}}>{
  const response=await send(`${base}/jobs/${encodeURIComponent(id)}/status`,{headers:{'X-Lab-Token':config.token},signal,cache:'no-store'},'query');
  if(!response.ok)throw await error(response,'query');
  const data=await response.json();
  if(!['unknown','submitting','pending','complete','rejected','error'].includes(data.state))throw new LabRequestError('本地任务状态接口版本不匹配，请重启后端','setup',{code:'STATUS_VERSION'});
  return{...data,executionMode:data.executionMode??(data.state!=='unknown'?config.mode:undefined)};
}

export type LocalJobRecord={id:string;status:string;executionMode?:'mock'|'live';archived?:boolean;requiresModeSwitch?:boolean;upstreamId?:string;createdAt?:string;updatedAt?:string;duration?:number;generationMode?:GenerationMode;blocksSubmission:boolean;queryError?:string;recovery?:{at:string;reason:string;outcome:'unknown'}};
export async function getJobRegistry(config:LabConfig,signal?:AbortSignal):Promise<{journalHealthy:boolean;records:LocalJobRecord[]}>{
  const response=await send(`${base}/jobs`,{headers:{'X-Lab-Token':config.token},signal,cache:'no-store'},'query');
  if(!response.ok)throw await error(response,'query');return response.json();
}
export async function archiveLegacyTask(config:LabConfig,id:string,confirmation:{typedId:string;reason:string;acknowledgedAccount:boolean;acknowledgedOriginalError:boolean;acknowledgedRisk:boolean}){
  const response=await send(`${base}/jobs/${encodeURIComponent(id)}/manual-recovery`,{method:'POST',headers:{'X-Lab-Token':config.token,'Content-Type':'application/json'},body:JSON.stringify(confirmation)},'setup');
  if(!response.ok)throw await error(response,'setup');return response.json() as Promise<{archived:boolean;outcome:'unknown'}>;
}
