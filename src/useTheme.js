import {useEffect,useState} from 'react'
export function readTheme(){try{const theme=localStorage.getItem('mdtex.theme');return ['system','light','dark'].includes(theme)?theme:'system'}catch{return 'system'}}
export default function useTheme(){
 const [theme,setTheme]=useState(readTheme)
 useEffect(()=>{
  const media=window.matchMedia('(prefers-color-scheme: dark)')
  const apply=()=>{const dark=theme==='dark'||(theme==='system'&&media.matches);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.documentElement.style.backgroundColor=dark?'#262626':'#fff'}
  try{localStorage.setItem('mdtex.theme',theme)}catch{}
  apply();media.addEventListener('change',apply);window.desktop?.setTheme(theme).catch(()=>{})
  return()=>media.removeEventListener('change',apply)
 },[theme])
 return [theme,setTheme]
}
