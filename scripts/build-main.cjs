const esbuild=require('esbuild'),fs=require('node:fs/promises')
;(async()=>{await esbuild.build({entryPoints:['electron/main.cjs'],bundle:true,platform:'node',target:'node22',format:'cjs',external:['electron'],outfile:'dist-electron/main.cjs'});await fs.copyFile('electron/preload.cjs','dist-electron/preload.cjs')})().catch(e=>{console.error(e);process.exitCode=1})
