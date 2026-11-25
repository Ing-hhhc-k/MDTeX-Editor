function sessionMetadata(data) {
  if(!Array.isArray(data?.docs))throw Error('无效文档会话')
  const docs=data.docs.filter(d=>typeof d.path==='string'&&/\.md$/i.test(d.path)).map(d=>({id:d.id,path:d.path,name:d.name,origin:d.origin||'file',workspaceRoot:d.workspaceRoot||null,numbered:!!d.numbered}))
  const ids=new Set(docs.map(d=>d.id)),openIds=(data.openIds||docs.map(d=>d.id)).filter(id=>ids.has(id))
  return {format:'manual-v1',docs,openIds,active:ids.has(data.active)?data.active:openIds[0]||null}
}
module.exports={sessionMetadata}
