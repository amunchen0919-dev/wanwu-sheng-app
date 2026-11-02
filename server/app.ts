import type {RuntimeDiagnostic} from './runtime.ts';
import type {HistoricalJob} from './history.ts';
import {mockMusic} from './mockMusic.ts';
import type {JobJournal} from './journal.ts';
import {AUDIO_LAB_DURATIONS,AUDIO_LAB_PRICE} from '../src/types/audioLabOptions.ts';
import { randomUUID } from 'node:crypto';
import { ApiError, StableAudioProvider, type AudioGenerationProvider } from './provider.ts';
export type LabConfig = { enabled: boolean; mode: 'mock'|'live'; key?: string; journal?:JobJournal;history?:()=>HistoricalJob[];runtime?:RuntimeDiagnostic };
type Job = { status:'submitting'|'pending'|'complete'|'error'; upstreamId?: string; blob?: Blob; error?: string; lastPoll:number; polling:boolean; polls:number; failure?:ApiError; mockScenario?:string; generationMode?:'text-to-audio'|'audio-to-audio'; duration?:number; createdAt?:string; updatedAt?:string; queryError?:string; recovery?:{at:string;reason:string;acknowledgedAccount:true;acknowledgedOriginalError:true;acknowledgedRisk:true;outcome:'unknown';action:'manual-archive'} };
export {validateReference} from './wav.ts';
import {validateReference} from './wav.ts';
export function createLab(config:LabConfig, provider?:AudioGenerationProvider) {
  const token=randomUUID(); const jobs=new Map<string,Job>();
  const mode=config.mode==='live'&&config.key?.trim() ? 'live':'mock';
  let journalError=false;
  try{const saved=config.journal?.read();if(saved!==undefined){if(!Array.isArray(saved))throw Error();for(const entry of saved){
    if(typeof entry.id!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(entry.id))throw Error();
    const failure=entry.failure?Object.assign(new ApiError(entry.failure.message,entry.failure.status,entry.failure.stage,entry.failure.code,entry.failure.requestId,entry.failure.submissionUnknown),{diagnostic:entry.failure.diagnostic}):undefined;
    jobs.set(entry.id,{...entry,status:entry.status==='complete'?'complete':entry.status==='error'?'error':entry.upstreamId||mode==='mock'&&entry.generationMode==='text-to-audio'?'pending':'error',lastPoll:entry.lastPoll??0,polls:entry.polls??0,polling:false,failure:failure??(!entry.upstreamId&&mode==='live'?new ApiError('服务曾在提交期间中断，提交结果未知，保持锁定',502,'upload','SUBMISSION_UNCERTAIN',undefined,true):undefined)});
  }}}catch{journalError=true;}
  function persist(){config.journal?.write([...jobs].map(([id,job])=>({id,status:job.status,upstreamId:job.upstreamId,duration:job.duration,generationMode:job.generationMode,mockScenario:job.mockScenario,createdAt:job.createdAt,updatedAt:job.updatedAt,lastPoll:job.lastPoll,polls:job.polls,queryError:job.queryError,recovery:job.recovery,failure:job.failure?{message:job.failure.message,status:job.failure.status,stage:job.failure.stage,code:job.failure.code,requestId:job.failure.requestId,submissionUnknown:job.failure.submissionUnknown,diagnostic:job.failure.diagnostic}:undefined})));}
  function blocks(job:Job){return job.status==='submitting'||job.status==='pending'||!!job.failure?.submissionUnknown&&!job.recovery;}
  const service=provider ?? (mode==='live'?new StableAudioProvider(config.key!):undefined);
  function failure(error:ApiError){return{error:error.message,stage:error.stage,code:error.code,httpStatus:error.status,requestId:error.requestId,submissionUnknown:error.submissionUnknown,diagnostic:error.diagnostic};}
  function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
  return async function handle(request:Request):Promise<Response> {
    if(!config.enabled) return json({error:'开发测试服务未启用'},404);
    const url=new URL(request.url);
    const origin=request.headers.get('origin');
    if((origin&&!['http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173','http://localhost:8787','http://127.0.0.1:8787'].includes(origin))||request.headers.get('sec-fetch-site')==='cross-site') return json({error:'不允许跨站访问'},403);
    if(url.pathname==='/api/audio-lab/config'&&request.method==='GET') return json({mode,token,model:'stable-audio-3',uiProtocol:2,generationModes:['text-to-audio','audio-to-audio'],duration:30,allowedDurations:AUDIO_LAB_DURATIONS,pricing:AUDIO_LAB_PRICE,runtime:config.runtime});
    if(request.headers.get('x-lab-token')!==token) return json({error:'本地测试令牌失效，请重新连接测试服务'},403);
    try {
      if(url.pathname==='/api/audio-lab/jobs'&&request.method==='GET'){
        let history:HistoricalJob[]=[];let historyError=false;try{history=config.history?.()??[];}catch{historyError=true;}
        return json({journalHealthy:!journalError&&!historyError,records:[...[...jobs].map(([id,job])=>({id,status:job.status,executionMode:mode,upstreamId:job.upstreamId,generationMode:job.generationMode,duration:job.duration,createdAt:job.createdAt,updatedAt:job.updatedAt,blocksSubmission:blocks(job),queryError:job.queryError,recovery:job.recovery})),...history.filter(h=>!jobs.has(h.record.id)).map(h=>({...h.record,executionMode:h.executionMode,archived:true,blocksSubmission:false,requiresModeSwitch:h.executionMode!=='mock'||h.record.status!=='complete'||h.record.generationMode!=='text-to-audio'}))]});
      }
      function historical(id:string){let found:HistoricalJob[];try{found=config.history?.().filter(h=>h.record.id===id)??[];}catch{throw new ApiError('历史任务文件不可读，保持锁定，请检查文件而非清空记录',503,'query','HISTORY_UNAVAILABLE');}if(found.length>1)throw new ApiError('历史记录存在同ID多来源，不能自动选择账户或解锁，请人工核查',409,'query','AMBIGUOUS_HISTORY');return found[0];}
      const archive=url.pathname.match(/^\/api\/audio-lab\/jobs\/([a-zA-Z0-9-]{16,80})\/manual-recovery$/);
      if(archive&&request.method==='POST'){
        if(journalError||!config.journal)throw new ApiError('审计存储不可用，不能执行人工恢复',409,'setup','AUDIT_UNAVAILABLE');
        const id=archive[1],old=jobs.get(id),body=await request.json();
        // 只用于旧版本完全丢失的任务；已接收/运行中或有未知提交记录的任务不得走此入口。
        if(!old&&historical(id))throw new ApiError('历史任务记录存在，请按来源切换或查询，不能当作丢失记录归档',409,'query','HISTORICAL_TASK_EXISTS');
        if(old&&!old.recovery)throw new ApiError('后端存在任务记录，请优先查询；人工旧记录恢复不适用于此任务',409,'query','RECOVERY_NOT_ELIGIBLE');
        if(body.typedId!==id||body.acknowledgedAccount!==true||body.acknowledgedOriginalError!==true||body.acknowledgedRisk!==true||typeof body.reason!=='string'||body.reason.trim().length<20||body.reason.length>1000)throw new ApiError('请核对账户与原始错误、确认未知风险、输入完整任务ID和至少20字核查说明',400,'setup','RECOVERY_CONFIRMATION_REQUIRED');
        if(old?.recovery)return json({archived:true,outcome:'unknown',recovery:old.recovery});
        const now=new Date().toISOString();const record:Job={status:'error',lastPoll:0,polls:0,polling:false,updatedAt:now,failure:new ApiError('旧版任务缺少记录，人工归档后上游状态仍未知',502,'upload','LEGACY_UNKNOWN',undefined,true),recovery:{at:now,reason:body.reason.trim(),acknowledgedAccount:true,acknowledgedOriginalError:true,acknowledgedRisk:true,outcome:'unknown',action:'manual-archive'}};
        jobs.set(id,record);try{persist();}catch{jobs.delete(id);journalError=true;throw new ApiError('审计写入失败，未解除当前页面锁',503,'setup','AUDIT_WRITE_FAILED');}
        return json({archived:true,outcome:'unknown',recovery:record.recovery});
      }
      if(url.pathname==='/api/audio-lab/jobs'&&request.method==='POST') {
        if(journalError)throw new ApiError('任务记录无法读取，已禁止提交；请保留记录并人工核查',409,'setup','JOURNAL_UNAVAILABLE');
        const id=request.headers.get('x-request-id');
        if(!id||! /^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new ApiError('请求ID无效',400);
        const old=jobs.get(id); if(old) return json({id,status:old.status,mode,...(old.failure?failure(old.failure):{})},old.status==='error'?409:202);
        if(jobs.size>=32) throw new ApiError('本地测试任务已达32个上限，请保留记录并人工核查已结束任务；重启不会解除Live任务锁',429);
        if([...jobs.values()].some(blocks)) throw new ApiError('已有任务在运行，请勿重复生成',409);
        const form=await request.formData(); const audio=form.get('audio'); const rawPrompt=form.get('prompt');const prompt=typeof rawPrompt==='string'?rawPrompt.trim():'';
        if(process.env.NODE_ENV!=='production')console.info('[audio-lab] received metadata',{promptPresent:!!prompt,promptLength:prompt.length,audioBytes:audio instanceof Blob?audio.size:0}); const strength=Number(form.get('strength'));
        const duration=Number(form.get('duration')??30);
        const generationMode=form.get('generationMode')??'audio-to-audio';
        if(!['text-to-audio','audio-to-audio'].includes(String(generationMode)))throw new ApiError('生成模式无效',400,'upload','INVALID_MODE');
        if(generationMode==='text-to-audio'&&audio!==null)throw new ApiError('完整音乐创作不接受参考音频上传',400,'upload','TEXT_AUDIO_FORBIDDEN');
        const scenario=mode==='mock'?String(form.get('mockScenario')??'success'):'success';
        if(!AUDIO_LAB_DURATIONS.some(value=>value===duration))throw new ApiError('实验室输出时长仅允许30/90/120/180/240秒',400,'upload','INVALID_DURATION');
        if(!['success','upload-error','generation-error','query-error'].includes(scenario))throw new ApiError('Mock场景无效',400,'upload','INVALID_SCENARIO');
        if((generationMode==='audio-to-audio'&&!(audio instanceof Blob))||typeof prompt!=='string'||!prompt.trim()||prompt.length>10000||!Number.isFinite(strength)||strength<0||strength>.6) throw new ApiError('参考音频、提示或强度无效（本测试限制0–0.6）',400);
        if(generationMode==='audio-to-audio')await validateReference(audio as Blob);
        if(mode==='live'&&form.get('confirmed')!=='yes') throw new ApiError('真实生成需要本次明确确认',400);
        if(jobs.has(id))return json({id,status:jobs.get(id)!.status,mode},202);
        if([...jobs.values()].some(blocks))throw new ApiError('已有任务在运行',409);
        const job:Job={createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'submitting',lastPoll:0,polling:false,polls:0,mockScenario:scenario,duration,generationMode:generationMode as 'text-to-audio'|'audio-to-audio'}; jobs.set(id,job);
        try {
          try{persist();}catch{jobs.delete(id);throw new ApiError('本地任务记录写入失败，未提交上游',400,'setup','JOURNAL_WRITE');}
          if(mode==='mock'){if(scenario==='upload-error')throw new ApiError('模拟上传被拒绝（未调用AI）',422,'upload','MOCK_UPLOAD');job.blob=generationMode==='text-to-audio'?mockMusic(duration):audio as Blob;job.status='pending';}
          else {const result=await service!.submit({audio:audio instanceof Blob?audio:undefined,prompt,strength,duration,generationMode:generationMode as 'text-to-audio'|'audio-to-audio'});job.upstreamId=result.upstreamId;job.status='pending';}
        }catch(error){job.status='error';job.failure=error instanceof ApiError?error:new ApiError('上游提交状态未知，勿重复提交',502,'upload','SUBMISSION_UNCERTAIN',undefined,true);job.error=job.failure.message;}
        job.updatedAt=new Date().toISOString();try{persist();}catch{journalError=true;}
        return json({id,status:job.status,mode,upstreamId:job.upstreamId,...(job.failure?failure(job.failure):{})},job.status==='error'?502:202);
      }
      const statusMatch=url.pathname.match(/^\/api\/audio-lab\/jobs\/([a-zA-Z0-9-]{16,80})\/status$/);
      if(statusMatch&&request.method==='GET'){
        const job=jobs.get(statusMatch[1]);
        if(!job){const history=historical(statusMatch[1]);if(history){const record=history.record;return json({state:record.failure?.submissionUnknown?'unknown':record.status,canPrepare:false,canManualRecover:false,executionMode:history.executionMode,modeMismatch:true,requiresModeSwitch:history.executionMode!=='mock'||record.status!=='complete'||record.generationMode!=='text-to-audio',generationMode:record.generationMode,duration:record.duration,upstreamId:record.upstreamId,error:history.executionMode==='mock'&&record.status==='complete'?'已核实为完成的Mock任务，无付费提交；可免费查询测试音频后显式准备下一次测试':'找到历史任务，请切回对应运行模式/账户后查询；不代表任务失败，不能自动解锁'});}}
        if(!job)return json({state:'unknown',canPrepare:false,canManualRecover:!journalError&&!!config.journal,error:'后端没有此任务记录，可能已重启；无法确认上游是否生成或计费。请核查Stability账户与原始错误记录，不要直接解除锁。'});
        const canPrepare=job.status==='error'&&!job.upstreamId&&!job.failure?.submissionUnknown&&[400,413,415,422].includes(job.failure?.status??0);
        return json({executionMode:mode,requiresModeSwitch:false,canManualRecover:!!job.recovery&& !journalError,manuallyArchived:!!job.recovery,recovery:job.recovery,state:canPrepare?'rejected':job.failure?.submissionUnknown?'unknown':job.status,canPrepare,error:job.failure?.message??job.error,upstreamId:job.upstreamId,generationMode:job.generationMode,duration:job.duration,createdAt:job.createdAt,diagnostic:job.failure?.diagnostic,outcome:job.upstreamId?'accepted':job.failure?.submissionUnknown?'unknown':canPrepare?'rejected':'unconfirmed'});
      }
      const prepare=url.pathname.match(/^\/api\/audio-lab\/jobs\/([a-zA-Z0-9-]{16,80})\/prepare$/);
      if(prepare&&request.method==='POST'){
        const body=await request.json();
        if(body.acknowledgedRejected!==true)throw new ApiError('请明确确认上次请求已被拒绝且没有正在生成的任务',400,'setup','RESET_CONFIRMATION_REQUIRED');
        const old=jobs.get(prepare[1]);
        if(old&&(old.status!=='error'||old.upstreamId||old.failure?.submissionUnknown||![400,413,415,422].includes(old.failure?.status??0)))throw new ApiError('任务仍在运行、已被接收或提交状态不确定，不能解除锁；请仅查询或核查账户',409,'query','RESET_NOT_SAFE');
        if(!old)throw new ApiError('后端已丢失旧记录，不能确认未生成或未计费；请先人工核查，不允许直接解除未知锁',409,'query','JOB_STATE_UNKNOWN');
        // 保留旧job用于去重，不删除上游任务，不调用上游，不自动创建新任务。
        return json({prepared:true,previousStateVerified:!!old,message:old?'已核实参数/上传拒绝，可重新准备':'旧服务记录不存在；按用户对上次400拒绝的明确确认，仅解除本地提交记录'});
      }
      const match=url.pathname.match(/^\/api\/audio-lab\/jobs\/([a-zA-Z0-9-]{16,80})$/);
      if(match&&request.method==='GET') {
        const job=jobs.get(match[1]);
        if(!job){const history=historical(match[1]);if(history){if(history.executionMode==='mock'&&history.record.status==='complete'&&history.record.generationMode==='text-to-audio'&&!history.record.failure?.submissionUnknown)return new Response(mockMusic(history.record.duration??90),{headers:{'Content-Type':'audio/wav','Cache-Control':'no-store','X-Audio-Mode':'mock'}});throw new ApiError('找到历史任务，请切回对应运行模式/账户查询；未向上游发送请求',409,'query','TASK_MODE_MISMATCH');}}
        if(!job) throw new ApiError('本地任务不存在（旧版服务没有持久化记录），请勿直接重新付费生成',404,'query','JOB_NOT_FOUND');
        if(mode==='mock'&&job.generationMode==='text-to-audio'&&!job.blob&&!job.failure)job.blob=mockMusic(job.duration??90);
        if(mode==='mock'&&job.status==='complete'&&!job.blob)throw new ApiError('Mock任务已完成且未调用AI，但旧测试音频字节未保存；请保留已下载文件核对，不代表付费提交未知',410,'query','MOCK_AUDIO_UNAVAILABLE');
        if(job.status==='error') return json(job.failure?failure(job.failure):{error:job.error,stage:'generation'},502);
        if(mode==='mock'&&job.status==='pending'){
          job.polls++;
          if(job.mockScenario==='generation-error'){job.status='error';job.failure=new ApiError('模拟生成失败（未调用AI）',502,'generation','MOCK_GENERATION');return json(failure(job.failure),502);}
          if(job.mockScenario==='query-error'){job.status='complete';return json(failure(new ApiError('模拟任务查询失败；参考音频保留，可再次仅查询',503,'query','MOCK_QUERY')),503);}
          if(job.polls===1)return json({status:'pending',mode},202);job.status='complete';
        }
        if(mode==='live'&&(job.status==='pending'||job.status==='complete'&&!job.blob)&&!!job.upstreamId&&!job.polling&&Date.now()-job.lastPoll>=10000&&(job.status==='complete'||job.polls<60)) {
          job.polling=true;job.lastPoll=Date.now();job.polls++;
          try {const blob=await service!.result(job.upstreamId!);job.queryError=undefined;if(blob){job.blob=blob;job.status='complete';}else job.status='pending';}
          catch(error){const problem=error instanceof ApiError?error:new ApiError('任务查询失败，不能据此判断生成失败',502,'query','QUERY_FAILED');job.queryError=problem.message;if(problem.stage==='generation'){job.status='error';job.failure=problem;}return json({...failure(problem),upstreamId:job.upstreamId},problem.status);}
          finally{job.polling=false;job.updatedAt=new Date().toISOString();try{persist();}catch{journalError=true;}}
        }
        if(mode==='mock'){job.updatedAt=new Date().toISOString();try{persist();}catch{journalError=true;}}
        if(job.blob&&job.status==='complete') return new Response(job.blob,{headers:{'Content-Type':job.blob.type,'Cache-Control':'no-store','X-Audio-Mode':mode}});
        if(job.polls>=60) throw new ApiError('查询已达60次上限；不要重复生成，请到Stability账户检查任务',408,'query','QUERY_LIMIT');
        return json({status:job.status},202);
      }
      return json({error:'接口不存在'},404);
    }catch(error){const problem=error instanceof ApiError?error:new ApiError('本地上传请求无法解析，请检查multipart格式',400,'upload','INVALID_MULTIPART');return json(failure(problem),problem.status);}
  };
}
