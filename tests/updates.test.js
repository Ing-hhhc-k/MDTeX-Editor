import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {compareVersions,parseRelease,registerUpdates}=createRequire(import.meta.url)('../electron/updates.cjs')
const release=(version='0.4.3')=>({tag_name:'v'+version,body:'更新说明',assets:[{state:'uploaded',browser_download_url:`https://github.com/Ing-hhhc-k/MDTeX-Editor/releases/download/v${version}/MDTeX-Editor-${version}-win-x64.zip`}]})
test('numeric version comparisons and validated Windows download',()=>{assert.equal(compareVersions('0.4.10','0.4.2'),1);assert.equal(compareVersions('v0.4.2','0.4.2'),0);assert.equal(parseRelease(release(),'0.4.2').available,true);assert.equal(parseRelease(release('0.4.1'),'0.4.2').available,false);assert.throws(()=>parseRelease({...release(),assets:[]},'0.4.2'),/尚未发布/);assert.throws(()=>parseRelease({...release(),prerelease:true},'0.4.2'),/正式版/)})
test('update IPC caches results, retries errors and opens only verified release asset',async()=>{
 const handlers=new Map(),sender={},opened=[];let calls=0,fail=false
 registerUpdates({app:{getVersion:()=> '0.4.2'},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>({webContents:sender}),shell:{openExternal:async url=>opened.push(url)},net:{fetch:async()=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>release()}}}})
 const call=(name,args)=>handlers.get(name)({sender},args)
 await assert.rejects(call('app:download-update'),/先检查/)
 await call('app:check-update');await call('app:check-update');assert.equal(calls,1)
 await call('app:download-update');assert.equal(opened[0],release().assets[0].browser_download_url)
 fail=true;await assert.rejects(call('app:check-update',{force:true}),/offline/);fail=false;await call('app:check-update',{force:true});assert.equal(calls,3)
 await assert.rejects(handlers.get('app:check-update')({sender:{}},{}),/无效来源/)
})
