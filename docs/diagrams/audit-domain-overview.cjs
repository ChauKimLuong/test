const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {chromium}=require('C:/Users/xiaomi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const docs=path.resolve(__dirname,'..'),source=path.join(docs,'ClassDiagram_Presentation_ObjectRefs.html');
const h=fs.readFileSync(source,'utf8'),js=h.match(/<script>([\s\S]*?)<\/script>/)[1];
const d=vm.runInNewContext(js.slice(js.indexOf('const F='),js.indexOf('const viewport='))+';({nodes,edges:edges.filter(isShown),sceneDef})');
async function main(){
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const p=await b.newPage({viewport:{width:1600,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('file:///'+source.replace(/\\/g,'/'));
 const actual={};
 for(const sid of ['org','form','runtime']){
  await p.locator(`[data-scene=${sid}]`).click();
  for(const id of d.sceneDef[sid].ids){
   await p.locator(`[data-node-id="${id}"]`).click();
   actual[id]=await p.locator('#inspector .field-row code').allTextContents();
  }
 }
 await p.locator('#openOverview').click();
 const overviewTab=await p.locator('#overviewPanel').isVisible();
 await p.locator('[data-scene=org]').click();
 const returnToCanvas=await p.locator('#overviewPanel').isHidden();
 await p.goto('file:///'+path.join(docs,'ClassDiagram_Overview.svg').replace(/\\/g,'/'));
 const image=await p.evaluate(()=>({provenance:JSON.parse(document.getElementById('provenance').textContent),edges:[...document.querySelectorAll('path[data-from]')].map(e=>({from:e.dataset.from,to:e.dataset.to,kind:e.dataset.kind,a:e.dataset.multFrom,b:e.dataset.multTo})),classes:[...document.querySelectorAll('svg > g')].map(g=>({id:g.querySelector('text').textContent,fields:[...g.querySelectorAll('.field')].map(t=>t.textContent.replace(/^− /,''))})),labels:[...document.querySelectorAll('.rel')].map(t=>t.textContent),multiplicities:[...document.querySelectorAll('.mult')].map(t=>t.textContent)}));
 const differences=[];
 for(const n of d.nodes){const v=image.classes.find(c=>c.id===n.id);if(!v)differences.push(`missing ${n.id}`);else if(JSON.stringify(v.fields)!==JSON.stringify(actual[n.id]))differences.push(`fields mismatch ${n.id}`)}
 const expectedMultiplicities=d.edges.flatMap(e=>[e.a,e.b]);
 if(JSON.stringify(expectedMultiplicities)!==JSON.stringify(image.multiplicities))differences.push('multiplicity mismatch');
 if(JSON.stringify(d.edges.map(e=>e.label))!==JSON.stringify(image.labels))differences.push('relationship label mismatch');
 if(JSON.stringify(d.edges.map(({from,to,kind,a,b})=>({from,to,kind,a,b})))!==JSON.stringify(image.edges))differences.push('edge endpoint/kind mismatch');
 const hash=crypto.createHash('sha256').update(h).digest('hex');
 if(image.provenance.sha256!==hash)differences.push('stale source fingerprint');
 await p.setViewportSize({width:5360,height:2210});
 const rendered=await p.screenshot(),saved=fs.readFileSync(path.join(docs,'ClassDiagram_Overview.png'));
 const pngMatchesSvg=rendered.equals(saved);
 if(!pngMatchesSvg)differences.push('PNG does not match latest SVG render');
 if(!overviewTab||!returnToCanvas)differences.push('overview tab navigation failed');
 if(errors.length)differences.push(...errors);
 const report={source:path.basename(source),sourceSha256:hash,classes:d.nodes.length,fields:d.nodes.reduce((s,n)=>s+n.fields.length,0),relationships:d.edges.length,overviewTab,returnToCanvas,pngMatchesSvg,differences};
 await b.close();console.log(JSON.stringify(report,null,2));if(differences.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exit(1)});
