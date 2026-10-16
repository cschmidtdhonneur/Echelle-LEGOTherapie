const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createHash } = require('node:crypto');
let member = 'member-A', rows = new Map(), insertFails = false;
const wixData = {
  query() {
    let filters = [], order = [], offset = 0, count = 50;
    const q = {
      eq(k,v) { filters.push([k,v]); return q; },
      descending(...keys) { order = keys; return q; },
      skip(v) { offset=v; return q; }, limit(v) { count=v; return q; },
      async find(options) {
        assert.equal(options.suppressAuth,true); assert.equal(options.consistentRead,true);
        let items=[...rows.values()].filter(r=>filters.every(([k,v])=>r[k]===v));
        items.sort((a,b)=>{for(const k of order){if(a[k]!==b[k])return a[k]<b[k]?1:-1;}return 0;});
        const total=items.length; items=items.slice(offset,offset+count);
        return {items,hasNext:()=>offset+items.length<total};
      }
    }; return q;
  },
  async insert(collection,item,options) {
    assert.equal(options.suppressAuth,true);
    if(insertFails) throw Error('quota');
    if(rows.has(item._id)) throw Error('duplicate');
    rows.set(item._id,JSON.parse(JSON.stringify(item))); return item;
  }
};
const context={wixData,createHash,Buffer,Permissions:{SiteMember:'member'},webMethod:(p,f)=>f,
  currentMember:{async getMember(){return member?{_id:member}:undefined;}},console};
vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'../wix/lbtDossiers.web.js'),'utf8')
  .replace(/^import .*;\n/gm,'').replace(/export const /g,'var ');
vm.runInContext(source,context);
const id='12345678-1234-1234-1234-123456789abc';
const req=(revision=0)=>({memberId:member,dossierId:id,revision,payload:{state:{patient:{name:'Fictif'},evals:[]}}});
(async()=>{
  const a=await context.enregistrerDossier(req());assert.equal(a.ok,true);assert.equal(a.revision,1);
  assert.equal((await context.enregistrerDossier(req())).code,'CONFLICT');
  const pair=await Promise.all([context.enregistrerDossier(req(1)),context.enregistrerDossier(req(1))]);
  assert.equal(pair.filter(x=>x.ok).length,1);assert.equal(rows.size,2);
  const recordId=[...rows.keys()][0];
  member='member-B';
  await assert.rejects(context.chargerDossier({memberId:member,recordId}),/introuvable/);
  await assert.rejects(context.enregistrerDossier({...req(),memberId:'member-A'}),/modifié/);
  assert.equal((await context.listerDossiers({memberId:member})).items.length,0);
  member='member-A';
  const old=await context.chargerDossier({memberId:member,recordId});assert.equal(old.latestRevision,2);
  insertFails=true;await assert.rejects(context.enregistrerDossier(req(2)),/quota/);insertFails=false;
  for(let i=0;i<125;i++)rows.set('page'+i,{_id:'page'+i,memberId:member,dossierId:id,revision:i+3,payload:req().payload});
  let skip=0,total=0;do{const p=await context.listerDossiers({memberId:member,skip});total+=p.items.length;skip=p.next;}while(skip!==null);
  assert.equal(total,127);
  member='';await assert.rejects(context.verifierConnexion(),/déconnecté/);
  console.log('PASS Wix: isolation comptes, compte changé, conflit simultané, versions immuables, relecture, quota, pagination 127 versions, déconnexion');
})().catch(e=>{console.error(e);process.exitCode=1;});
