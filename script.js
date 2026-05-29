const APP_VERSION='VYRO_PRO_MAX_TERMINAL_V16_2_JSON_SMC_AI_TP_ENGINE';
const USER_KEY='vyro_pro_users';
const PIN_KEY='vyro_pro_pin';
const SESSION_KEY='vyro_pro_session';

let users=[],currentUser=null,ADMIN_PIN=localStorage.getItem(PIN_KEY)||'2606';
let API_BASE=window.location.origin,eventSource=null,lastDataTime=0,heartbeatTimer=null,hasRealtimeData=false;

function $(id){return document.getElementById(id)}
function initUsers(){
  let raw=localStorage.getItem(USER_KEY);
  if(raw){try{users=JSON.parse(raw)||[]}catch(e){users=[]}}
  if(!users.length){
    users=[
      {username:'admin',password:'2606',name:'Master Admin',plan:'vip',status:'active',expire:'2099-12-31',admin:true,email:'',createdAt:new Date().toISOString()},
      {username:'vip001',password:'123456',name:'VIP Client',plan:'pro',status:'active',expire:addDays(30),admin:false,email:'',createdAt:new Date().toISOString()}
    ];
    saveUsers();
  }
  ensureAdmin();
}
function ensureAdmin(){
  if(!users.find(u=>u.username==='admin')){
    users.unshift({username:'admin',password:'2606',name:'Master Admin',plan:'vip',status:'active',expire:'2099-12-31',admin:true,email:'',createdAt:new Date().toISOString()});
    saveUsers();
  }
}
function saveUsers(){localStorage.setItem(USER_KEY,JSON.stringify(users))}
function addDays(d,from){
  let x=from?new Date(from):new Date();
  if(isNaN(x.getTime())) x=new Date();
  x.setDate(x.getDate()+Number(d||0));
  return x.toISOString().slice(0,10);
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function safeUserArg(s){return String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function togglePass(id){let el=$(id);el.type=el.type==='password'?'text':'password'}
function setLoginLoading(on){let b=$('loginBtn');if(!b)return;b.classList.toggle('loading',!!on);$('loginBtnText').innerText=on?'Đang kiểm tra...':'Vào hệ thống'}
function markLoginError(){['loginUser','loginPass'].forEach(id=>{let wrap=$(id).closest('.input-wrap')||$(id);wrap.classList.add('input-error');setTimeout(()=>wrap.classList.remove('input-error'),450)})}
function showForgot(){showToast('Liên hệ quản trị VYRO để reset mật khẩu')}
function switchTab(m){$('tabLogin').classList.toggle('active',m==='login');$('tabReg').classList.toggle('active',m==='reg');$('loginForm').classList.toggle('hidden',m!=='login');$('regForm').classList.toggle('hidden',m!=='reg')}

function registerNow(){
  let u=$('regUser').value.trim(),p=$('regPass').value.trim();
  if(!u||!p)return showToast('Nhập tài khoản và mật khẩu');
  if(!/^[a-zA-Z0-9_.@-]{3,32}$/.test(u))return showToast('Username chỉ dùng chữ, số, ., _, @, -');
  if(users.find(x=>x.username.toLowerCase()===u.toLowerCase()))return showToast('Tài khoản đã tồn tại');
  users.push({username:u,password:p,name:$('regName').value.trim()||u,email:$('regEmail').value.trim(),plan:$('regPlan').value,status:'pending',expire:addDays(0),admin:false,createdAt:new Date().toISOString()});
  saveUsers();showToast('Đã đăng ký, chờ admin duyệt');switchTab('login');$('loginUser').value=u;
}

function loginNow(){
  let u=$('loginUser').value.trim(),p=$('loginPass').value.trim();
  setLoginLoading(true);
  setTimeout(()=>{
    let user=users.find(x=>x.username===u&&x.password===p);
    if(!user){setLoginLoading(false);markLoginError();return showToast('Sai tài khoản hoặc mật khẩu')}
    if(user.status==='pending'){setLoginLoading(false);return showToast('Tài khoản đang chờ duyệt')}
    if(user.status==='expired'||new Date(user.expire+'T23:59:59')<new Date()){setLoginLoading(false);return showToast('Tài khoản đã hết hạn hoặc bị khóa')}
    currentUser=user;
    localStorage.setItem(SESSION_KEY,user.username);
    enterApp(user);
    setLoginLoading(false);
  },260);
}
function enterApp(user){
  $('accountName').innerText=user.name||user.username;
  $('accountPlan').innerText=(user.plan||'basic').toUpperCase()+' AI';
  $('accountExpire').innerText='Hạn dùng: '+user.expire;
  $('login').classList.add('hidden');$('sidebar').classList.remove('hidden');$('app').classList.remove('hidden');
  if($('topAdminBtn')) $('topAdminBtn').classList.toggle('hidden',!user.admin);
  if(user.admin)unlockAdmin(true); else lockAdmin(false);
  connectApi();pullLatest();startHeartbeat();setTimeout(initTerminalChart,300);
  if(location.pathname.includes('/admin') && user.admin){setTimeout(()=>location.hash='#admin',100)}
}
function logout(){
  if(eventSource)eventSource.close();
  if(heartbeatTimer)clearInterval(heartbeatTimer);
  localStorage.removeItem(SESSION_KEY);currentUser=null;
  $('login').classList.remove('hidden');$('sidebar').classList.add('hidden');$('app').classList.add('hidden');if($('topAdminBtn')) $('topAdminBtn').classList.add('hidden');
  lockAdmin(false);
}
function openAdmin(){
  if(currentUser?.admin){$('adminModal').classList.remove('hidden');$('pin').focus();return}
  showToast('Chỉ tài khoản admin mới được mở quản trị');
}
function closeAdmin(){$('adminModal').classList.add('hidden')}
function unlockAdmin(silent=false){
  if(!currentUser?.admin && !silent)return showToast('Chỉ admin mới có quyền quản trị');
  if(!silent && $('pin').value!==ADMIN_PIN)return showToast('Sai PIN admin');
  $('adminLink').classList.remove('hidden');$('admin').classList.remove('hidden');$('pinInput').value='';renderUserTable();closeAdmin();
  if(!silent)location.hash='#admin';
}
function lockAdmin(show=true){$('adminLink').classList.add('hidden');$('admin').classList.add('hidden');if(show)showToast('Đã khóa Admin')}
function savePin(){
  let v=$('pinInput').value.trim();
  if(!v || v.length<4)return showToast('Nhập PIN mới tối thiểu 4 ký tự');
  ADMIN_PIN=v;localStorage.setItem(PIN_KEY,ADMIN_PIN);$('pinInput').value='';showToast('Đã đổi PIN admin');
}
function saveUser(){
  if(!currentUser?.admin)return showToast('Không có quyền');
  let u=$('newUser').value.trim();
  if(!u)return showToast('Nhập username');
  if(!/^[a-zA-Z0-9_.@-]{3,32}$/.test(u))return showToast('Username chỉ dùng chữ, số, ., _, @, -');
  let x=users.find(a=>a.username===u);
  let days=Number($('newDays').value||30);
  let data={
    password:$('newPass').value.trim()||(x?.password)||'123456',
    plan:$('newPlan').value,
    status:$('newStatus').value,
    expire:addDays(days),
    updatedAt:new Date().toISOString()
  };
  if(x){
    if(x.admin){data.status='active';data.plan='vip';data.expire='2099-12-31'}
    Object.assign(x,data);
  } else {
    users.push({username:u,name:u,email:'',admin:false,createdAt:new Date().toISOString(),...data});
  }
  saveUsers();renderUserTable();showToast('Đã lưu user');
  $('newUser').value='';$('newPass').value='';
}
function editUser(u){
  let x=users.find(a=>a.username===u);if(!x)return;
  $('newUser').value=x.username;$('newPass').value=x.password;$('newPlan').value=x.plan;$('newStatus').value=x.status;$('newDays').value=30;
  showToast('Đã đưa user lên form sửa');
}
function setStatus(u,s){
  let x=users.find(a=>a.username===u);
  if(x&&!x.admin){x.status=s;if(s==='active'&&new Date(x.expire+'T23:59:59')<new Date())x.expire=addDays(30);saveUsers();renderUserTable();showToast('Đã cập nhật trạng thái')}
}
function extendUser(u,d){
  let x=users.find(a=>a.username===u);
  if(x){let base=new Date(x.expire+'T00:00:00')>new Date()?x.expire:null;x.expire=addDays(d,base);x.status='active';saveUsers();renderUserTable();showToast('Đã gia hạn +'+d+' ngày')}
}
function delUser(u){
  if(u==='admin')return showToast('Không thể xóa admin gốc');
  if(!confirm('Xóa user '+u+'?'))return;
  users=users.filter(x=>x.username!==u);saveUsers();renderUserTable();showToast('Đã xóa user');
}
function renderUserTable(){
  if(!$('userTable'))return;
  let q=($('userSearch')?.value||'').toLowerCase().trim();
  let list=users.filter(u=>!q || [u.username,u.name,u.plan,u.status,u.expire,u.email].join(' ').toLowerCase().includes(q));
  $('totalUsers').innerText=users.length;
  $('activeUsers').innerText=users.filter(u=>u.status==='active').length;
  $('pendingUsers').innerText=users.filter(u=>u.status==='pending').length;
  $('expiredUsers').innerText=users.filter(u=>u.status==='expired'||new Date(u.expire+'T23:59:59')<new Date()).length;
  $('userTable').innerHTML='<div class="user-row head"><span>User</span><span>Plan</span><span>Status</span><span>Expire</span><span>Action</span></div>';
  list.forEach(u=>{
    let r=document.createElement('div');r.className='user-row';
    let statusClass='status-'+(u.status||'pending');
    r.innerHTML=`<span><b>${escapeHtml(u.username)}</b><small>${escapeHtml(u.name||'')}</small></span><span>${escapeHtml(u.plan)}</span><span class="${statusClass}">${escapeHtml(u.status)}${u.admin?' · ADMIN':''}</span><span>${escapeHtml(u.expire)}</span><span><button onclick="editUser('${safeUserArg(u.username)}')">Sửa</button><button onclick="setStatus('${safeUserArg(u.username)}','active')">Duyệt</button><button onclick="extendUser('${safeUserArg(u.username)}',30)">+30d</button><button onclick="setStatus('${safeUserArg(u.username)}','expired')">Khóa</button><button onclick="delUser('${safeUserArg(u.username)}')">Xóa</button></span>`;
    $('userTable').appendChild(r);
  })
}
function exportUsers(){
  let blob=new Blob([JSON.stringify(users,null,2)],{type:'application/json'});
  let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='vyro-pro-users.json';a.click();URL.revokeObjectURL(a.href);
}
function importUsers(e){
  let f=e.target.files&&e.target.files[0]; if(!f)return;
  let r=new FileReader();
  r.onload=()=>{try{let arr=JSON.parse(r.result);if(!Array.isArray(arr))throw new Error('bad');users=arr;ensureAdmin();saveUsers();renderUserTable();showToast('Đã import users')}catch(err){showToast('File import không hợp lệ')}};
  r.readAsText(f); e.target.value='';
}
function resetDemoData(){
  if(!confirm('Reset dữ liệu demo về mặc định?'))return;
  localStorage.removeItem(USER_KEY);initUsers();renderUserTable();showToast('Đã reset demo');
}

function connectApi(){
  try{
    if(eventSource)eventSource.close();
    eventSource=new EventSource(API_BASE+'/api/stream');
    eventSource.addEventListener('connected',()=>setApiState(true));
    eventSource.addEventListener('signal',e=>{try{let d=JSON.parse(e.data);updateSignal(d);setApiState(true)}catch(err){}});
    eventSource.addEventListener('ping',()=>setApiState(true));
    eventSource.onerror=()=>{setApiState(false);};
  }catch(e){setApiState(false)}
}
function setApiState(ok){$('apiStatusText').innerText=ok?'ONLINE':'STANDBY';$('connectionText').innerText=ok?'ONLINE':'STANDBY'; if($('apiSubText'))$('apiSubText').innerText=ok?'SSE realtime - nhận tức thì từ MT5':'Chờ backend realtime';}
async function pullLatest(){
  try{let r=await fetch(API_BASE+'/api/latest-signal',{cache:'no-store'}),d=await r.json();if(d&&d.symbol){updateSignal(d);setApiState(true)}else throw new Error('empty')}
  catch(e){setApiState(false);showWaitingRealtime();showToast('Chưa có backend realtime hoặc MT5 chưa gửi dữ liệu')}
}
function showWaitingRealtime(){
  if(hasRealtimeData) return;
  updateSignal({symbol:'XAUUSD.G',timeframe:'M1',signal:'WAIT',score:55,price:'--',rsi:'--',flow:'--',delta:'--',power:'--',buySell:'--',reason:'Đang chờ dữ liệu realtime từ MT5 EA Bridge.',trend:'WAITING',liquidity:'WAITING',pressure:'WAITING',risk:'WAITING',source:'WAITING_FOR_MT5',realtime:false});
}
function norm(v){let s=String(v||'WAIT').toUpperCase();if(s.includes('SELL'))return'SELL NOW';if(s.includes('BUY'))return'BUY NOW';return'WAIT'}
function nval(v){let x=Number(v);return isNaN(x)?0:x}

function firstVal(obj, keys, fallback='--'){
  function get(o,k){
    if(!o || typeof o!=='object') return undefined;
    if(o[k]!==undefined && o[k]!==null && o[k]!=='') return o[k];
    if(o.raw && o.raw[k]!==undefined && o.raw[k]!==null && o.raw[k]!=='') return o.raw[k];
    if(o.smc && o.smc[k]!==undefined && o.smc[k]!==null && o.smc[k]!=='') return o.smc[k];
    if(o.zones && o.zones[k]!==undefined && o.zones[k]!==null && o.zones[k]!=='') return o.zones[k];
    return undefined;
  }
  for(const k of keys){
    const v=get(obj,k); if(v!==undefined) return v;
  }
  return fallback;
}
function rawFlow(s){return firstVal(s,['flow','FLOW','cvd'],'--')}
function rawDelta(s){return firstVal(s,['delta','DELTA','powerDelta'],'--')}
function rawPower(s){return firstVal(s,['power','POWER','diff'],'--')}
function rawBuySell(s){let v=firstVal(s,['buySell','buy_sell','ratio','BUY/SELL','buy_sell_ratio'],'--'); if((v==='--'||v==='0/0') && s.buySellRatio!==undefined){let n=Number(s.buySellRatio); if(Number.isFinite(n)) return n>=5?`${n.toFixed(1)}/0.6`:`0.6/${Math.max(0,10-n).toFixed(1)}`;} return v;}
function zoneVal(s,type){
  const keys=type==='sell'?['sellZone','sell_zone','supply','supplyZone','smcSellZone','smc_supply','supply_line','supplyPrice']:['buyZone','buy_zone','demand','demandZone','smcBuyZone','smc_demand','demand_line','demandPrice'];
  return firstVal(s,keys,'--');
}
function smcVal(s,keys,fallback='--'){return firstVal(s,keys,fallback)}
function cleanDisplay(v,fallback='--'){
  if(v===undefined||v===null) return fallback;
  if(Array.isArray(v)) v=v.find(x=>cleanDisplay(x,'')!=='') || '';
  if(typeof v==='object') v=v.text || v.value || v.price || '';
  const t=String(v).trim();
  if(!t||t==='0'||t==='0.0'||t==='0.00'||t==='0/0'||t.toLowerCase()==='false'||t.toLowerCase()==='null'||t.toLowerCase()==='undefined'||t.toLowerCase()==='nan'||t.toLowerCase()==='n/a'||t.toUpperCase()==='N/A') return fallback;
  return t;
}
function cleanZone(v){ return cleanDisplay(v,'--'); }

function dominanceFrom(s,sig){let f=nval(rawFlow(s)),d=nval(rawDelta(s));if(f<0&&d<0)return'Seller dominant';if(f>0&&d>0)return'Buyer dominant';if(sig.includes('SELL'))return'Seller dominant';if(sig.includes('BUY'))return'Buyer dominant';return'Mixed'}
function updateSignal(s){
  if(s && s.realtime!==false && s.source!=='WAITING_FOR_MT5') hasRealtimeData=true;
  let sig=norm(s.signal),sc=Math.max(0,Math.min(100,Number(s.score||s.confidence||s.conf||55))),p=s.price||s.bid||s.ask||'--',fv=rawFlow(s),dv=rawDelta(s),pv=rawPower(s),bs=rawBuySell(s),dom=dominanceFrom(s,sig);
  let sellZ=cleanZone(zoneVal(s,'sell')), buyZ=cleanZone(zoneVal(s,'buy'));
  let liquidity=cleanDisplay(smcVal(s,['liquidity','liq','ssl','bsl','liquidityText','liquiditySweep'],'WAITING'),'WAITING');
  let bos=cleanDisplay(smcVal(s,['bosChoch','bos_choch','structureSignal'],'WAITING'),'WAITING');
  let stopHunt=cleanDisplay(smcVal(s,['stopHunt','stophunt','stop_hunt'],'WAITING'),'WAITING');
  let fvg=cleanDisplay(smcVal(s,['fvg','fvgZone','fvg_zone'],'WAITING'),'WAITING');
  let ob=cleanDisplay(smcVal(s,['ob','obZone','orderBlock','order_block'],'WAITING'),'WAITING');
  let tp1=cleanDisplay(smcVal(s,['tp1','TP1'],'--'),'--'), tp2=cleanDisplay(smcVal(s,['tp2','TP2'],'--'),'--'), tp3=cleanDisplay(smcVal(s,['tp3','TP3'],'--'),'--');
  document.body.classList.remove('sell','buy','wait');document.body.classList.add(sig.includes('SELL')?'sell':sig.includes('BUY')?'buy':'wait');
  $('signal').innerText=sig;$('score').innerText=sc;$('ring').style.background=`conic-gradient(var(--cyan) ${sc}%,rgba(255,255,255,.12) 0)`;
  $('reason').innerText=s.reason||`${s.symbol||'XAUUSD'} ${sig} from MT5 Smart Flow.`;$('marketTag').innerText=`${s.symbol||'XAUUSD'} · ${s.timeframe||'M1'} · SMART FLOW`;
  $('price').innerText=p;$('priceState').innerText=sig.replace(' NOW','');$('rsi').innerText=s.rsi||'--';$('flow').innerText=fv;$('flowSub').innerText=dom;$('delta').innerText=dv;
  $('deltaSub').innerText=nval(dv)>0?'Buyer attack':nval(dv)<0?'Seller attack':'Neutral attack';$('power').innerText=pv;$('buySell').innerText=bs;$('conf').innerText=sc+'%';$('lastUpdate').innerText=fmt(s.updatedAt||s.receivedAt||new Date().toISOString());
  if($('sellZone'))$('sellZone').innerText=sellZ;if($('buyZone'))$('buyZone').innerText=buyZ;if($('noTradeZone'))$('noTradeZone').innerText=cleanDisplay(s.noTrade,'WAITING');$('trend').innerText=cleanDisplay(s.trend,sig.replace(' NOW',''));$('liquidity').innerText=liquidity;$('pressure').innerText=cleanDisplay(s.pressure,sig);$('risk').innerText=cleanDisplay(s.risk,'WAITING');$('action').innerText=cleanDisplay(s.action,'WAITING');$('source').innerText=s.source||'MT5';$('dominance').innerText=dom;$('dominanceNote').innerText=`Flow ${fv} · Delta ${dv} · Power ${pv}`;$('lastTick').innerText=p;lastDataTime=Date.now();addHistory(sig,p,fv,dv);
  updateSMCPanel({s,sig,sc,p,fv,dv,pv,bs,dom,sellZ,buyZ,liquidity,bos,stopHunt,fvg,ob,tp1,tp2,tp3});
  updateTerminalChart({price:p,signal:sig,sellZone:sellZ,buyZone:buyZ,tp1,tp2,tp3,fvg,liquidity,updatedAt:s.updatedAt||s.receivedAt||new Date().toISOString()});
}
function addHistory(sig,p,fv,dv){
  if(sig==='WAIT'&&p==='--'&&$('historyTable').children.length>1)return;
  let row=document.createElement('div');row.className='row';let cls=sig.includes('SELL')?'sell-text':sig.includes('BUY')?'buy-text':'wait-text';
  row.innerHTML=`<span>${fmt(new Date())}</span><span class="${cls}">${sig}</span><span>${escapeHtml(p)}</span><span>${escapeHtml(fv)}</span><span>${escapeHtml(dv)}</span>`;
  $('historyTable').insertBefore(row,$('historyTable').children[1]||null);while($('historyTable').children.length>10)$('historyTable').removeChild($('historyTable').lastChild)
}
function startHeartbeat(){
  if(heartbeatTimer)clearInterval(heartbeatTimer);
  heartbeatTimer=setInterval(()=>{$('heartbeat').innerText=new Date().toLocaleTimeString('vi-VN');$('mode').innerText=!hasRealtimeData?'WAITING MT5':(lastDataTime&&Date.now()-lastDataTime>30000?'NO NEW SIGNAL':'LIVE');$('age').innerText=lastDataTime?Math.floor((Date.now()-lastDataTime)/1000)+'s ago':'waiting'},1000)
}
function copySignal(){navigator.clipboard.writeText(`VYRO PRO ${$('signal').innerText} ${$('price').innerText} FLOW ${$('flow').innerText} DELTA ${$('delta').innerText}`).then(()=>showToast('Copied'))}
function fmt(x){try{return new Date(x).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}catch(e){return'--'}}
function showToast(t){$('toast').innerText=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1900)}

document.addEventListener('click',e=>{let a=e.target.closest('nav a');if(a){document.querySelectorAll('nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active')}});
window.addEventListener('load',()=>{
  initUsers();
  let ses=localStorage.getItem(SESSION_KEY),u=users.find(x=>x.username===ses);
  if(u && u.status==='active' && new Date(u.expire+'T23:59:59')>=new Date()){currentUser=u;enterApp(u)}
  if(location.pathname.includes('/admin')&&!currentUser){showToast('Đăng nhập bằng tài khoản admin để mở quản trị')}
});

// ===== V18.2 CLEAN FRONTEND ENGINE: single stream + V16.3 viewport + BOS/CHOCH =====
(function(){
  'use strict';
  const VERSION = 'V18.2_CLEAN_BOS_CHOCH_ENGINE';
  window.VYRO_VERSION = VERSION;

  const $ = id => document.getElementById(id);
  const q = s => document.querySelector(s);
  const num = v => {
    if (v === undefined || v === null) return NaN;
    if (typeof v === 'object') v = v.price || v.value || v.text || v.label || v.name || '';
    const m = String(v).replace(/,/g,'').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  };
  const fmt = v => Number.isFinite(v) ? Number(v).toFixed(2) : 'WAITING';
  const clean = (v, fb='WAITING') => {
    if (v === undefined || v === null || v === false || v === 0) return fb;
    if (Array.isArray(v)) {
      const x = v.find(i => clean(i, '') !== '');
      return x === undefined ? fb : clean(x, fb);
    }
    if (typeof v === 'object') return clean(v.text || v.value || v.price || v.name || v.label || '', fb);
    const t = String(v).trim();
    if (!t || ['0','0.0','0.00','0/0','false','null','undefined','nan','n/a','N/A','--','WAITING_FOR_MT5'].includes(t)) return fb;
    return t;
  };
  const put = (id, val, fb='WAITING') => {
    const el = $(id);
    if (!el) return;
    const next = clean(val, fb);
    if (el.textContent !== next) el.textContent = next;
    el.classList.toggle('waiting', next === 'WAITING');
    el.classList.toggle('active-red', /SELL|BEAR|SSL|SUPPLY|ARMED/i.test(next));
    el.classList.toggle('active-green', /BUY|BULL|BSL|DEMAND/i.test(next));
  };

  const S = { latest:{}, candles:[], canvas:null, ctx:null, raf:0, tf:'M1', stream:null, poll:null, maxCandles:160 };

  function stringify(raw) { try { return JSON.stringify(raw || {}).replace(/_/g, ' '); } catch(e) { return ''; } }
  function normalizeBOSCHOCH(raw) {
    const txt = stringify(raw).toUpperCase();
    let bos = 'WAITING', choch = 'WAITING';
    if (txt.includes('BOS BUY') || txt.includes('BULLISH BOS')) bos = 'BOS BUY';
    if (txt.includes('BOS SELL') || txt.includes('BEARISH BOS')) bos = 'BOS SELL';
    if (txt.includes('CHOCH BUY') || txt.includes('BULLISH CHOCH')) choch = 'CHOCH BUY';
    if (txt.includes('CHOCH SELL') || txt.includes('BEARISH CHOCH')) choch = 'CHOCH SELL';
    const bosChoch = choch !== 'WAITING' ? choch : (bos !== 'WAITING' ? bos : 'WAITING');
    return { bos, choch, bosChoch };
  }
  function deepGet(s, keys) {
    const roots = [s, s && s.smc, s && s.raw, s && s.zones, s && s.aiTargets];
    for (const r of roots) {
      if (!r || typeof r !== 'object') continue;
      for (const k of keys) if (clean(r[k], '') !== '') return r[k];
    }
    return null;
  }
  function objectList(s) {
    const arr = [];
    const push = o => {
      if (!o) return;
      if (typeof o === 'string') o = { text: o };
      const name = clean(o.name || o.object || o.id, '');
      const text = clean(o.text || o.label || o.value, '');
      const price = num(o.price || o.p || o.y || o.level || text || name);
      const raw = (name + ' ' + text).trim();
      if (raw || Number.isFinite(price)) arr.push({ name, text, price, raw, type: classify(raw) });
    };
    ['objects','chartObjects','smcObjects'].forEach(k => Array.isArray(s[k]) && s[k].forEach(push));
    return arr;
  }
  function classify(v) {
    const b = String(v || '').toUpperCase().replace(/_/g,' ');
    if (/TP\s*1|TP1|TAKE PROFIT\s*1/.test(b)) return 'TP1';
    if (/TP\s*2|TP2|TAKE PROFIT\s*2/.test(b)) return 'TP2';
    if (/TP\s*3|TP3|TAKE PROFIT\s*3/.test(b)) return 'TP3';
    if (/CHOCH|CHANGE\s+OF\s+CHARACTER/.test(b)) return 'CHOCH';
    if (/\bBOS\b|BREAK\s+OF\s+STRUCTURE/.test(b)) return 'BOS';
    if (/\bSSL\b|SELL\s+SIDE\s+LIQUIDITY/.test(b)) return 'SSL';
    if (/\bBSL\b|BUY\s+SIDE\s+LIQUIDITY/.test(b)) return 'BSL';
    if (/STOP\s*HUNT|STOPHUNT|SWEEP|ARMED/.test(b)) return 'STOP_HUNT';
    if (/FVG|FAIR\s+VALUE\s+GAP|IMBALANCE/.test(b)) return 'FVG';
    if (/SUPPLY|SELL\s*ZONE|SELL\s*AREA|BEARISH\s*OB|SELL\s*OB/.test(b) && !/TP|TAKE PROFIT|STOP LOSS|\bSL\b|ENTRY|NO TRADE/.test(b)) return 'SUPPLY';
    if (/DEMAND|BUY\s*ZONE|BUY\s*AREA|BULLISH\s*OB|BUY\s*OB/.test(b) && !/TP|TAKE PROFIT|STOP LOSS|\bSL\b|ENTRY|NO TRADE/.test(b)) return 'DEMAND';
    if (/ORDER\s*BLOCK|\bOB\b/.test(b)) return 'OB';
    return '';
  }
  function normalize(raw={}) {
    const objects = objectList(raw);
    const patch = normalizeBOSCHOCH(raw);
    const price = num(raw.price || raw.bid || raw.ask || raw.close || deepGet(raw, ['price','bid','ask']));
    const near = type => {
      const list = objects.filter(o => o.type === type && Number.isFinite(o.price));
      if (!list.length) return null;
      if (Number.isFinite(price)) list.sort((a,b) => Math.abs(a.price - price) - Math.abs(b.price - price));
      return list[0];
    };
    const by = type => objects.find(o => o.type === type);
    const sellZone = num(deepGet(raw, ['sellZone','sell_zone','supply','supplyZone','supplyLine','supply_line','smc_supply'])) || num(near('SUPPLY') && near('SUPPLY').price);
    const buyZone  = num(deepGet(raw, ['buyZone','buy_zone','demand','demandZone','demandLine','demand_line','smc_demand'])) || num(near('DEMAND') && near('DEMAND').price);
    const tp1 = num(deepGet(raw, ['tp1','TP1'])) || num(by('TP1') && by('TP1').price);
    const tp2 = num(deepGet(raw, ['tp2','TP2'])) || num(by('TP2') && by('TP2').price);
    const tp3 = num(deepGet(raw, ['tp3','TP3'])) || num(by('TP3') && by('TP3').price);
    const all = stringify(raw).toUpperCase();
    const liqRaw = clean(deepGet(raw, ['liquidity','liquidityText','liq','ssl','bsl']), '');
    const liquidity = liqRaw || (by('SSL') || /SSL|SELL SIDE LIQUIDITY/.test(all) ? 'SSL BELOW / SELL SIDE LIQUIDITY' : (by('BSL') || /BSL|BUY SIDE LIQUIDITY/.test(all) ? 'BSL ABOVE / BUY SIDE LIQUIDITY' : 'WAITING'));
    const stopHunt = clean(deepGet(raw, ['stopHunt','stophunt','stop_hunt']), '') || (by('STOP_HUNT') || /STOP\s*HUNT|STOPHUNT|ARMED|SWEEP/.test(all) ? 'ARMED' : 'WAITING');
    const fvg = clean(deepGet(raw, ['fvg','fvgZone','fvg_zone']), '') || (by('FVG') || /FVG|FAIR VALUE GAP/.test(all) ? 'FVG DETECTED' : 'WAITING');
    const ob = clean(deepGet(raw, ['ob','obZone','orderBlock']), '') || (by('OB') ? 'OB ZONE' : 'WAITING');
    const sig = String(raw.signal || raw.status || 'WAIT').toUpperCase();
    const trend = clean(raw.trend || raw.trendAI || raw.structure, sig.includes('SELL') ? 'BEARISH' : sig.includes('BUY') ? 'BULLISH' : 'WAITING');
    const score = Number(raw.score || raw.confidence || raw.conf || 55);
    return { ...raw, objects, price:Number.isFinite(price)?price:raw.price, signal:sig, trend, score:Number.isFinite(score)?score:55, sellZone:Number.isFinite(sellZone)&&sellZone>0?sellZone:'WAITING', buyZone:Number.isFinite(buyZone)&&buyZone>0?buyZone:'WAITING', tp1:Number.isFinite(tp1)&&tp1>0?tp1:'WAITING', tp2:Number.isFinite(tp2)&&tp2>0?tp2:'WAITING', tp3:Number.isFinite(tp3)&&tp3>0?tp3:'WAITING', liquidity, stopHunt, fvg, ob, bos:patch.bos, choch:patch.choch, bosChoch: raw.bosChoch || patch.bosChoch };
  }
  function intervalMs() { return S.tf === 'H1' ? 3600000 : S.tf === 'M15' ? 900000 : S.tf === 'M5' ? 300000 : 60000; }
  function pushTick(price) {
    if (!Number.isFinite(price) || price <= 0) return;
    const step = intervalMs(), bucket = Math.floor(Date.now() / step) * step;
    let last = S.candles[S.candles.length - 1];
    if (!last || last.t !== bucket) { const prev = last ? last.c : price; S.candles.push({ t:bucket, o:prev, h:Math.max(prev,price), l:Math.min(prev,price), c:price }); if (S.candles.length > S.maxCandles) S.candles.shift(); }
    else { last.h = Math.max(last.h, price); last.l = Math.min(last.l, price); last.c = price; }
  }
  function seed(price) {
    if (S.candles.length || !Number.isFinite(price)) return;
    let p = price; const now = Date.now(), step = intervalMs();
    for (let i=80; i>=1; i--) { const o = p + Math.sin(i/6)*0.5 + (Math.random()-.5)*0.45; const c = o + (Math.random()-.5)*0.9; S.candles.push({ t:now-i*step, o, h:Math.max(o,c)+0.35, l:Math.min(o,c)-0.35, c }); p=c; }
  }
  function findWrap() { return $('chartWrap') || $('chartPanel') || $('smartChartRoot') || q('.chart-wrap') || q('.chart-card') || q('.terminal-chart') || $('tvChart') || q('main'); }
  function ensureCanvas() {
    const wrap = findWrap(); if (!wrap) return null;
    wrap.style.position = 'relative'; wrap.style.overflow = 'hidden';
    ['fallbackChart','vyroSmcCanvas','vyroSmoothCanvas'].forEach(id => { const el=$(id); if (el) el.style.display='none'; });
    let canvas = $('vyroCleanCanvas');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id='vyroCleanCanvas'; canvas.className='vyro-v163-canvas'; canvas.style.position='absolute'; canvas.style.inset='0'; canvas.style.width='100%'; canvas.style.height='100%'; canvas.style.display='block'; wrap.appendChild(canvas); }
    S.canvas = canvas; S.ctx = canvas.getContext('2d'); return canvas;
  }
  function viewport(objects) {
    const vals = []; S.candles.forEach(c => vals.push(c.o,c.h,c.l,c.c)); objects.forEach(o => Number.isFinite(o.price)&&vals.push(o.price));
    if (!vals.length) return {min:0,max:1}; vals.sort((a,b)=>a-b);
    let lo = vals[Math.floor(vals.length*0.03)] ?? vals[0], hi = vals[Math.ceil(vals.length*0.97)-1] ?? vals[vals.length-1];
    const last = S.candles[S.candles.length-1]?.c; if (Number.isFinite(last)) { lo=Math.min(lo,last); hi=Math.max(hi,last); }
    let range = hi-lo; if (range<1) range=1; const pad=Math.max(range*0.18,0.8); return {min:lo-pad,max:hi+pad};
  }
  function schedule(){ if(!S.raf) S.raf=requestAnimationFrame(draw); }
  function draw() {
    S.raf = 0; const canvas = ensureCanvas(); if (!canvas || !S.ctx) return;
    const box = canvas.parentElement.getBoundingClientRect(), w = Math.max(360, box.width), h = Math.max(280, box.height), dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(w*dpr) || canvas.height !== Math.floor(h*dpr)) { canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr); canvas.style.width=w+'px'; canvas.style.height=h+'px'; }
    const ctx=S.ctx; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,0,h); bg.addColorStop(0,'#061b43'); bg.addColorStop(1,'#020716'); ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
    const L=56,R=72,T=42,B=36,W=w-L-R,H=h-T-B;
    ctx.strokeStyle='rgba(88,150,255,.18)'; ctx.lineWidth=1;
    for(let i=0;i<=8;i++){ const x=L+i*W/8; ctx.beginPath(); ctx.moveTo(x,T); ctx.lineTo(x,T+H); ctx.stroke(); }
    for(let i=0;i<=6;i++){ const y=T+i*H/6; ctx.beginPath(); ctx.moveTo(L,y); ctx.lineTo(L+W,y); ctx.stroke(); }
    const s=S.latest||{}, objects=[]; ['sellZone','buyZone','tp1','tp2','tp3'].forEach(k=>{ const p=num(s[k]); if(Number.isFinite(p)&&p>0) objects.push({type:k,price:p}); });
    const vp=viewport(objects), y=v=>T+(vp.max-v)/(vp.max-vp.min)*H;
    function level(k,color,label,box=false){ const p=num(s[k]); if(!Number.isFinite(p)||p<=0) return; const yy=y(p); if(yy<T-30||yy>T+H+30) return; if(box){ctx.globalAlpha=.12; ctx.fillStyle=color; ctx.fillRect(L,yy-18,W,36); ctx.globalAlpha=1;} ctx.strokeStyle=color; ctx.setLineDash([7,5]); ctx.beginPath(); ctx.moveTo(L,yy); ctx.lineTo(L+W,yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.font='800 12px Arial'; ctx.fillText(label+' '+fmt(p), L+8, Math.max(T+14,yy-7));}
    level('sellZone','#ff5ca8','SUPPLY',true); level('buyZone','#4fffd6','DEMAND',true); level('tp1','#ffd76a','TP1'); level('tp2','#ffd76a','TP2'); level('tp3','#ffd76a','TP3');
    if (S.candles.length) {
      const cw = Math.max(3, W/Math.max(S.candles.length,40)*.55);
      S.candles.forEach((bar,i)=>{ const xx=L+(i+.5)*W/S.candles.length, up=bar.c>=bar.o, col=up?'#45ffd3':'#ff5d96'; ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(xx,y(bar.h)); ctx.lineTo(xx,y(bar.l)); ctx.stroke(); const top=Math.min(y(bar.o),y(bar.c)); const hh=Math.max(2,Math.abs(y(bar.o)-y(bar.c))); ctx.fillRect(xx-cw/2,top,cw,hh); });
      const last=S.candles[S.candles.length-1].c, yy=y(last); ctx.strokeStyle='rgba(78,255,231,.65)'; ctx.setLineDash([5,5]); ctx.beginPath(); ctx.moveTo(L,yy); ctx.lineTo(L+W,yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='#4fffd6'; ctx.fillRect(L+W+8,yy-13,62,26); ctx.fillStyle='#012233'; ctx.font='900 12px Arial'; ctx.fillText(fmt(last),L+W+13,yy+4);
    } else { ctx.fillStyle='rgba(255,215,106,.95)'; ctx.font='900 16px Arial'; ctx.fillText('WAITING REALTIME MT5 CANDLE FEED', L+20, T+45); }
    if (s.liquidity && s.liquidity !== 'WAITING') { ctx.fillStyle='#ffdc63'; ctx.font='800 12px Arial'; ctx.fillText('LIQUIDITY: '+s.liquidity, L, T+18); }
    if (s.bosChoch && s.bosChoch !== 'WAITING') { ctx.fillStyle='#b689ff'; ctx.font='800 12px Arial'; ctx.fillText('STRUCTURE: '+s.bosChoch, L+260, T+18); }
    ctx.fillStyle='rgba(220,240,255,.9)'; ctx.font='800 13px Arial'; ctx.fillText('V18.2 Clean BOS/CHOCH Engine · '+S.tf, L, T-16);
  }
  function updatePanel(s) {
    const p = num(s.price || s.bid || s.ask); if (Number.isFinite(p)) { put('price',fmt(p),'--'); put('chartPrice',fmt(p),'--'); put('lastTick',fmt(p),'--'); }
    const sig=String(s.signal||s.status||'WAIT').toUpperCase(); put('signal',sig.includes('SELL')?'SELL NOW':sig.includes('BUY')?'BUY NOW':'WAIT','WAIT');
    put('marketTag',(s.symbol||'XAUUSD')+' · '+(s.timeframe||s.tf||S.tf)+' · SMART FLOW','XAUUSD · M1');
    put('rsi',s.rsi,'--'); put('flow',s.flow,'--'); put('delta',s.delta,'--'); put('power',s.power,'--'); put('buySell',s.buySell||s.ratio||s.buySellRatio,'--');
    const score=Number(s.score||s.confidence||s.conf||55); put('score',Number.isFinite(score)?score:55,'55'); put('conf',Number.isFinite(score)?score+'%':'--','--');
    put('trend',s.trend,'WAITING'); put('pressure',s.pressure,'WAITING'); put('liquidity',s.liquidity,'WAITING'); put('risk',s.risk||s.riskMode,'WAITING'); put('action',s.action,'WAITING'); put('source',s.source||'MT5','MT5');
    put('sellZone',Number.isFinite(num(s.sellZone))?fmt(num(s.sellZone)):'WAITING'); put('buyZone',Number.isFinite(num(s.buyZone))?fmt(num(s.buyZone)):'WAITING');
    put('smcStructure',s.trend,'WAITING'); put('smcStructureNote',String(s.trend).includes('BEAR')?'Lower High / Lower Low':String(s.trend).includes('BULL')?'Higher High / Higher Low':'Waiting structure');
    put('smcBosChoch',s.bosChoch,'WAITING'); put('smcBosChochNote',s.bosChoch.includes('CHOCH')?'Change of Character':s.bosChoch.includes('BOS')?'Break of Structure':'Waiting');
    put('smcLiquidity',s.liquidity,'WAITING'); put('smcLiquidityNote',String(s.liquidity).includes('SSL')?'Sell side liquidity':String(s.liquidity).includes('BSL')?'Buy side liquidity':'Waiting liquidity');
    put('smcStopHunt',s.stopHunt,'WAITING'); put('smcStopHuntNote',String(s.stopHunt).includes('ARM')?'Possible liquidity grab':'Waiting stop hunt');
    put('smcSellZone',Number.isFinite(num(s.sellZone))?fmt(num(s.sellZone)):'WAITING'); put('smcBuyZone',Number.isFinite(num(s.buyZone))?fmt(num(s.buyZone)):'WAITING');
    put('smcTp1',Number.isFinite(num(s.tp1))?fmt(num(s.tp1)):'WAITING'); put('smcTp2',Number.isFinite(num(s.tp2))?fmt(num(s.tp2)):'WAITING'); put('smcTp3',Number.isFinite(num(s.tp3))?fmt(num(s.tp3)):'WAITING');
    put('smcFvg',s.fvg,'WAITING'); put('smcOb',s.ob,'WAITING'); put('smcMitigation',s.mitigation||'PARTIAL','PARTIAL'); put('smcConfluence',s.confluence||'HIGH','HIGH');
    put('lastUpdate',new Date().toLocaleTimeString('vi-VN'));
  }
  function apply(raw) { const s=normalize(raw||{}); S.latest=s; const p=num(s.price); if(Number.isFinite(p)){seed(p); pushTick(p);} updatePanel(s); schedule(); }
  async function pull(){ try{ const r=await fetch('/api/latest-signal?v='+Date.now(),{cache:'no-store'}); const d=await r.json(); if(d) apply(d.latest||d.signal||d); } catch(e){} }
  function stream(){ try{ if(S.stream) S.stream.close(); S.stream=new EventSource('/api/stream?v=v182'); S.stream.addEventListener('signal',e=>{try{apply(JSON.parse(e.data));}catch(_){}}); S.stream.onmessage=e=>{try{apply(JSON.parse(e.data));}catch(_){}}; } catch(e){} }
  function init(){
    document.body.classList.add('v182-clean');
    document.querySelectorAll('.tf-tabs button, [data-tf]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tf-tabs button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); S.tf=(btn.dataset.tf||btn.textContent||'M1').trim().toUpperCase(); S.candles=[]; pull(); schedule();}));
    ensureCanvas(); pull(); stream(); clearInterval(S.poll); S.poll=setInterval(pull,1800); schedule();
  }
  window.updateSignal=apply; window.updateTerminalChart=apply; window.VYRO_V182_CLEAN={VERSION,apply,pull,stream,draw,state:S};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  window.addEventListener('resize',schedule);
})();
// ===== END V18.2 CLEAN FRONTEND ENGINE =====
