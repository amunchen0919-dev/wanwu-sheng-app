import {openDatabase} from './database';
import type { SoundAsset } from '../../types/domain';
import { type SoundRepository } from './contracts';
async function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let request: IDBRequest<T>;
    try { request = run(tx); } catch (error) { tx.abort(); db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('声音数据库读写失败，可能存储空间不足')); };
  });
}
export const soundRepository: SoundRepository = {
  async list() { const assets = await transaction<SoundAsset[]>(['sounds'], 'readonly', tx => tx.objectStore('sounds').getAll()); return assets.sort((a,b) => b.createdAt - a.createdAt); },
  async save(asset, blob) {
    if (!blob?.size || !asset.blobId) throw new Error('录音文件为空，无法保存');
    await transaction(['sounds', 'blobs'], 'readwrite', tx => {
      tx.objectStore('blobs').put(blob, asset.blobId!);
      return tx.objectStore('sounds').put(asset);
    });
  },
  async getBlob(id) { return transaction<Blob | undefined>(['blobs'], 'readonly', tx => tx.objectStore('blobs').get(id)); },
};
