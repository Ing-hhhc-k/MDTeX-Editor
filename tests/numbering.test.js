import test from 'node:test'
import assert from 'node:assert/strict'
import { headingEdits } from '../src/numbering.js'
const headings = levels => levels.map((level,i)=>({level,text:'标题',pos:i*10}))
test('numbers siblings and nested headings in document order',()=>{
  assert.deepEqual(headingEdits(headings([1,2,2,3,1,2]),true).map(e=>e.prefix),['1 ','1.1 ','1.2 ','1.2.1 ','2 ','2.1 '])
})
test('uses only numbered ancestors, without inventing missing levels',()=>{
  assert.deepEqual(headingEdits(headings([2,4,2]),true).map(e=>e.prefix),['1 ','1.1 ','2 '])
})
test('removes numbering without erasing numeric titles',()=>{
  const edits=headingEdits([{level:1,text:'2.3 研究',pos:0},{level:2,text:'2026年计划',pos:10}],false)
  assert.deepEqual(edits,[{from:1,to:5,prefix:'',changed:true}])
})
test('numbering is idempotent and renumbers stale prefixes',()=>{
  assert.equal(headingEdits([{level:1,text:'1 标题',pos:0}],true).length,0)
  assert.equal(headingEdits([{level:1,text:'9.2 标题',pos:0}],true)[0].prefix,'1 ')
})
test('first selected heading starts at one regardless of its document index',()=>{
  const list = headings([1,2,2,3,1,2])
  assert.deepEqual(headingEdits(list,true,20),[{from:21,to:21,prefix:'1 ',changed:true}])
  assert.equal(headingEdits(list,true,30)[0].prefix,'1 ')
  assert.equal(headingEdits(list,true,50)[0].prefix,'1 ')
  assert.equal(headingEdits(list,true,999).length,0)
})
test('sparse siblings are numbered 2.1, unnumbered, 2.2 and update when earlier members change',()=>{
 const list=[{level:1,text:'1 甲',pos:0},{level:1,text:'2 乙',pos:10},{level:2,text:'第一节',pos:20},{level:2,text:'第二节',pos:30},{level:2,text:'2.1 第三节',pos:40}]
 assert.deepEqual(headingEdits(list,true,20).map(e=>[e.from,e.prefix]),[[21,'2.1 '],[41,'2.2 ']])
 list[2].text='2.1 第一节';list[4].text='2.2 第三节'
 assert.deepEqual(headingEdits(list,true,30).map(e=>[e.from,e.prefix]),[[31,'2.2 '],[41,'2.3 ']])
 assert.deepEqual(headingEdits(list,false,20).map(e=>[e.from,e.prefix]),[[21,''],[41,'2.1 ']])
})
test('adding an earlier first-level heading updates existing descendants; removing it closes the gap',()=>{
 const list=[{level:1,text:'前文',pos:0},{level:1,text:'1 后文',pos:10},{level:2,text:'1.1 内容',pos:20}]
 assert.deepEqual(headingEdits(list,true,0).map(e=>e.prefix),['1 ','2 ','2.1 '])
 list[0].text='1 前文';list[1].text='2 后文';list[2].text='2.1 内容'
 assert.deepEqual(headingEdits(list,false,0).map(e=>e.prefix),['','1 ','1.1 '])
})
test('unnumbered parents gain a prefix only when selected, and removing parents compresses descendants',()=>{
 const list=[{level:1,text:'上级',pos:0},{level:2,text:'1 第一节',pos:10},{level:2,text:'未编号',pos:20},{level:2,text:'2 第三节',pos:30}]
 assert.equal(headingEdits(list,null).length,0)
 assert.deepEqual(headingEdits(list,true,0).map(e=>e.prefix),['1 ','1.1 ','1.2 '])
 assert.deepEqual(headingEdits([{level:1,text:'1 上级',pos:0},{level:2,text:'1.1 子级',pos:10},{level:3,text:'1.1.1 孙级',pos:20}],false,10).map(e=>e.prefix),['','1.1 '])
})
test('editing, deleting and reordering maintain the existing numbered set only',()=>{
 const list=[{level:1,text:'2 乙',pos:0},{level:1,text:'未编号',pos:10},{level:1,text:'1 甲',pos:20}]
 assert.deepEqual(headingEdits(list,null).map(e=>[e.from,e.prefix]),[[1,'1 '],[21,'2 ']])
 assert.deepEqual(headingEdits(list.slice(1),null).map(e=>e.prefix),[])
})
test('single heading removal only removes the selected prefix',()=>{
  const list=[{level:1,text:'1 一级',pos:0},{level:2,text:'1.1 二级',pos:10}]
  assert.deepEqual(headingEdits(list,false,10),[{from:11,to:15,prefix:'',changed:true}])
})
