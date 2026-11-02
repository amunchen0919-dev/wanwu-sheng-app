import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { soundRepository } from '../services/storage/sounds';
import type { SoundAsset } from '../types/domain';
/** 最小IDB协议模拟：验证生产仓储的事务/存储请求；不是完整IndexedDB实现或真实磁盘验收。 */
let stores: Map<string, Map<IDBValidKey, unknown>>;
let fail = false;
let closed: ReturnType<typeof vi.fn>;
beforeEach(() => {
  stores = new Map(); fail = false; closed = vi.fn();
  vi.stubGlobal('indexedDB', {
    open: vi.fn(() => {
      const request: any = {};
      const db = {
        objectStoreNames: { contains: (name: string) => stores.has(name) },
        createObjectStore: (name: string) => stores.set(name, new Map()), close: closed,
        transaction: (_names: string[], _mode: string) => {
          const tx: any = { error: new Error('quota'), abort: vi.fn() };
          tx.objectStore = (name: string) => ({
            put: (value: any, key?: IDBValidKey) => { const req = { result: key ?? value.id }; if (!fail) stores.get(name)!.set(req.result, value); queueMicrotask(() => fail ? tx.onabort?.() : tx.oncomplete?.()); return req; },
            getAll: () => { const req = { result: [...stores.get(name)!.values()] }; queueMicrotask(() => tx.oncomplete?.()); return req; },
            get: (key: IDBValidKey) => { const req = { result: stores.get(name)!.get(key) }; queueMicrotask(() => tx.oncomplete?.()); return req; },
          }); return tx;
        },
      };
      request.result = db;
      queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); }); return request;
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());
const asset: SoundAsset = { id:'recording-1', name:'我的录音 1', source:'recording', createdAt:123, duration:1.2, mimeType:'audio/mp4', blobId:'recording-1' };
describe('IndexedDB仓储协议', () => {
  it('元数据和真实Blob写入两仓，重新打开后可读且同ID重复保存不增加条目', async () => {
    const blob = new Blob(['audio'], { type:'audio/mp4' });
    await soundRepository.save(asset, blob); await soundRepository.save(asset, blob);
    expect(await soundRepository.list()).toEqual([asset]);
    expect(await soundRepository.getBlob(asset.blobId!)).toBe(blob);
    expect(stores.get('sounds')!.size).toBe(1); expect(stores.get('blobs')!.size).toBe(1);
    expect(closed).toHaveBeenCalled();
  });
  it('写入失败向上传递，空文件拒绝保存', async () => {
    fail = true;
    await expect(soundRepository.save(asset, new Blob(['audio']))).rejects.toThrow('quota');
    expect(stores.get('sounds')!.size).toBe(0);
    await expect(soundRepository.save(asset, new Blob([]))).rejects.toThrow('为空');
  });
  it('浏览器不支持数据库时明确失败', async () => {
    vi.stubGlobal('indexedDB', undefined); await expect(soundRepository.list()).rejects.toThrow('数据库');
  });
});

it('升级作品仓不破坏个人录音，真实作品Blob保存后重开仍可读取且未保存缓存不混入作品列表',async()=>{
 const {musicRepository}=await import('../services/storage/music');
 const blob=new Blob(['original recording'],{type:'audio/wav'});await soundRepository.save(asset,blob);
 const work={id:'music-1',title:'我的AI音乐',source:'live' as const,createdAt:123,updatedAt:123,duration:90,blob:new Blob(['actual music'],{type:'audio/mpeg'}),saved:false};
 await musicRepository.put(work);expect(await musicRepository.list()).toEqual([]);
 await musicRepository.put({...work,saved:true});expect(await musicRepository.get(work.id)).toMatchObject({id:'music-1',saved:true,source:'live'});expect((await musicRepository.list())[0].blob).toBe(work.blob);
 expect(await soundRepository.list()).toEqual([asset]);expect(await soundRepository.getBlob(asset.blobId!)).toBe(blob);expect(stores.has('music')).toBe(true);
});
