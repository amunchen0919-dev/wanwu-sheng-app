// @vitest-environment node
import {mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,it} from 'vitest';
import {fileJournal} from '../../server/journal';
it('真实文件原子持久化、重开读取与损坏显式失败（仅操作测试临时目录）',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wanwu-journal-test-'));
 try{
  const path=join(dir,'jobs.json'),journal=fileJournal(path);expect(journal.read()).toEqual([]);
  const audit={id:'old-request-123456789',status:'error',recovery:{outcome:'unknown',at:'2026-11-02',reason:'explicit manual audit'}};
  journal.write([audit]);expect(fileJournal(path).read()).toEqual([audit]);expect(statSync(path).mode&0o777).toBe(0o600);
  journal.write([audit,{id:'new-request-123456789',status:'pending'}]);expect(JSON.parse(readFileSync(path,'utf8'))).toHaveLength(2);
  writeFileSync(path,'corrupt');expect(()=>fileJournal(path).read()).toThrow();
 }finally{rmSync(dir,{recursive:true});}
});
