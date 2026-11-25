import { useEffect, useState, useRef } from 'react'

function headingOffsets(text) {
  const offsets=[];let offset=0,fence=null,math=false
  const lines=text.split('\n')
  for(let i=0;i<lines.length;i++){
    const line=lines[i],plain=line.replace(/^ {0,3}(?:>\s*)+/,''),code=/^ {0,3}(`{3,}|~{3,})/.exec(plain)
    if(code){if(!fence)fence=code[1];else if(code[1][0]===fence[0]&&code[1].length>=fence.length)fence=null}
    else if(!fence){
      if(/^\s*\$\$/.test(plain)){if((plain.match(/\$\$/g)||[]).length===1)math=!math}
      else if(!math){
        if(/^ {0,3}#{1,6}\s+\S/.test(plain)||plain.trim()&&/^ {0,3}(?:=+|-+)\s*$/.test(lines[i+1]||''))offsets.push(offset)
        else for(const match of line.matchAll(/<h[1-6]\b[^>]*>/gi))offsets.push(offset+match.index)
      }
    }
    offset+=line.length+1
  }
  return offsets
}

export default function useActiveHeading({editor,richRef,sourceRef,mode,markdown,revision,active,zoom}) {
  const [position,setPosition]=useState(null)
  const navigation=useRef(null)
  function selectHeading(pos,targetTop){navigation.current={pos,targetTop,active,until:performance.now()+3000};setPosition(pos)}
  useEffect(()=>{
    if(!editor)return
    const headings=[];editor.state.doc.descendants((node,pos)=>{if(node.type.name==='heading')headings.push(pos)})
    if(!headings.length){setPosition(null);return}
    const pane=richRef.current,input=sourceRef.current;let frame=0,mirror=null,tops=[],unlockTimer
    function rebuildSource(){
      mirror?.remove();mirror=null;tops=[]
      if(mode!=='source'||!input)return
      const offsets=headingOffsets(markdown)
      if(offsets.length!==headings.length)return
      const style=getComputedStyle(input);mirror=document.createElement('div')
      for(const key of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','wordSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','tabSize'])mirror.style[key]=style[key]
      Object.assign(mirror.style,{position:'fixed',left:'-100000px',top:'0',width:input.clientWidth+'px',boxSizing:'border-box',whiteSpace:'pre-wrap',overflowWrap:'break-word',visibility:'hidden'})
      let previous=0;const markers=[]
      for(const offset of offsets){mirror.append(document.createTextNode(markdown.slice(previous,offset)));const span=document.createElement('span');span.textContent='\u200b';mirror.append(span);markers.push(span);previous=offset}
      mirror.append(document.createTextNode(markdown.slice(previous)));document.body.append(mirror)
      const top=mirror.getBoundingClientRect().top;tops=markers.map(el=>el.getBoundingClientRect().top-top)
    }
    function measure(){
      frame=0;let index=0
      const pending=navigation.current
      if(pending&&pending.active===active&&performance.now()<pending.until){
        if(pending.targetTop===undefined||!pane||Math.abs(pane.scrollTop-pending.targetTop)>2){setPosition(pending.pos);clearTimeout(unlockTimer);unlockTimer=setTimeout(schedule,Math.max(16,pending.until-performance.now()+10));return}
      }
      navigation.current=null
      if(mode==='source'&&input&&tops.length){
        const top=input.scrollTop+parseFloat(getComputedStyle(input).paddingTop)+24
        for(let i=0;i<tops.length;i++)if(tops[i]<=top)index=i
        if(input.scrollTop>0&&input.scrollTop+input.clientHeight>=input.scrollHeight-2)index=headings.length-1
      }else if(mode!=='source'&&pane){
        const top=pane.getBoundingClientRect().top+65
        for(let i=0;i<headings.length;i++){const el=editor.view.nodeDOM(headings[i]);if(el?.getBoundingClientRect().top<=top)index=i}
        if(pane.scrollTop>0&&pane.scrollTop+pane.clientHeight>=pane.scrollHeight-2)index=headings.length-1
      }
      setPosition(headings[index])
    }
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
    const interrupt=()=>{navigation.current=null;schedule()}
    const resize=new ResizeObserver(()=>{rebuildSource();schedule()})
    if(pane)resize.observe(pane)
    if(input)resize.observe(input)
    if(editor.view.dom)resize.observe(editor.view.dom)
    pane?.addEventListener('scroll',schedule);input?.addEventListener('scroll',schedule)
    for(const event of ['wheel','pointerdown','touchstart','keydown'])pane?.addEventListener(event,interrupt,{passive:true})
    const fallback=setTimeout(schedule,3050)
    rebuildSource();schedule()
    return()=>{clearTimeout(fallback);clearTimeout(unlockTimer);cancelAnimationFrame(frame);resize.disconnect();mirror?.remove();pane?.removeEventListener('scroll',schedule);input?.removeEventListener('scroll',schedule);for(const event of ['wheel','pointerdown','touchstart','keydown'])pane?.removeEventListener(event,interrupt)}
  },[editor,richRef,sourceRef,mode,markdown,revision,active,zoom])
  useEffect(()=>{
    const button=document.querySelector(`.outline [data-outline-pos="${position}"]`),nav=button?.closest('.outline')
    if(!nav)return
    const r=button.getBoundingClientRect(),bounds=nav.getBoundingClientRect()
    if(r.top<bounds.top+4)nav.scrollTo({top:nav.scrollTop+r.top-bounds.top-4,behavior:'instant'})
    else if(r.bottom>bounds.bottom-4)nav.scrollTo({top:nav.scrollTop+r.bottom-bounds.bottom+4,behavior:'instant'})
  },[position])
  return {position,selectHeading}
}
