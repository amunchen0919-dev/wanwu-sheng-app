import {afterEach,describe,expect,it} from 'vitest';
import {readLabSession,writeLabSession} from '../services/composition/labSession';
afterEach(()=>sessionStorage.clear());
const key='wanwu:audio-lab:migration-test';
const empty={version:1 as const,prompt:'keep this prompt',strength:.6,duration:30,scenario:'success'};
describe('实验室持久化与迁移',()=>{
  it('旧快照没有任务但旧ID键有锁时，不能错误恢复为无任务',()=>{
    sessionStorage.setItem(`${key}:state`,JSON.stringify(empty));sessionStorage.setItem(key,'legacy-task-123456789');
    expect(readLabSession(key).task).toMatchObject({id:'legacy-task-123456789',state:'unknown',canPrepare:false});
  });
  it('缓存中的可解除标记不被信任，ID冲突时保持锁定',()=>{
    writeLabSession(key,{...empty,task:{id:'one-task-123456789',state:'rejected',canPrepare:true,error:'HTTP400'}});
    expect(readLabSession(key).task).toMatchObject({state:'unknown',canPrepare:false,error:'HTTP400'});
    sessionStorage.setItem(key,'another-task-123456789');expect(readLabSession(key).task).toMatchObject({state:'unknown',canPrepare:false,conflict:true});
  });
  it('90秒选项刷新可恢复，存储不保存付费确认',()=>{
    writeLabSession(key,{...empty,duration:90});const restored=readLabSession(key);
    expect(restored.duration).toBe(90);expect(restored.prompt).toBe(empty.prompt);
    expect(restored).not.toHaveProperty('confirmed');
  });
  it('显式写入已解除状态同步移除旧ID，不修改Prompt参数或其他存储键',()=>{
    sessionStorage.setItem(key,'old-task-123456789');sessionStorage.setItem('unrelated','keep');writeLabSession(key,empty);
    expect(sessionStorage.getItem(key)).toBeNull();expect(readLabSession(key)).toMatchObject(empty);expect(readLabSession(key).task).toBeUndefined();expect(sessionStorage.getItem('unrelated')).toBe('keep');
    sessionStorage.clear();
  });
});
