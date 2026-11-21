import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {zipSync} from 'fflate'

export const remoteImage = src => /^(https?:)?\/\//i.test(src)
export function imageNodes(text) {
  const images=[],definitions=new Map(),references=new Set()
  function visit(node) {
    if(node.type==='image')images.push(node)
    if(node.type==='definition')definitions.set(node.identifier,node)
    if(node.type==='imageReference')references.add(node.identifier)
    for(const child of node.children||[])visit(child)
  }
  visit(fromMarkdown(text))
  for(const id of references)if(definitions.has(id))images.push(definitions.get(id))
  return images.sort((a,b)=>a.position.start.offset-b.position.start.offset)
}
export function imageType(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png'
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg'
  if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))return 'gif'
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'webp'
  if(bytes.subarray(0,2).toString()==='BM')return 'bmp'
  throw new Error('不是受支持的 PNG/JPEG/GIF/WebP/BMP 图片')
}
export async function readImage(src,baseDir) {
  let bytes
  if(/^data:/i.test(src)) {
    const match=/^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,([\s\S]+)$/i.exec(src)
    if(!match)throw new Error('不支持的内嵌图片格式')
    if(match[1].length>28*1024*1024)throw new Error('图片超过 20 MB')
    bytes=Buffer.from(match[1],'base64')
  } else {
    let file
    if(/^file:/i.test(src))file=fileURLToPath(src)
    else {
      if(/^[a-z][a-z\d+.-]*:/i.test(src)&&!path.win32.isAbsolute(src))throw new Error('不支持的图片地址')
      let decoded=src;try{decoded=decodeURIComponent(src)}catch{}
      file=path.isAbsolute(decoded)?decoded:path.resolve(baseDir,decoded)
    }
    if((await fs.stat(file)).size>20*1024*1024)throw new Error('图片超过 20 MB')
    bytes=await fs.readFile(file)
  }
  if(bytes.length>20*1024*1024)throw new Error('图片超过 20 MB')
  return {bytes,extension:imageType(bytes)}
}
export async function collectAssets(text,baseDir,{inline=false}={}) {
  const replacements=[],files=new Map();let total=0
  for(const node of imageNodes(text)) {
    if(remoteImage(node.url))continue
    let asset
    try{asset=await readImage(node.url,baseDir)}catch(e){throw new Error(`无法整理图片 ${node.url.slice(0,100)}：${e.message}`)}
    const name=createHash('sha256').update(asset.bytes).digest('hex').slice(0,24)+'.'+asset.extension
    const relative='picture/'+name
    if(!files.has(relative)){total+=asset.bytes.length;if(total>200*1024*1024)throw new Error('图片总量超过 200 MB');files.set(relative,asset.bytes)}
    const title=node.title?' "'+node.title.replace(/["\\]/g,'\\$&')+'"':''
    const url=inline?'data:image/'+(asset.extension==='jpg'?'jpeg':asset.extension)+';base64,'+asset.bytes.toString('base64'):relative
    const replacement=node.type==='definition'?`[${node.label||node.identifier}]: <${url}>${title}`:`![${(node.alt||'').replace(/[\[\]\\]/g,'\\$&')}](<${url}>${title})`
    replacements.push({start:node.position.start.offset,end:node.position.end.offset,text:replacement})
  }
  let result=text
  for(const r of replacements.reverse())result=result.slice(0,r.start)+r.text+result.slice(r.end)
  return {text:result,files}
}
export async function atomicWrite(file,bytes) {
  const temp=file+'.mdtex-'+randomUUID()+'.tmp'
  try{await fs.writeFile(temp,bytes);await fs.rename(temp,file)}catch(e){await fs.unlink(temp).catch(()=>{});throw e}
}
export async function writeDocument(file,assets) {
  const dir=path.dirname(file);await fs.mkdir(dir,{recursive:true})
  const created=[]
  try {
    if(assets.files.size){const picture=path.join(dir,'picture');try{const info=await fs.lstat(picture);if(info.isSymbolicLink()||!info.isDirectory())throw new Error('picture 必须是普通文件夹')}catch(e){if(e.code!=='ENOENT')throw e;await fs.mkdir(picture)}}
    for(const [name,bytes] of assets.files) {
      const dest=path.join(dir,name)
      try{await fs.writeFile(dest,bytes,{flag:'wx'});created.push(dest)}catch(e){if(e.code!=='EEXIST')throw e;const existing=await fs.readFile(dest);if(!existing.equals(bytes))throw new Error('图片文件名冲突，未覆盖已有文件')}
    }
    await atomicWrite(file,Buffer.from(assets.text,'utf8'))
  }catch(e){for(const f of created)await fs.unlink(f).catch(()=>{});throw e}
}
export async function exportArchive(dest,name,assets) {
  const base=name.replace(/\.(md|markdown)$/i,'').replace(/[\\/:*?"<>|]/g,'_')||'文档'
  const entries=Object.create(null);entries[base+'/'+name]=[Buffer.from(assets.text),{level:6}]
  for(const [file,bytes]of assets.files)entries[base+'/'+file]=[bytes,{level:0}]
  const bytes=zipSync(entries)
  await atomicWrite(dest,bytes)
}
