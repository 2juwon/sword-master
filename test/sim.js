// 한판 검 강화: 봇으로 +29까지 걸리는 시도·돈·시간 추정
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../src/sword.html','utf8');
const a=src.indexOf('const ITEMS='),b=src.indexOf('/* ───── 검 모양');
const {T,SHOP,RECIPES,HOLD,MAX}=new Function(src.slice(a,b)+';return{T,SHOP,RECIPES,HOLD,MAX}')();
const skill={pro:[.55,.3],avg:[.3,.35],bad:[.1,.3]}[process.argv[2]||'avg'];
const N=+process.argv[3]||20;
function run(){
  const S={money:20000,prot:0,tier:0,items:{},store:[],grit:0,crack:false,att:0,breaks:0,rescue:0,protBought:0,maxMoney:0,secs:0,byT:{}};
  const has=(t)=>S.store.filter(x=>x===t).length;
  const need=c=>{if(c===0)return true;if(typeof c==='number')return S.money>=c;if(c.sw!=null)return has(c.sw)>=c.n;return(S.items[c.it]||0)>=c.n};
  const pay=c=>{if(typeof c==='number')S.money-=c;else if(c&&c.sw!=null)for(let i=0;i<c.n;i++)S.store.splice(S.store.indexOf(c.sw),1);else if(c&&c.it)S.items[c.it]-=c.n};
  // 위에서 기다리는 검이 이 단계 검을 재료로 원하는지
  const wanted=t=>S.store.some(x=>{const c=T[x].cost;return c&&c.sw===t&&has(t)<c.n});
  let guard=0;
  while(S.tier<MAX&&guard++<3e6){
    S.maxMoney=Math.max(S.maxMoney,S.money);
    const tr=T[S.tier];
    // +0이면: 꺼낼 검, 조합, 방지권 사기
    if(S.tier===0){
      // 조합: 빛가루→+13, 용암→+16, 원혼(12 남김)→+19, 나머지 잔해→방지권 (도끼 15·결정 2 남김)
      const it=S.items;const g=(k)=>it[k]||0;
      while(g('soul')>=22){it.soul-=10;S.store.push(19);S.secs+=3}
      while(g('light')>=8){it.light-=8;S.store.push(13);S.secs+=3}
      while(g('lava')>=6){it.lava-=6;S.store.push(16);S.secs+=3}
      while(g('iron')>=15){it.iron-=15;S.prot++}
      while(g('rune')>=10){it.rune-=10;S.prot++}
      while(g('red')>=10){it.red-=10;S.prot+=2}
      while(g('axe')>=23){it.axe-=8;S.prot+=10}
      while(g('crystal')>=7){it.crystal-=5;S.prot+=9}
      // 꺼낼 검: 다음 단계 재료가 있는 가장 높은 검 (재료로 기다리는 검은 빼고)
      const cand=[...new Set(S.store)].sort((x,y)=>y-x).find(t=>{const i=S.store.indexOf(t);S.store.splice(i,1);const ok=!wanted(t)&&need(T[t].cost);S.store.push(t);return ok});
      if(cand!=null){S.store.splice(S.store.indexOf(cand),1);S.tier=cand;S.crack=false;S.secs+=4;continue}
      // 방지권: 돈 넉넉하면 사 둠
      while(S.money>3e6&&S.prot<60){S.money-=400000;S.prot++;S.protBought++}
    }
    // 재료로 기다리는 검이면 보관
    if(S.tier>=13&&wanted(S.tier)&&S.store.length<20){S.store.push(S.tier);S.tier=0;S.crack=false;S.secs+=2;continue}
    if(!need(tr.cost)){
      if(typeof tr.cost==='number'){ // 돈 부족: 보관함 여분 팔기 → 지금 검 팔기 → 지원금
        const spare=S.store.filter(t=>!wanted(t)&&t<19&&T[t].sell>0).sort((x,y)=>x-y)[0];
        if(spare!=null){S.store.splice(S.store.indexOf(spare),1);S.money+=T[spare].sell;continue}
        const assets=S.money+(S.tier?Math.max(0,T[S.tier].sell):0);
        if(S.tier===0||assets<Math.max(1000,tr.cost)){S.money+=10000;S.rescue++;S.secs+=2;continue}
        S.money+=Math.round(T[S.tier].sell*(S.crack?.7:1));S.tier=0;S.crack=false;S.secs+=2;continue;
      }
      // 재료 부족: 보관하고 처음부터
      if(S.tier>=13&&S.store.length<20){S.store.push(S.tier);S.tier=0;S.crack=false;continue}
      S.tier=0;continue;
    }
    // 강화
    pay(tr.cost);S.att++;S.byT[S.tier]=(S.byT[S.tier]||0)+1;
    const r=Math.random(),tb=S.tier<15?0:r<skill[0]?5:r<skill[0]+skill[1]?2:0;
    const rate=Math.min(100,tr.p+(S.tier>=8?Math.min(S.grit,10)*.5:0)+tb);
    S.secs+=S.tier<15?.9:3*.36+(S.tier>=20?.9:.55)+1.8; // 연출 + 누르기까지
    if(Math.random()*100<rate){if(S.tier>=8)S.grit=0;S.tier++;S.crack=false;continue}
    if(rate>=HOLD&&!S.crack){S.crack=true;continue}
    S.breaks++;S.crack=false;if(S.tier>=8)S.grit=Math.min(10,S.grit+1);
    const d=tr.drop;if(d)S.items[d]=(S.items[d]||0)+1+Math.floor(Math.random()*(S.tier>=13?2:3));
    S.secs+=2.5;
    if(tr.prot>0){
      if(S.prot<tr.prot&&S.money>=400000*(tr.prot-S.prot)&&T[S.tier].sell>400000*tr.prot*2){const k=tr.prot-S.prot;S.money-=400000*k;S.prot+=k;S.protBought+=k}
      if(S.prot>=tr.prot){S.prot-=tr.prot;continue}
    }
    S.tier=0;
  }
  return S;
}
const R=[];for(let i=0;i<N;i++)R.push(run());
const med=f=>{const v=R.map(f).sort((x,y)=>x-y);return v[v.length>>1]};
const q=(f,p)=>{const v=R.map(f).sort((x,y)=>x-y);return v[Math.floor(v.length*p)]};
console.log('skill',process.argv[2]||'avg','runs',N);
console.log('attempts med',med(s=>s.att),'p10',q(s=>s.att,.1),'p90',q(s=>s.att,.9));
console.log('hours med',(med(s=>s.secs)/3600).toFixed(1),'p10',(q(s=>s.secs,.1)/3600).toFixed(1),'p90',(q(s=>s.secs,.9)/3600).toFixed(1));
console.log('breaks med',med(s=>s.breaks),'protBought med',med(s=>s.protBought),'rescue med',med(s=>s.rescue),'maxMoney med',med(s=>s.maxMoney).toExponential(2));
const groups=[[0,12],[13,20],[21,25],[26,28]];console.log('attempt share',groups.map(([x,y])=>`+${x}~${y}: `+(R.reduce((a,s)=>{let n=0;for(let t=x;t<=y;t++)n+=s.byT[t]||0;return a+n},0)/R.reduce((a,s)=>a+s.att,0)*100).toFixed(0)+'%').join(' / '));
console.log('reach26 med',med(s=>s.byT[26]||0),'reach28 med',med(s=>s.byT[28]||0));
console.log('done',R.filter(s=>s.tier===MAX).length);
