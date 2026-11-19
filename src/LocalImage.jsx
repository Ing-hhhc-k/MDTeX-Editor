import React,{useEffect,useState} from 'react'
import Image from '@tiptap/extension-image'
import {NodeViewWrapper,ReactNodeViewRenderer} from '@tiptap/react'
function LocalImageView({node}) {
  const [src,setSrc]=useState(''),[error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false
    const update=async()=>{
      const context=window.mdtexImageContext||{}
      try{
        const url=window.desktop?await window.desktop.previewImage({...context,src:node.attrs.src}):node.attrs.src
        if(!cancelled){setSrc(url);setError('')}
      }catch(e){if(!cancelled){setError('图片无法读取：'+e.message);setSrc('')}}
    }
    update();window.addEventListener('mdtex-image-context',update)
    return()=>{cancelled=true;window.removeEventListener('mdtex-image-context',update)}
  },[node.attrs.src])
  return <NodeViewWrapper className="local-image" contentEditable={false}>{src?<img src={src} alt={node.attrs.alt||''} title={node.attrs.title||undefined}/>:<span className="image-error">{error||'正在加载图片…'}</span>}</NodeViewWrapper>
}
export const LocalImage=Image.extend({addNodeView:()=>ReactNodeViewRenderer(LocalImageView)}).configure({allowBase64:true})
