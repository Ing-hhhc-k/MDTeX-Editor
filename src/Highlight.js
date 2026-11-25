import { Mark, markInputRule, markPasteRule } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'

export const highlightColors = [
  {id:'red',name:'红色',value:'#fde2e2'},
  {id:'yellow',name:'黄色',value:'#fff1b8'},
  {id:'green',name:'绿色',value:'#dcf0df'},
  {id:'orange',name:'橙色',value:'#ffe6cc'},
  {id:'gray',name:'灰色',value:'#e8e8eb'},
]
const colorValue = color => highlightColors.find(item=>item.id===color)?.value || '#fff1b8'
const colorId = value => highlightColors.some(item=>item.id===value)?value:'yellow'
export const highlightOpening = color => `<mark data-highlight-color="${colorId(color)}" style="background-color: ${colorValue(color)}; color: inherit">`

export const Highlight = Mark.create({
  name:'highlight',
  addAttributes(){return {color:{default:'yellow',parseHTML:el=>colorId(el.getAttribute('data-highlight-color')),renderHTML:attrs=>({'data-highlight-color':colorId(attrs.color),style:`background-color: ${colorValue(attrs.color)}; color: inherit`})}}},
  parseHTML(){return [{tag:'mark'}]},
  renderHTML({HTMLAttributes}){return ['mark',HTMLAttributes,0]},
  markdownTokenizer:{
    name:'highlight',level:'inline',
    start:src=>src.indexOf('=='),
    tokenize(src,tokens,helpers){
      const match=/^==(?!=)((?:\\.|[^\\\n])+?)(?<!\\)==(?!=)/.exec(src)
      if(match&&match[1].trim())return {type:'highlight',raw:match[0],tokens:helpers.inlineTokens(match[1])}
    },
  },
  parseMarkdown:(token,h)=>h.applyMark('highlight',h.parseInline(token.tokens||[]),{color:'yellow'}),
  renderMarkdown(node,h,context){
    const text=h.renderChildren(node)
    return node.attrs?.color==='yellow'&&!context?.meta?.markText?.includes('==')?`==${text}==`:`${highlightOpening(node.attrs?.color)}${text}</mark>`
  },
  addCommands(){return {setHighlight:color=>({commands,tr})=>{closeHistory(tr);return commands.setMark(this.name,{color:colorId(color)})},unsetHighlight:()=>({commands,tr})=>{closeHistory(tr);return commands.unsetMark(this.name)}}},
  addInputRules(){return [markInputRule({find:/(?<![=\\])==(?!=)((?:\\.|[^\\\n])+?)(?<!\\)==$/,type:this.type,getAttributes:match=>match[1].trim()?{color:'yellow'}:false})]},
  addPasteRules(){return [markPasteRule({find:/(?<![=\\])==(?!=)((?:\\.|[^\\\n])+?)(?<!\\)==(?!=)/g,type:this.type,getAttributes:match=>match[1].trim()?{color:'yellow'}:false})]},
})
