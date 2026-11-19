import test from 'node:test'
import assert from 'node:assert/strict'
import { headingEdits } from '../src/numbering.js'
const headings = levels => levels.map((level,i)=>({level,text:'标题',pos:i*10}))
test('numbers siblings and nested headings in document order',()=>{
  assert.deepEqual(headingEdits(headings([1,2,2,3,1,2]),true).map(e=>e.prefix),['1 ','1.1 ','1.2 ','1.2.1 ','2 ','2.1 '])
})
test('fills skipped levels without zero sections',()=>{
  assert.deepEqual(headingEdits(headings([2,4,2]),true).map(e=>e.prefix),['1.1 ','1.1.1.1 ','1.2 '])
})
test('removes numbering without erasing numeric titles',()=>{
  const edits=headingEdits([{level:1,text:'2.3 研究',pos:0},{level:2,text:'2026年计划',pos:10}],false)
  assert.deepEqual(edits,[{from:1,to:5,prefix:'',changed:true}])
})
test('numbering is idempotent and renumbers stale prefixes',()=>{
  assert.equal(headingEdits([{level:1,text:'1 标题',pos:0}],true).length,0)
  assert.equal(headingEdits([{level:1,text:'9.2 标题',pos:0}],true)[0].prefix,'1 ')
})
test('current heading numbering uses full hierarchy and leaves other headings unchanged',()=>{
  const list = headings([1,2,2,3,1,2])
  assert.deepEqual(headingEdits(list,true,20),[{from:21,to:21,prefix:'1.2 ',changed:true}])
  assert.equal(headingEdits(list,true,30)[0].prefix,'1.2.1 ')
  assert.equal(headingEdits(list,true,50)[0].prefix,'2.1 ')
  assert.equal(headingEdits(list,true,999).length,0)
})
test('single heading removal only removes the selected prefix',()=>{
  const list=[{level:1,text:'1 一级',pos:0},{level:2,text:'1.1 二级',pos:10}]
  assert.deepEqual(headingEdits(list,false,10),[{from:11,to:15,prefix:'',changed:true}])
})
