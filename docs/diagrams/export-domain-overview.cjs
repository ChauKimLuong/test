const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const docs = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(docs, 'ClassDiagram_Presentation_ObjectRefs.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const data = vm.runInNewContext(js.slice(js.indexOf('const F='), js.indexOf('const viewport=')) + ';({nodes,edges:edges.filter(isShown),sceneDef})');
const sourceHash = crypto.createHash('sha256').update(html).digest('hex');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const W = 5360, H = 2210, panelW = 1700, panelY = 265, cardW = 350;
const groups = ['org', 'form', 'runtime'];
const colors = {org:'#e6efff', form:'#f0e9fd', runtime:'#e3f5ee'};
const accents = {org:'#245cba',form:'#7148b8',runtime:'#087a64'};
const boxes = {};
for (const n of data.nodes) {
  const i = groups.indexOf(n.group);
  boxes[n.id] = {x:40+i*1780+45+(n.x-40)*(402/360),y:panelY+170+(n.y-40)*1.45,w:cardW,h:56+n.fields.length*29+16};
}
let parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>text{font-family:Segoe UI,Arial,sans-serif;fill:#17243a}.field{font-size:19px}.mult{font-size:19px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:7px}.rel{font-size:18px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:8px}</style><rect width="100%" height="100%" fill="#fff"/><text x="45" y="53" font-size="34" font-weight="700">FlowPilot — Class diagram tổng thể</text><text x="45" y="91" font-size="21">Thuộc tính kiểu class và đường nối mô tả cùng một association · Tham chiếu ...Id được lược đường · ${data.nodes.length} class / ${data.nodes.reduce((s,n)=>s+n.fields.length,0)} thuộc tính / ${data.edges.length} quan hệ</text><text x="45" y="124" font-size="19">◆ Composition đặt ở phía lớp chứa · ? = 0..1 · List&lt;T&gt;: xem cận dưới trên đường · Enum giữ dưới dạng kiểu thuộc tính</text>`];
groups.forEach((g,i)=>{
  const x=40+i*1780;
  parts.push(`<rect x="${x}" y="${panelY}" width="${panelW}" height="1810" rx="12" fill="#fafcff" stroke="#ccd8e7" stroke-width="2"/><rect x="${x}" y="${panelY}" width="${panelW}" height="58" rx="12" fill="${colors[g]}"/><text x="${x+25}" y="${panelY+38}" font-size="26" font-weight="700" fill="${accents[g]}">${esc(data.sceneDef[g].title)}</text>`);
});
function drawRelation(e) {
  const a=boxes[e.from],b=boxes[e.to];
  let p,q,d,labelX,labelY;
  if(e.scene==='bridge') {
    const lane=e.from==='WorkflowVersion'?169:224;
    p={x:e.from==='WorkflowStep'?a.x+a.w:a.x+a.w/2,y:e.from==='WorkflowStep'?a.y+32:a.y};
    q={x:b.x+b.w/2,y:b.y};
    const routeX=e.from==='WorkflowStep'?p.x+23:p.x;
    d=`M ${p.x} ${p.y} L ${routeX} ${p.y} L ${routeX} ${lane} L ${q.x} ${lane} L ${q.x} ${q.y}`;
    labelX=(routeX+q.x)/2;labelY=lane-12;
  } else if(e.from===e.to && e.from==='OrganizationalUnit') {
    p={x:a.x+60,y:a.y+a.h};q={x:a.x+a.w-60,y:a.y+a.h};
    d=`M ${p.x} ${p.y} C ${p.x-25} ${p.y+110}, ${q.x+25} ${q.y+110}, ${q.x} ${q.y}`;
    labelX=a.x+a.w/2;labelY=p.y+90;
  } else if(e.from===e.to) {
    p={x:a.x,y:a.y+35};q={x:a.x,y:a.y+a.h-25};
    d=`M ${p.x} ${p.y} C ${p.x-88} ${p.y-20}, ${q.x-88} ${q.y+20}, ${q.x} ${q.y}`;
    labelX=a.x-85;labelY=a.y+a.h/2;
  } else {
    const ac={x:a.x+a.w/2,y:a.y+a.h/2},bc={x:b.x+b.w/2,y:b.y+b.h/2};
    const horizontal=Math.abs(ac.x-bc.x)>Math.abs(ac.y-bc.y),dir=horizontal?Math.sign(bc.x-ac.x):Math.sign(bc.y-ac.y);
    p={x:ac.x+(horizontal?dir*a.w/2:0),y:ac.y+(horizontal?0:dir*a.h/2)};
    q={x:bc.x-(horizontal?dir*b.w/2:0),y:bc.y-(horizontal?0:dir*b.h/2)};
    d=horizontal?`M ${p.x} ${p.y} L ${(p.x+q.x)/2} ${p.y} L ${(p.x+q.x)/2} ${q.y} L ${q.x} ${q.y}`:`M ${p.x} ${p.y} L ${p.x} ${(p.y+q.y)/2} L ${q.x} ${(p.y+q.y)/2} L ${q.x} ${q.y}`;
    labelX=(p.x+q.x)/2;labelY=horizontal?Math.max(a.y+a.h,b.y+b.h)+25:(p.y+q.y)/2-10;
  }
  parts.push(`<path data-from="${e.from}" data-to="${e.to}" data-kind="${e.kind}" data-mult-from="${e.a}" data-mult-to="${e.b}" d="${d}" fill="none" stroke="${e.scene?'#9b5a1f':'#526783'}" stroke-width="2.5"/>`);
  if(e.kind==='composition') {
    const ac={x:a.x+a.w/2,y:a.y+a.h/2};let vx=p.x-ac.x,vy=p.y-ac.y;const len=Math.hypot(vx,vy);vx/=len;vy/=len;
    parts.push(`<polygon points="${p.x},${p.y} ${p.x+vx*12-vy*8},${p.y+vy*12+vx*8} ${p.x+vx*24},${p.y+vy*24} ${p.x+vx*12+vy*8},${p.y+vy*12-vx*8}" fill="#344d72"/>`);
  }
  const horizontal=Math.abs(q.x-p.x)>Math.abs(q.y-p.y),dir=horizontal?Math.sign(q.x-p.x):Math.sign(q.y-p.y);
  const first=e.from===e.to?{x:p.x-9,y:p.y+(e.from==='OrganizationalUnit'?28:-10)}:horizontal?{x:p.x+dir*24,y:p.y-12}:{x:p.x+16,y:p.y+dir*33};
  const last=e.from===e.to?{x:q.x-9,y:q.y+25}:horizontal?{x:q.x-dir*24,y:q.y-12}:{x:q.x+16,y:q.y-dir*16};
  const leftLoop=e.from===e.to&&e.from==='EmployeeAssignment';
  parts.push(`<text class="mult" text-anchor="${leftLoop||horizontal&&dir<0?'end':'start'}" x="${first.x}" y="${first.y}">${esc(e.a)}</text><text class="mult" text-anchor="${leftLoop||horizontal&&dir>0?'end':'start'}" x="${last.x}" y="${last.y}">${esc(e.b)}</text><text class="rel" text-anchor="${leftLoop?'end':'middle'}" x="${labelX}" y="${labelY}">${esc(e.from===e.to?'parent / children'===e.label?'parent / children':'manager / subordinates':e.label)}</text>`);
}
data.edges.forEach(drawRelation);
for(const n of data.nodes) {
  const b=boxes[n.id];
  parts.push(`<g data-class="${n.id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#fff" stroke="#94aac5" stroke-width="1.8"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="44" fill="${colors[n.group]}" stroke="#94aac5" stroke-width="1.5"/><text x="${b.x+12}" y="${b.y+29}" font-size="23" font-weight="700">${esc(n.id)}</text>`);
  n.fields.forEach((f,i)=>parts.push(`<text class="field" x="${b.x+12}" y="${b.y+70+i*29}" ${f.association?'font-weight="600"':''}>− ${esc(f.signature)}</text>`));
  parts.push('</g>');
}
parts.push(`<text x="45" y="2130" font-size="20">Hai đường phía trên nối định nghĩa với thực thi: instance chốt version; step run thực thi bước cấu hình trong version đó.</text><text x="45" y="2168" font-size="19">Các thuộc tính in đậm biểu diễn association được vẽ. Cấu trúc WorkflowVersion.definition vẫn lưu JSON; không suy ra mỗi class phải có một bảng riêng.</text><text x="45" y="2198" font-size="17">Nguồn: ClassDiagram_Presentation_ObjectRefs.html · Xem cùng hình ở tab “Toàn bộ · đúng ảnh xuất”.</text><metadata id="provenance">${esc(JSON.stringify({source:'ClassDiagram_Presentation_ObjectRefs.html',sha256:sourceHash}))}</metadata></svg>`);
const svg=parts.join('');
fs.writeFileSync(path.join(docs,'ClassDiagram_Overview.svg'),svg,'utf8');
// Đồng bộ file draw.io theo cùng danh sách field của bản báo cáo.
let drawio='<mxfile host="app.diagrams.net" type="device">';
for(const [sid,sc] of Object.entries(data.sceneDef)){
  const nodes=data.nodes.filter(n=>sc.ids.includes(n.id));
  const edges=data.edges.filter(e=>sid==='bridge'?e.scene==='bridge':!e.scene&&sc.ids.includes(e.from)&&sc.ids.includes(e.to));
  drawio+=`<diagram id="${sid}" name="${esc(sc.title)}"><mxGraphModel grid="1" page="1" pageWidth="2200" pageHeight="2100"><root><mxCell id="0"/><mxCell id="1" parent="0"/>`;
  for(const n of nodes){
    const xy=sid==='bridge'?{WorkflowVersion:[70,80],WorkflowInstance:[950,80],WorkflowStep:[70,560],WorkflowStepRun:[950,560]}[n.id]:[n.x,n.y];
    const height=62+n.fields.length*26;
    drawio+=`<mxCell id="${n.id}" value="${esc(n.id)}" style="swimlane;html=1;startSize=38;fillColor=${colors[n.group]};swimlaneFillColor=#ffffff;fontSize=17;fontStyle=1;collapsible=0;" vertex="1" parent="1"><mxGeometry x="${xy[0]*1.3}" y="${xy[1]*1.5+80}" width="400" height="${height}" as="geometry"/></mxCell>`;
    const fields=n.fields.map(f=>'− '+esc(f.signature)).join('<br>');
    drawio+=`<mxCell id="${n.id}-fields" value="${esc(fields)}" style="text;html=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=8;whiteSpace=wrap;fontSize=14;fontStyle=0;" vertex="1" connectable="0" parent="${n.id}"><mxGeometry x="0" y="38" width="400" height="${height-38}" as="geometry"/></mxCell>`;
  }
  edges.forEach((e,i)=>{
    drawio+=`<mxCell id="edge${i}" value="${esc(e.label)}" style="edgeStyle=orthogonalEdgeStyle;html=1;endArrow=none;startArrow=${e.kind==='composition'?'diamond':'none'};startFill=1;strokeWidth=2;labelBackgroundColor=#ffffff;" edge="1" source="${e.from}" target="${e.to}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    for(const [side,m] of [[-1,e.a],[1,e.b]])drawio+=`<mxCell id="edge${i}-${side}" value="${esc(m)}" style="edgeLabel;html=1;resizable=0;labelBackgroundColor=#ffffff;" vertex="1" connectable="0" parent="edge${i}"><mxGeometry x="${side*.85}" y="0" relative="1" as="geometry"><mxPoint x="0" y="-18" as="offset"/></mxGeometry></mxCell>`;
  });
  drawio+='</root></mxGraphModel></diagram>';
}
drawio+='</mxfile>';
fs.writeFileSync(path.join(docs,'ClassDiagram_Presentation_ObjectRefs.drawio'),drawio,'utf8');
async function main(){
  const {chromium}=require('C:/Users/xiaomi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
  await page.goto('file:///'+path.join(docs,'ClassDiagram_Overview.svg').replace(/\\/g,'/'));
  await page.evaluate(()=>{
    for(const t of document.querySelectorAll('.field')){
      if(t.getComputedTextLength()>326){t.setAttribute('textLength','326');t.setAttribute('lengthAdjust','spacingAndGlyphs');}
    }
  });
  fs.writeFileSync(path.join(docs,'ClassDiagram_Overview.svg'),await page.locator('svg').evaluate(el=>el.outerHTML),'utf8');
  await page.screenshot({path:path.join(docs,'ClassDiagram_Overview.png')});
  await browser.close();console.log(`Exported ${data.nodes.length} classes / ${data.edges.length} relations, ${W}×${H}`);
}
main().catch(e=>{console.error(e);process.exit(1)});
