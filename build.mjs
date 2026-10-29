import {readFile,writeFile,mkdir} from 'node:fs/promises';
let css=await readFile('src/styles.css','utf8');
const fonts=await Promise.all([['regular',400],['medium',500],['semibold',600]].map(async([name,weight])=>`@font-face{font-family:'Fira Sans';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/ttf;base64,${(await readFile('src/fonts/fira-sans-'+name+'.ttf')).toString('base64')}) format('truetype');}`));
css=css.replace(/^@import[^\n]+\n/,fonts.join('\n')+'\n');
const data=await readFile('src/data.js','utf8');
const stripImports=source=>source.replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm,'');
const bulkEngine=stripImports(await readFile('src/bulk-engine.js','utf8'));
const training=stripImports(await readFile('src/training.js','utf8'));
const store=stripImports(await readFile('src/store.js','utf8'));
const alerts=stripImports(await readFile('src/alerts.js','utf8'));
const activity=stripImports(await readFile('src/activity.js','utf8'));
const app=stripImports(await readFile('src/app.js','utf8'));
const fidelity=(await readFile('src/fidelity.js','utf8')).replace('/* SANS LOGO */',await readFile('src/assets/sans-logo.svg','utf8')).replace('/* ICON CSV FILE */',(await readFile('src/assets/document-file-type-csv.svg','utf8')).trim()).replace('/* ICON UPLOAD CLOUD */',(await readFile('src/assets/upload-cloud-02.svg','utf8')).trim());
const people=await readFile('src/people.js','utf8');
const tables=await readFile('src/tables.js','utf8');
const profile=await readFile('src/profile.js','utf8');
const activityPage=await readFile('src/activity-page.js','utf8');
const bulkUi=await readFile('src/bulk-ui.js','utf8');
const importReview=await readFile('src/import-review.js','utf8');
const teams=await readFile('src/teams.js','utf8');
const motion=await readFile('src/motion.js','utf8');
css+='\n'+await readFile('src/fidelity.css','utf8');
// Material Symbols: embed the trimmed icon font, then give every existing `svg` icon rule a matching `.ms` rule
// so the font icons pick up the same sizes (glyphs drawn 25% larger, as Material icons carry built-in padding), colours and rotations the hand-drawn SVGs had.
const symbols=(await readFile('src/fonts/material-symbols-outlined.woff2')).toString('base64');
const msBase=`@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:300;font-display:block;src:url(data:font/woff2;base64,${symbols}) format('woff2');}
.ms{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;font-size:20px;line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;word-wrap:normal;direction:ltr;display:inline-flex;align-items:center;justify-content:center;width:1em;height:1em;overflow:visible;flex:none;user-select:none;-webkit-font-smoothing:antialiased;font-feature-settings:'liga' 0;font-variation-settings:'FILL' 0;vertical-align:middle}\n`;
css=css.replace(/([^{}]+)\{([^{}]*)\}/g,(rule,selector,decls)=>{
 if(selector.trim().startsWith('@')||!/(^|[^\w-])svg(?![\w-])/.test(selector))return rule;
 const sel=selector.split(',').map(s=>s.replace(/(^|[^\w-])svg(?![\w-])/g,'$1.ms')).join(',');
 const size=(decls.match(/(?:^|;)\s*width:\s*([\d.]+px)/)||decls.match(/(?:^|;)\s*height:\s*([\d.]+px)/)||[])[1];
 return rule+sel+'{'+decls+(size?';font-size:'+(parseFloat(size)*1.25)+'px':'')+'}';
});
css=msBase+css;
const template=await readFile('src/index.html','utf8');
await mkdir('dist',{recursive:true});
await writeFile('dist/index.html',template.replace('/* STYLES */',()=>css).replace('/* DATA */',()=>data.replaceAll('export ','' )+'\n'+training.replaceAll('export ','')+'\n'+bulkEngine.replaceAll('export ','')+'\n'+alerts.replaceAll('export ','')+'\n'+store.replaceAll('export ','')+'\n'+activity.replaceAll('export ','')).replace('/* APP */',()=>app+'\n'+fidelity+'\n'+people+'\n'+tables+'\n'+profile+'\n'+activityPage+'\n'+bulkUi+'\n'+importReview+'\n'+teams+'\n'+motion));
console.log('Built dist/index.html — standalone, no dependencies.');
