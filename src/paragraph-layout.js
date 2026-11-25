import { Extension } from '@tiptap/core'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Heading } from '@tiptap/extension-heading'
import { DOMSerializer } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'

const types = ['paragraph','heading','blockMath']
const alignments = ['left','center','right']
function inheritedAlignment(state,pos) {
  const resolved=state.doc.resolve(pos)
  for(let depth=resolved.depth;depth>0;depth--){
    const parent=resolved.node(depth)
    if(['tableCell','tableHeader'].includes(parent.type.name)&&alignments.includes(parent.attrs.align))return parent.attrs.align
  }
  return 'left'
}

export function selectedTextBlocks(state) {
  const blocks = new Map()
  for (const range of state.selection.ranges) state.doc.nodesBetween(range.$from.pos,range.$to.pos,(node,pos) => {
    if (types.includes(node.type.name)) { blocks.set(pos,node); return false }
  })
  return [...blocks].map(([pos,node])=>({pos,node}))
}

export function selectionAlignment(editor) {
  if (!editor) return null
  const blocks=selectedTextBlocks(editor.state), values=new Set(blocks.map(({pos,node})=>node.attrs.textAlign||(node.type.name==='blockMath'?'center':inheritedAlignment(editor.state,pos))))
  return values.size===1 ? [...values][0] : null
}

export function createParagraphLayout() {
  let schema
  function renderAligned(node, helpers, context) {
    if (!node.attrs?.textAlign || node.attrs.textAlign==='left') return this.parent(node,helpers,context)
    return DOMSerializer.fromSchema(schema).serializeNode(schema.nodeFromJSON(node)).outerHTML.replace(/\r/g,'&#13;').replace(/\n/g,'&#10;')
  }
  return [
    Paragraph.extend({ onBeforeCreate(){schema=this.editor.schema}, renderMarkdown:renderAligned }),
    Heading.extend({ renderMarkdown:renderAligned }),
    Extension.create({
      name:'paragraphLayout',
      addGlobalAttributes(){return [{types,attributes:{textAlign:{
        default:null,
        parseHTML:element=>{const value=element.style.textAlign||element.getAttribute('align');return alignments.includes(value)?value:null},
        renderHTML:attrs=>alignments.includes(attrs.textAlign)?{style:`text-align: ${attrs.textAlign}`}:{},
      }}}]},
      addCommands(){return {setParagraphAlignment:value=>({editor,state,tr,dispatch})=>{
        if(!editor.isEditable||!alignments.includes(value))return false
        const blocks=selectedTextBlocks(state)
        if(!blocks.length)return false
        if(dispatch)closeHistory(tr)
        if(dispatch)for(const {pos,node} of blocks){
          const defaultAlign=node.type.name==='blockMath'?'center':inheritedAlignment(state,pos)
          const textAlign=value===defaultAlign?null:value
          if(node.attrs.textAlign!==textAlign)tr.setNodeMarkup(pos,undefined,{...node.attrs,textAlign})
        }
        return true
      }}},
    }),
  ]
}
