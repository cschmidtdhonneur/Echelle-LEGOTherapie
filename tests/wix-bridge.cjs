const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function el(){return {textContent:'',style:{},dataset:{},hidden:false,children:[],handlers:{},addEventListener(k,f){this.handlers[k]=f;},appendChild(n){this.children.push(n);},append(...n){this.children.push(...n);},replaceChildren(){this.children=[];},querySelector(k){return this.nodes[k]??=el();},nodes:{},showModal(){this.open=true;},close(){this.open=false;}};}
const body=el(),events={},sent=[];let uuid=0,toasts=[],saveStatus='',localOk=true;
const ctx={document:{referrer:'https://www.pose-ta-brique.fr/lbt-tracker',body,createElement:el},URL,Map,Set,Date,JSON,Error,console,
  crypto:{randomUUID:()=>++uuid===1?'request-1':'12345678-1234-1234-1234-'+String(uuid).padStart(12,'0')},
  setTimeout:()=>1,clearTimeout(){},confirm:()=>{throw Error('Confirmation de sauvegarde interdite');},alert(){},upsertCurrentFile:()=>localOk,updateSaveStatus:t=>{saveStatus=t;},getCurrentFileId:()=>ctx.state.fileId,
  serializeCurrentState:()=>JSON.parse(JSON.stringify(ctx.state)),showSaveToast:t=>toasts.push(t),saveLocal(){},
  state:{fileId:'local-1',patient:{name:'Fictif'},evals:[]},addEventListener(k,f){events[k]=f;}};
ctx.window=ctx;ctx.parent={postMessage(message,origin){sent.push({message,origin});}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../wix-backup.js'),'utf8'),ctx);
const panel=body.children[0];const tick=()=>new Promise(r=>setImmediate(r));
function reply(result,origin='https://www.pose-ta-brique.fr',source=ctx.parent){const m=sent.at(-1).message;events.message({origin,source,data:{channel:m.channel,requestId:m.requestId,result}});}
(async()=>{
  assert.equal(sent.length,0,'aucun transfert au démarrage');
  assert.equal(body.children.length,1,'aucun bouton flottant');
  ctx.saveLocal();assert.equal(sent.at(-1).origin,'https://www.pose-ta-brique.fr');
  reply({ok:true,protocol:1,memberId:'A'},'https://evil.example');await tick();assert.equal(sent.at(-1).message.action,'HELLO');
  reply({ok:true,protocol:1,memberId:'A'});await tick();
  assert.equal(sent.at(-1).message.action,'SAVE');const b=sent.at(-1).message.body;
  assert.equal(b.memberId,'A');assert.equal(b.revision,0);assert.equal(b.payload.state.patient.name,'Fictif');
  reply({ok:true,dossierId:b.dossierId,revision:1});await tick();assert.equal(ctx.state.wixBackup.revision,1);assert.match(saveStatus,/Enregistré sur cet appareil et sur votre espace membre/);
  ctx.saveLocal();reply({ok:true,protocol:1,memberId:'B'});await tick();assert.match(panel.querySelector('#wixBackupStatus').textContent,/compte a changé/);
  assert.equal(sent.at(-1).message.action,'HELLO','pas de copie vers le compte B');
  const before=sent.length;localOk=false;ctx.saveLocal();assert.equal(sent.length,before);assert.match(saveStatus,/locale impossible/);
  console.log('PASS pont Wix: un clic sans confirmation, aucun bouton flottant, aucun transfert initial, origine exacte, succès double sauvegarde, changement de compte bloqué, échec local bloque envoi');
})().catch(e=>{console.error(e);process.exitCode=1;});
