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


// ===== V15.4 FINAL PRODUCTION: realtime canvas terminal + SMC renderer =====
let vyroChart=null, candleSeries=null, lineSeries=null, markerSeries=null, fallbackCanvas=null, fallbackData=[], smcLines=[];
let currentTfSeconds=60;

function initTerminalChart(){
  fallbackCanvas=$('fallbackChart');
  seedFallback(Number($('price')?.innerText) || 0);
  drawFallbackChart({});
  window.addEventListener('resize',()=>drawFallbackChart(lastTerminalData||{}));
  document.querySelectorAll('.tf-tabs button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.tf-tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const t=btn.innerText.trim().toUpperCase();
      currentTfSeconds = t==='M5'?300:t==='M15'?900:t==='H1'?3600:60;
      fallbackData=[];
      const px=Number(($('price')?.innerText||'').replace(/[^0-9.-]/g,''));
      seedFallback(Number.isFinite(px)?px:0);
      drawFallbackChart(lastTerminalData||{});
    });
  });
}

function seedFallback(base){
  fallbackData=[];
  if(!base || !Number.isFinite(base)){
    return;
  }
  const now=Math.floor(Date.now()/1000)-80*currentTfSeconds;
  let p=base;
  for(let i=0;i<80;i++){
    const o=p;
    const drift=(Math.sin(i/7)*0.18)+(Math.random()-.5)*0.85;
    const c=o+drift;
    const h=Math.max(o,c)+Math.random()*0.55;
    const l=Math.min(o,c)-Math.random()*0.55;
    fallbackData.push({time:now+i*currentTfSeconds,open:o,high:h,low:l,close:c});
    p=c;
  }
}

let lastTerminalData=null;
function updateTerminalChart(d){
  lastTerminalData=d||{};
  if($('chartPrice')) $('chartPrice').innerText=cleanDisplay(d.price,'--');
  const price=Number(String(d.price||'').replace(/[^0-9.-]/g,''));
  if(!Number.isFinite(price) || price<=0){ drawFallbackChart(d||{}); return; }
  if(!fallbackData.length) seedFallback(price);
  const now=Math.floor(Date.now()/1000);
  let last=fallbackData[fallbackData.length-1];
  if(!last){ seedFallback(price); last=fallbackData[fallbackData.length-1]; }
  if(last && now-last.time < Math.max(10, Math.floor(currentTfSeconds/2))){
    last.close=price; last.high=Math.max(last.high,price); last.low=Math.min(last.low,price);
  }else{
    const o=last?last.close:price;
    fallbackData.push({time:now,open:o,high:Math.max(o,price),low:Math.min(o,price),close:price});
    if(fallbackData.length>140) fallbackData.shift();
  }
  drawFallbackChart(d||{});
}

function drawFallbackChart(d){
  const canvas=fallbackCanvas||$('fallbackChart');
  if(!canvas) return;
  canvas.style.display='block';
  const box=canvas.parentElement.getBoundingClientRect();
  const ratio=window.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.floor(box.width*ratio));
  canvas.height=Math.max(1,Math.floor(box.height*ratio));
  canvas.style.width=box.width+'px'; canvas.style.height=box.height+'px';
  const ctx=canvas.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0);
  const w=box.width,h=box.height; ctx.clearRect(0,0,w,h);

  const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'rgba(0,217,255,.08)'); g.addColorStop(1,'rgba(0,0,0,.06)'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(80,130,210,.14)'; ctx.lineWidth=1;
  for(let i=0;i<=8;i++){let y=h*i/8;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  for(let i=0;i<=10;i++){let x=w*i/10;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}

  if(!fallbackData.length){
    ctx.fillStyle='rgba(184,200,232,.80)'; ctx.font='700 16px Arial'; ctx.fillText('WAITING REALTIME MT5 PRICE FEED',24,42);
    ctx.font='12px Arial'; ctx.fillText('EA phải gửi vào /api/signal và trả về {"ok":true}',24,66);
    return;
  }
  const extras=[];
  ['sellZone','buyZone','tp1','tp2','tp3'].forEach(k=>{const n=toNum(d[k]); if(Number.isFinite(n)&&n>0) extras.push(n)});
  const vals=fallbackData.flatMap(x=>[x.high,x.low,x.close]).concat(extras);
  let min=Math.min(...vals), max=Math.max(...vals); if(!Number.isFinite(min)||!Number.isFinite(max)||min===max){min=(fallbackData[0]?.close||0)-5;max=(fallbackData[0]?.close||0)+5;}
  const pad=(max-min)*0.12||2; min-=pad; max+=pad;
  const y=v=>h-((v-min)/(max-min))*h;
  const x=i=>18+i*((w-46)/(Math.max(fallbackData.length-1,1)));

  // SMC zones first
  function zone(val,color,label,fill){
    const n=toNum(val); if(!Number.isFinite(n)||n<=0) return;
    const yy=y(n); ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.setLineDash([7,5]); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(w,yy); ctx.stroke(); ctx.setLineDash([]);
    if(fill){ctx.globalAlpha=.11; ctx.fillRect(0,yy-18,w,36); ctx.globalAlpha=1;}
    ctx.font='700 12px Arial'; ctx.fillText(label+' '+formatNum(n),12,Math.max(14,yy-7)); ctx.restore();
  }
  zone(d.sellZone,'#ff3f68','SUPPLY',true); zone(d.buyZone,'#00ff9d','DEMAND',true); zone(d.tp1,'#ffd34d','TP1',false); zone(d.tp2,'#ffd34d','TP2',false); zone(d.tp3,'#ffd34d','TP3',false);

  // candles
  const cw=Math.max(3,(w-60)/fallbackData.length*.58);
  fallbackData.forEach((b,i)=>{
    const xx=x(i), yo=y(b.open), yc=y(b.close), yh=y(b.high), yl=y(b.low);
    const up=b.close>=b.open; ctx.strokeStyle=up?'#00ff9d':'#ff3f68'; ctx.fillStyle=ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(xx,yh); ctx.lineTo(xx,yl); ctx.stroke();
    const top=Math.min(yo,yc), bot=Math.max(yo,yc); ctx.fillRect(xx-cw/2,top,cw,Math.max(2,bot-top));
  });

  // live price
  const last=fallbackData[fallbackData.length-1]; const lp=last.close, yy=y(lp);
  ctx.strokeStyle='rgba(0,217,255,.9)'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(w,yy); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#00d9ff'; ctx.fillRect(w-84,yy-11,80,22); ctx.fillStyle='#00111f'; ctx.font='800 12px Arial'; ctx.fillText(formatNum(lp),w-78,yy+4);

  ctx.fillStyle='rgba(184,200,232,.75)'; ctx.font='12px Arial';
  ctx.fillText('Realtime MT5 candles · '+(document.querySelector('.tf-tabs button.active')?.innerText||'M1'),18,22);
}

function toNum(v){
  if(v===undefined||v===null) return NaN;
  if(typeof v==='object') v=v.price||v.value||v.text||'';
  const m=String(v).match(/[0-9]{3,5}(?:\.[0-9]+)?/);
  return m?Number(m[0]):Number(v);
}
function formatNum(n){return Number(n).toFixed(2).replace(/\.00$/,'')}

function updateSMCPanel(x){
  const set=(id,v,fb='--')=>{if($(id))$(id).innerText=cleanDisplay(v,fb)};
  const trend=cleanDisplay(x.s.trend||x.sig.replace(' NOW',''),'WAITING');
  set('smcStructure',trend,'WAITING');
  set('smcStructureNote',trend.includes('SELL')||trend.includes('BEAR')?'Lower High / Lower Low':trend.includes('BUY')||trend.includes('BULL')?'Higher High / Higher Low':'Waiting structure');
  set('smcBosChoch',x.bos,'WAITING'); set('smcBosChochNote',String(x.bos).includes('CHOCH')?'Change of Character':String(x.bos).includes('BOS')?'Break of Structure':'Waiting');
  set('smcStrength',x.s.trendStrength||((x.sc>=80||Math.abs(nval(x.fv))>500)?'STRONG':'MEDIUM'));
  set('smcLiquidity',x.liquidity,'WAITING'); set('smcLiquidityNote',String(x.liquidity).includes('SSL')?'Sell side liquidity':String(x.liquidity).includes('BSL')?'Buy side liquidity':'Liquidity read');
  set('smcStopHunt',x.stopHunt,'WAITING'); set('smcStopHuntNote',String(cleanDisplay(x.stopHunt,'')).includes('ARM')?'Possible liquidity grab':'Status');
  set('smcSellZone',x.sellZ); set('smcBuyZone',x.buyZ);
  set('smcTp1',x.tp1); set('smcTp2',x.tp2); set('smcTp3',x.tp3);
  set('smcFvg',x.fvg,'WAITING'); set('smcOb',x.ob,'WAITING'); set('smcMitigation',smcVal(x.s,['mitigation'],'PARTIAL')); set('smcConfluence',smcVal(x.s,['confluence'],'HIGH'));
  const bars=document.querySelectorAll('#smcBars i'); const level=Math.max(1,Math.min(8,Math.round((x.sc||55)/12.5))); bars.forEach((b,i)=>b.classList.toggle('on',i<level));
}
window.addEventListener('load',()=>setTimeout(initTerminalChart,500));


// ===== V15.5 HARD FIX: DOM/SVG realtime terminal, no stale canvas / no demo false-0-N/A =====
(function(){
  window.VYRO_V155_LOADED = true;
  const V155 = 'V15.5_FULL_FRONTEND_BINDING';
  function byId(id){return document.getElementById(id)}
  function validText(v){
    if(v===undefined||v===null) return false;
    if(Array.isArray(v)) return v.some(validText);
    if(typeof v==='object') return validText(v.text||v.value||v.price||v.name);
    const t=String(v).trim();
    return !!t && !['0','0.0','0.00','0/0','false','null','undefined','nan','n/a','N/A','--'].includes(t);
  }
  function show(v, fb='WAITING'){
    if(Array.isArray(v)) v = v.find(validText);
    if(typeof v==='object' && v) v = v.text || v.value || v.price || v.name || '';
    return validText(v) ? String(v).trim() : fb;
  }
  function numAny(v){
    if(v===undefined||v===null) return NaN;
    if(typeof v==='object') v=v.price||v.value||v.text||'';
    const m=String(v).match(/-?[0-9]{3,5}(?:\.[0-9]+)?|-?[0-9]+(?:\.[0-9]+)?/);
    return m?Number(m[0]):NaN;
  }
  function f2(n){return Number(n).toFixed(2).replace(/\.00$/,'')}
  function put(id,v,fb='WAITING',cls=''){
    const el=byId(id); if(!el) return;
    el.textContent=show(v,fb);
    el.classList.remove('waiting','active-green','active-red','active-cyan');
    if(cls) el.classList.add(cls); else if(el.textContent==='WAITING') el.classList.add('waiting');
  }
  function parseZone(s, side){
    const keys = side==='sell'
      ? ['sellZone','sell_zone','supply','supplyZone','smcSellZone','smc_supply','supply_line','supplyLine','supplyPrice','SELL_ZONE','SUPPLY']
      : ['buyZone','buy_zone','demand','demandZone','smcBuyZone','smc_demand','demand_line','demandLine','demandPrice','BUY_ZONE','DEMAND'];
    for(const k of keys){
      if(validText(s?.[k])) return s[k];
      if(validText(s?.smc?.[k])) return s.smc[k];
      if(validText(s?.zones?.[k])) return s.zones[k];
      if(validText(s?.raw?.[k])) return s.raw[k];
    }
    const blob = JSON.stringify(s||{}).replace(/_/g,' ');
    const re = side==='sell' ? /(SUPPLY|SELL\s*ZONE|SELL\s*AREA)[^0-9]{0,70}([0-9]{3,5}(?:\.[0-9]+)?)/i : /(DEMAND|BUY\s*ZONE|BUY\s*AREA)[^0-9]{0,70}([0-9]{3,5}(?:\.[0-9]+)?)/i;
    const m=blob.match(re); return m?m[2]:'WAITING';
  }
  function parseLiquidity(s){
    const direct = s?.liquidity || s?.liquidityText || s?.liq || s?.ssl || s?.bsl || s?.smc?.liquidity;
    if(validText(direct)) return direct;
    const blob=JSON.stringify(s||{}).replace(/_/g,' ').toUpperCase();
    if(blob.includes('SELL SIDE LIQUIDITY') || /\bSSL\b/.test(blob)) return 'SSL BELOW / SELL SIDE LIQUIDITY';
    if(blob.includes('BUY SIDE LIQUIDITY') || /\bBSL\b/.test(blob)) return 'BSL ABOVE / BUY SIDE LIQUIDITY';
    if(blob.includes('LIQUIDITY SWEEP')) return 'LIQUIDITY SWEEP';
    return 'WAITING';
  }
  function parseStopHunt(s){
    const direct=s?.stopHunt||s?.stophunt||s?.stop_hunt||s?.smc?.stopHunt;
    if(validText(direct)) return direct;
    const blob=JSON.stringify(s||{}).toUpperCase();
    if(blob.includes('STOPHUNT') || blob.includes('STOP HUNT')) return blob.includes('ARMED')?'ARMED':'DETECTED';
    if(blob.includes('ARMED')) return 'ARMED';
    return 'WAITING';
  }
  function parseBosChoch(s){
    const direct=s?.bosChoch||s?.bos_choch||s?.structureSignal||s?.smc?.bosChoch;
    if(validText(direct)) return direct;
    const blob=JSON.stringify(s||{}).toUpperCase();
    if(blob.includes('CHOCH')) return 'CHOCH';
    if(blob.includes('BOS') || blob.includes('BREAK OF STRUCTURE')) return 'BOS';
    return 'WAITING';
  }
  function parseFvg(s){
    const direct=s?.fvg||s?.fvgZone||s?.fvg_zone||s?.smc?.fvg;
    if(validText(direct)) return direct;
    const blob=JSON.stringify(s||{}).toUpperCase();
    return blob.includes('FVG')?'FVG DETECTED':'WAITING';
  }
  function getTp(s,n){
    const keys=['tp'+n,'TP'+n,'takeProfit'+n,'take_profit_'+n];
    for(const k of keys){ if(validText(s?.[k])) return s[k]; if(validText(s?.smc?.[k])) return s.smc[k]; }
    const m=JSON.stringify(s||{}).match(new RegExp('TP'+n+'[^0-9]{0,70}([0-9]{3,5}(?:\\.[0-9]+)?)','i'));
    return m?m[1]:'WAITING';
  }
  function ensureRoot(){
    const wrap=byId('tvChart'); if(!wrap) return null;
    let root=byId('smartChartRoot');
    if(!root){root=document.createElement('div');root.id='smartChartRoot';root.className='smart-chart-root';wrap.appendChild(root)}
    return root;
  }
  window.vyroTicks = window.vyroTicks || [];
  function seedTicks(price){
    const arr=window.vyroTicks; if(arr.length || !Number.isFinite(price) || price<=0) return;
    let p=price; const now=Date.now()-70*60000;
    for(let i=0;i<70;i++){
      const o=p, c=o+(Math.sin(i/5)*0.28)+(Math.random()-.5)*0.9, h=Math.max(o,c)+Math.random()*0.5, l=Math.min(o,c)-Math.random()*0.5;
      arr.push({t:now+i*60000,o,h,l,c}); p=c;
    }
  }
  function pushTick(price){
    if(!Number.isFinite(price)||price<=0) return;
    seedTicks(price);
    const arr=window.vyroTicks; const now=Date.now(); let last=arr[arr.length-1];
    if(last && now-last.t<45000){last.c=price; last.h=Math.max(last.h,price); last.l=Math.min(last.l,price)}
    else{const o=last?last.c:price; arr.push({t:now,o,h:Math.max(o,price),l:Math.min(o,price),c:price}); if(arr.length>120) arr.shift()}
  }
  function drawSmartChart(d={}){
    const root=ensureRoot(); if(!root) return;
    const rect=root.getBoundingClientRect(); const w=Math.max(320,rect.width||820), h=Math.max(260,rect.height||520);
    const price=numAny(d.price); if(Number.isFinite(price)&&price>0) pushTick(price);
    const arr=window.vyroTicks||[];
    if(!arr.length){
      root.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#071d42"/><stop offset="1" stop-color="#020814"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${grid(w,h)}<text x="28" y="48" class="smart-wait">WAITING REALTIME MT5 CANDLE FEED</text><text x="28" y="76" class="smart-sub">EA gửi price vào /api/signal, chart sẽ tự tạo nến realtime từ tick MT5.</text></svg>`;
      return;
    }
    const extra=['sellZone','buyZone','tp1','tp2','tp3'].map(k=>numAny(d[k])).filter(x=>Number.isFinite(x)&&x>0);
    const vals=arr.flatMap(b=>[b.h,b.l,b.c]).concat(extra); let min=Math.min(...vals), max=Math.max(...vals); const pad=(max-min)*.12||2; min-=pad; max+=pad;
    const left=44,right=86,top=30,bottom=34, cw=(w-left-right)/Math.max(arr.length,1);
    const X=i=>left+i*cw+cw*.5; const Y=v=>top+(max-v)/(max-min)*(h-top-bottom);
    let body=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="bgv155" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#061c42"/><stop offset="1" stop-color="#020711"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bgv155)"/>${grid(w,h,left,right,top,bottom)}`;
    function zone(val,color,label,fill){ const n=numAny(val); if(!Number.isFinite(n)||n<=0)return; const y=Y(n); if(fill) body+=`<rect x="${left}" y="${y-17}" width="${w-left-right}" height="34" class="${color==='red'?'smart-zone-supply':'smart-zone-demand'}"/>`; body+=`<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" class="${color==='red'?'smart-zone-supply':color==='green'?'smart-zone-demand':'smart-zone-tp'}" stroke-dasharray="7 5"/><text x="${left+8}" y="${Math.max(16,y-7)}" class="smart-title">${label} ${esc(f2(n))}</text>`; }
    zone(d.sellZone,'red','SUPPLY',true); zone(d.buyZone,'green','DEMAND',true); zone(d.tp1,'tp','TP1',false); zone(d.tp2,'tp','TP2',false); zone(d.tp3,'tp','TP3',false);
    arr.forEach((b,i)=>{ const x=X(i), yo=Y(b.o), yc=Y(b.c), yh=Y(b.h), yl=Y(b.l), up=b.c>=b.o, cls=up?'smart-candle-up':'smart-candle-down'; const bw=Math.max(3,Math.min(10,cw*.58)); body+=`<line x1="${x}" y1="${yh}" x2="${x}" y2="${yl}" class="${cls}" stroke-width="1.2"/><rect x="${x-bw/2}" y="${Math.min(yo,yc)}" width="${bw}" height="${Math.max(2,Math.abs(yc-yo))}" class="${cls}" rx="1"/>`; });
    const lp=arr[arr.length-1].c, py=Y(lp); body+=`<line x1="${left}" y1="${py}" x2="${w-right}" y2="${py}" class="smart-price-line"/><rect x="${w-right+6}" y="${py-12}" width="${right-12}" height="24" rx="7" fill="#00d9ff"/><text x="${w-right+14}" y="${py+4}" class="smart-badge">${esc(f2(lp))}</text><text x="${left}" y="20" class="smart-title">VYRO realtime MT5 tick candles · ${esc(document.querySelector('.tf-tabs button.active')?.innerText||'M1')}</text></svg>`;
    root.innerHTML=body;
  }
  function grid(w,h,left=44,right=86,top=30,bottom=34){let s=''; for(let i=0;i<=8;i++){const y=top+(h-top-bottom)*i/8;s+=`<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" class="smart-grid"/>`;} for(let i=0;i<=10;i++){const x=left+(w-left-right)*i/10;s+=`<line x1="${x}" y1="${top}" x2="${x}" y2="${h-bottom}" class="smart-grid"/>`;} return s;}
  function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function hardUpdateSmcPanel(signal){
    const sellZ=parseZone(signal,'sell'), buyZ=parseZone(signal,'buy'), liq=parseLiquidity(signal), stop=parseStopHunt(signal), bc=parseBosChoch(signal), fvg=parseFvg(signal);
    const trend=show(signal.trend || signal.trendAI || signal.status || signal.signal,'WAITING');
    put('smcStructure',trend,'WAITING', /BULL|BUY/i.test(trend)?'active-green':/BEAR|SELL/i.test(trend)?'active-red':'');
    put('smcStructureNote', /BULL|BUY/i.test(trend)?'Higher High / Higher Low':/BEAR|SELL/i.test(trend)?'Lower High / Lower Low':'Waiting structure','Waiting structure');
    put('smcBosChoch',bc,'WAITING', bc==='WAITING'?'':'active-cyan');
    put('smcBosChochNote', bc.includes('CHOCH')?'Change of Character':bc.includes('BOS')?'Break of Structure':'Waiting','Waiting');
    const conf=Number(signal.score||signal.confidence||signal.conf||55); put('smcStrength', signal.trendStrength || (conf>=80?'STRONG':conf>=60?'MEDIUM':'LOW'),'WAITING');
    put('smcLiquidity',liq,'WAITING', liq.includes('SSL')?'active-red':liq.includes('BSL')?'active-green':'');
    put('smcLiquidityNote', liq.includes('SSL')?'Sell side liquidity':liq.includes('BSL')?'Buy side liquidity':liq==='WAITING'?'Waiting liquidity':'Liquidity sweep','Liquidity read');
    put('smcStopHunt',stop,'WAITING', stop.includes('ARM')?'active-red':''); put('smcStopHuntNote', stop.includes('ARM')?'Possible liquidity grab':'Waiting stop hunt','Status');
    put('smcSellZone',sellZ,'WAITING','active-red'); put('smcBuyZone',buyZ,'WAITING','active-green');
    put('smcTp1',getTp(signal,1),'WAITING','active-green'); put('smcTp2',getTp(signal,2),'WAITING','active-green'); put('smcTp3',getTp(signal,3),'WAITING','active-green');
    put('smcFvg',fvg,'WAITING',fvg==='WAITING'?'':'active-cyan'); put('smcOb',signal.ob||signal.obZone||'WAITING','WAITING'); put('smcMitigation',signal.mitigation||'WAITING','WAITING'); put('smcConfluence',signal.confluence||'WAITING','WAITING');
    put('liquidity',liq,'WAITING'); put('sellZone',sellZ,'WAITING'); put('buyZone',buyZ,'WAITING');
    const d={price:signal.price||signal.bid||signal.ask, sellZone:sellZ,buyZone:buyZ,tp1:getTp(signal,1),tp2:getTp(signal,2),tp3:getTp(signal,3)};
    if(byId('chartPrice')) byId('chartPrice').textContent=show(d.price,'--'); drawSmartChart(d);
  }
  const oldUpdate = window.updateSignal;
  window.updateSignal = function(s){
    try{ if(oldUpdate) oldUpdate(s); }catch(e){ console.warn('legacy updateSignal skipped',e); }
    try{ hardUpdateSmcPanel(s||{}); }catch(e){ console.error('V15.5 SMC bind error',e); }
  };
  window.updateTerminalChart = function(d){ drawSmartChart(d||{}); };
  window.updateSMCPanel = function(x){ if(x && x.s) hardUpdateSmcPanel(Object.assign({},x.s,{sellZone:x.sellZ,buyZone:x.buyZ,liquidity:x.liquidity,stopHunt:x.stopHunt,bosChoch:x.bos,tp1:x.tp1,tp2:x.tp2,tp3:x.tp3,fvg:x.fvg,ob:x.ob,price:x.p})); };
  window.initTerminalChart = function(){ ensureRoot(); drawSmartChart({}); document.querySelectorAll('.tf-tabs button').forEach(btn=>btn.onclick=function(){document.querySelectorAll('.tf-tabs button').forEach(b=>b.classList.remove('active'));this.classList.add('active');window.vyroTicks=[]; const p=numAny(byId('price')?.textContent); if(Number.isFinite(p)) seedTicks(p); drawSmartChart({price:p});}); };
  window.addEventListener('load',()=>setTimeout(window.initTerminalChart,150));
  window.addEventListener('resize',()=>setTimeout(()=>drawSmartChart(window.lastTerminalData||{}),80));
  setInterval(()=>{ const p=numAny(byId('price')?.textContent); if(Number.isFinite(p)&&p>0) drawSmartChart({price:p}); },2500);
})();

// ===== V15.6 FINAL PRODUCTION REALTIME TRADING ENGINE =====
// Independent hard-binding layer: chart + SMC panel always bind to /api/latest-signal + SSE.
(function(){
  const VERSION='V15.6_FINAL_PRODUCTION_REALTIME_TRADING_ENGINE';
  const q=id=>document.getElementById(id);
  const api='';
  let ticks=[];
  let lastSignal=null;
  let es=null;
  let pollTimer=null;
  function isBad(v){
    if(v===undefined||v===null) return true;
    if(Array.isArray(v)) return !v.some(x=>!isBad(x));
    if(typeof v==='object') return isBad(v.price||v.value||v.text||v.label||v.name);
    const t=String(v).trim();
    return !t || ['0','0.0','0.00','0/0','false','null','undefined','nan','n/a','N/A','--'].includes(t);
  }
  function show(v,fb='WAITING'){
    if(Array.isArray(v)) v=v.find(x=>!isBad(x));
    if(typeof v==='object'&&v) v=v.price||v.value||v.text||v.label||v.name||'';
    return isBad(v)?fb:String(v).trim();
  }
  function n(v){
    if(v===undefined||v===null) return NaN;
    if(typeof v==='object') v=v.price||v.value||v.text||v.label||'';
    const m=String(v).match(/-?[0-9]{3,5}(?:\.[0-9]+)?|-?[0-9]+(?:\.[0-9]+)?/);
    return m?Number(m[0]):NaN;
  }
  function f(v){const x=Number(v);return Number.isFinite(x)?x.toFixed(2).replace(/\.00$/,''):'--'}
  function set(id,v,fb='WAITING'){
    const el=q(id); if(!el) return;
    el.textContent=show(v,fb);
    el.classList.toggle('waiting',el.textContent==='WAITING');
    el.classList.toggle('active-red',/SELL|BEAR|SSL|ARMED|SUPPLY/i.test(el.textContent));
    el.classList.toggle('active-green',/BUY|BULL|BSL|DEMAND/i.test(el.textContent));
  }
  function blob(s){try{return JSON.stringify(s||{}).replace(/_/g,' ')}catch(e){return ''}}
  function deepGet(s,keys){
    const roots=[s,s&&s.smc,s&&s.zones,s&&s.raw,s&&s.parsed];
    for(const r of roots){ if(!r||typeof r!=='object') continue; for(const k of keys){ if(!isBad(r[k])) return r[k]; } }
    return null;
  }
  function zone(s,side){
    const keys=side==='sell'?['sellZone','sell_zone','supply','supplyZone','smcSellZone','smc_supply','supplyLine','supply_line','SUPPLY','SELL_ZONE']:['buyZone','buy_zone','demand','demandZone','smcBuyZone','smc_demand','demandLine','demand_line','DEMAND','BUY_ZONE'];
    let v=deepGet(s,keys); if(!isBad(v)) return v;
    const re=side==='sell'?/(SUPPLY|SELL\s*ZONE|SELL\s*AREA)[^0-9]{0,90}([0-9]{3,5}(?:\.[0-9]+)?)/i:/(DEMAND|BUY\s*ZONE|BUY\s*AREA)[^0-9]{0,90}([0-9]{3,5}(?:\.[0-9]+)?)/i;
    const m=blob(s).match(re); return m?m[2]:'WAITING';
  }
  function liq(s){
    let v=deepGet(s,['liquidity','liquidityText','liq','ssl','bsl','liquiditySweep']); if(!isBad(v)) return v;
    const b=blob(s).toUpperCase();
    if(/SSL|SELL\s+SIDE\s+LIQUIDITY/.test(b)) return 'SSL BELOW / SELL SIDE LIQUIDITY';
    if(/BSL|BUY\s+SIDE\s+LIQUIDITY/.test(b)) return 'BSL ABOVE / BUY SIDE LIQUIDITY';
    if(/LIQUIDITY\s+SWEEP/.test(b)) return 'LIQUIDITY SWEEP';
    return 'WAITING';
  }
  function bos(s){
    let v=deepGet(s,['bosChoch','bos_choch','structureSignal']); if(!isBad(v)) return v;
    const b=blob(s).toUpperCase(); if(/CHOCH|CHANGE\s+OF\s+CHARACTER/.test(b)) return 'CHOCH'; if(/\bBOS\b|BREAK\s+OF\s+STRUCTURE/.test(b)) return 'BOS'; return 'WAITING';
  }
  function stop(s){
    let v=deepGet(s,['stopHunt','stophunt','stop_hunt']); if(!isBad(v)) return v;
    const b=blob(s).toUpperCase(); if(/STOP\s*HUNT|STOPHUNT/.test(b)) return /ARMED/.test(b)?'ARMED':'DETECTED'; if(/ARMED/.test(b)) return 'ARMED'; return 'WAITING';
  }
  function tp(s,i){
    let v=deepGet(s,['tp'+i,'TP'+i,'takeProfit'+i,'take_profit_'+i]); if(!isBad(v)) return v;
    const m=blob(s).match(new RegExp('TP'+i+'[^0-9]{0,90}([0-9]{3,5}(?:\\.[0-9]+)?)','i')); return m?m[1]:'WAITING';
  }
  function fvg(s){let v=deepGet(s,['fvg','fvgZone','fvg_zone']); if(!isBad(v)) return v; return /FVG/i.test(blob(s))?'FVG DETECTED':'WAITING';}
  function ob(s){let v=deepGet(s,['ob','obZone','orderBlock','order_block']); if(!isBad(v)) return v; return /ORDER\s*BLOCK|\bOB\b/i.test(blob(s))?'OB ZONE':'WAITING';}
  function priceOf(s){return n(deepGet(s,['price','bid','Bid','ask','Ask']) || s?.price || s?.bid || s?.ask)}
  function ensureVersion(){
    if(q('v156-badge')) return;
    const el=document.createElement('div'); el.id='v156-badge'; el.textContent='V15.6 LIVE ENGINE';
    el.style.cssText='position:fixed;right:18px;bottom:18px;z-index:99999;background:rgba(0,217,255,.16);border:1px solid rgba(0,217,255,.45);color:#bff4ff;border-radius:12px;padding:8px 12px;font:800 12px Arial;backdrop-filter:blur(10px)';
    document.body.appendChild(el);
  }
  function updatePanel(s){
    if(!s) return;
    const signal=show(s.signal||s.status,'WAITING');
    const trend=show(s.trend||s.trendAI||(signal.includes('SELL')?'BEARISH':signal.includes('BUY')?'BULLISH':''),'WAITING');
    set('smcStructure',trend); set('smcStructureNote',/BULL|BUY/i.test(trend)?'Higher High / Higher Low':/BEAR|SELL/i.test(trend)?'Lower High / Lower Low':'Waiting structure');
    const bc=bos(s); set('smcBosChoch',bc); set('smcBosChochNote',bc==='BOS'?'Break of Structure':bc==='CHOCH'?'Change of Character':'Waiting');
    const score=n(s.score||s.confidence||s.conf)||55; set('smcStrength',s.trendStrength||(score>=80?'STRONG':score>=60?'MEDIUM':'LOW'));
    const l=liq(s); set('smcLiquidity',l); set('smcLiquidityNote',l.includes('SSL')?'Sell side liquidity':l.includes('BSL')?'Buy side liquidity':l==='WAITING'?'Waiting liquidity':'Liquidity sweep');
    const st=stop(s); set('smcStopHunt',st); set('smcStopHuntNote',st==='ARMED'?'Possible liquidity grab':st==='DETECTED'?'Stop hunt detected':'Waiting stop hunt');
    const sell=zone(s,'sell'), buy=zone(s,'buy'); set('smcSellZone',sell); set('smcBuyZone',buy);
    set('sellZone',sell); set('buyZone',buy); set('liquidity',l);
    set('smcTp1',tp(s,1)); set('smcTp2',tp(s,2)); set('smcTp3',tp(s,3)); set('smcFvg',fvg(s)); set('smcOb',ob(s)); set('smcMitigation',deepGet(s,['mitigation','mitigationStatus'])||'WAITING'); set('smcConfluence',deepGet(s,['confluence','confluenceLevel'])||'WAITING');
    const p=priceOf(s); if(Number.isFinite(p)){ set('price',f(p)); if(q('chartPrice')) q('chartPrice').textContent=f(p); }
    const sc=q('source'); if(sc) sc.textContent=s.source||'MT5_REALTIME';
  }
  function push(price){
    if(!Number.isFinite(price)||price<=0) return;
    const now=Date.now(), tf=60000;
    if(!ticks.length){let p=price; for(let i=90;i>0;i--){const t=now-i*tf, o=p, c=o+(Math.sin(i/5)*0.22)+(Math.random()-.5)*0.55, h=Math.max(o,c)+Math.random()*0.28, l=Math.min(o,c)-Math.random()*0.28; ticks.push({t,o,h,l,c}); p=c;}}
    let last=ticks[ticks.length-1];
    if(now-last.t<tf){last.c=price; last.h=Math.max(last.h,price); last.l=Math.min(last.l,price);} else {const o=last.c; ticks.push({t:now,o,h:Math.max(o,price),l:Math.min(o,price),c:price}); if(ticks.length>160) ticks.shift();}
  }
  function draw(s){
    const wrap=q('tvChart'); if(!wrap) return;
    let root=q('smartChartRoot'); if(!root){root=document.createElement('div'); root.id='smartChartRoot'; root.className='smart-chart-root'; wrap.appendChild(root);}
    const p=priceOf(s||{}); if(Number.isFinite(p)) push(p);
    const box=root.getBoundingClientRect(), w=Math.max(480,box.width||800), h=Math.max(320,box.height||520), left=48,right=92,top=30,bottom=38;
    if(!ticks.length){root.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><rect width="${w}" height="${h}" fill="#041026"/>${grid(w,h,left,right,top,bottom)}<text x="30" y="55" class="smart-wait">WAITING REALTIME MT5 PRICE</text><text x="30" y="84" class="smart-sub">EA gửi vào /api/signal → chart tự tạo nến realtime.</text></svg>`;return;}
    const extras=[zone(s,'sell'),zone(s,'buy'),tp(s,1),tp(s,2),tp(s,3)].map(n).filter(x=>Number.isFinite(x)&&x>0);
    const vals=ticks.flatMap(x=>[x.h,x.l,x.c]).concat(extras); let min=Math.min(...vals), max=Math.max(...vals); const pad=(max-min)*.14||3; min-=pad; max+=pad;
    const X=i=>left+i*((w-left-right)/Math.max(1,ticks.length-1)); const Y=v=>top+(max-v)/(max-min)*(h-top-bottom);
    let svg=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="v156bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#071d42"/><stop offset="1" stop-color="#020711"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#v156bg)"/>${grid(w,h,left,right,top,bottom)}`;
    function z(v,label,cls){const x=n(v); if(!Number.isFinite(x)||x<=0)return; const y=Y(x); const fill=cls.includes('supply')?'rgba(255,63,104,.10)':cls.includes('demand')?'rgba(0,255,157,.08)':'transparent'; if(fill!=='transparent') svg+=`<rect x="${left}" y="${y-18}" width="${w-left-right}" height="36" fill="${fill}"/>`; svg+=`<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" class="${cls}" stroke-dasharray="7 5"/><text x="${left+8}" y="${Math.max(18,y-8)}" class="smart-title">${label} ${esc(f(x))}</text>`;}
    z(zone(s,'sell'),'SUPPLY','smart-zone-supply'); z(zone(s,'buy'),'DEMAND','smart-zone-demand'); z(tp(s,1),'TP1','smart-zone-tp'); z(tp(s,2),'TP2','smart-zone-tp'); z(tp(s,3),'TP3','smart-zone-tp');
    const cw=Math.max(3,Math.min(11,(w-left-right)/ticks.length*.62));
    ticks.forEach((b,i)=>{const x=X(i), yo=Y(b.o), yc=Y(b.c), yh=Y(b.h), yl=Y(b.l), up=b.c>=b.o, cls=up?'smart-candle-up':'smart-candle-down'; svg+=`<line x1="${x}" y1="${yh}" x2="${x}" y2="${yl}" class="${cls}" stroke-width="1.2"/><rect x="${x-cw/2}" y="${Math.min(yo,yc)}" width="${cw}" height="${Math.max(2,Math.abs(yc-yo))}" rx="1" class="${cls}"/>`;});
    const lp=ticks[ticks.length-1].c, py=Y(lp); svg+=`<line x1="${left}" y1="${py}" x2="${w-right}" y2="${py}" class="smart-price-line"/><rect x="${w-right+6}" y="${py-12}" width="${right-12}" height="24" rx="7" fill="#00d9ff"/><text x="${w-right+14}" y="${py+4}" class="smart-badge">${esc(f(lp))}</text><text x="${left}" y="20" class="smart-title">VYRO V15.6 realtime MT5 candles</text></svg>`;
    root.innerHTML=svg;
  }
  function grid(w,h,l,r,t,b){let s='';for(let i=0;i<=8;i++){const y=t+(h-t-b)*i/8;s+=`<line x1="${l}" y1="${y}" x2="${w-r}" y2="${y}" class="smart-grid"/>`;}for(let i=0;i<=10;i++){const x=l+(w-l-r)*i/10;s+=`<line x1="${x}" y1="${t}" x2="${x}" y2="${h-b}" class="smart-grid"/>`;}return s;}
  function esc(x){return String(x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function apply(s){lastSignal=s||lastSignal||{}; updatePanel(lastSignal); draw(lastSignal);}
  async function pull(){try{const r=await fetch(api+'/api/latest-signal?v='+Date.now(),{cache:'no-store'}); const d=await r.json(); if(d&&d.ok!==false) apply(d);}catch(e){} }
  async function loadCandles(){try{const r=await fetch(api+'/api/candles?v='+Date.now(),{cache:'no-store'}); const d=await r.json(); if(d&&Array.isArray(d.candles)&&d.candles.length){ticks=d.candles.map(c=>({t:(c.time||Date.now()/1000)*1000,o:+c.open,h:+c.high,l:+c.low,c:+c.close})).filter(c=>Number.isFinite(c.c)); draw(lastSignal||d.latest||{});}}catch(e){} }
  function stream(){try{ if(es) es.close(); es=new EventSource(api+'/api/stream?v='+Date.now()); es.addEventListener('signal',e=>{try{apply(JSON.parse(e.data));}catch(_){}}); es.onerror=()=>{};}catch(e){} }
  document.addEventListener('DOMContentLoaded',()=>{ensureVersion(); loadCandles(); pull(); stream(); clearInterval(pollTimer); pollTimer=setInterval(pull,1500); setInterval(()=>draw(lastSignal||{}),3000);});
  window.addEventListener('resize',()=>setTimeout(()=>draw(lastSignal||{}),120));
  window.VYRO_V156={version:VERSION,pull,draw,apply};
})();

// ===== V15.7 FINAL SMC INTELLIGENCE LAYER =====
(function(){
  const VERSION='V16.2_JSON_SMC_AI_TP_ENGINE';
  window.VYRO_VERSION=VERSION;
  const $v=(id)=>document.getElementById(id);
  const state={last:null,candles:[],raf:0,lastDrawKey:'',lastDomKey:'',stream:null,poll:0};
  function bad(v){
    if(v===undefined||v===null) return true;
    if(Array.isArray(v)) return v.length===0||v.every(bad);
    if(typeof v==='object') return false;
    const t=String(v).trim().toLowerCase();
    return !t||['0','0.0','0.00','0/0','false','null','undefined','nan','n/a','--','waiting_for_mt5'].includes(t);
  }
  function txt(v,fb='WAITING'){
    if(Array.isArray(v)){const x=v.find(a=>!bad(a)); return x===undefined?fb:txt(x,fb)}
    if(typeof v==='object'&&v) return txt(v.text||v.value||v.price||v.name||v.label||'',fb);
    if(bad(v)) return fb;
    return String(v).trim();
  }
  function num(v){
    if(v===undefined||v===null) return NaN;
    if(typeof v==='object') v=v.price||v.value||v.text||v.name||'';
    const m=String(v).match(/-?[0-9]{3,6}(?:\.[0-9]+)?/);
    return m?Number(m[0]):Number(v);
  }
  function fnum(v){ const n=num(v); return Number.isFinite(n)&&n!==0 ? Number(n).toFixed(2).replace(/\.00$/,'') : 'WAITING'; }
  function put(id,v,fb='WAITING'){
    const el=$v(id); if(!el) return;
    const nv=txt(v,fb);
    if(el.textContent!==nv) el.textContent=nv;
    el.classList.toggle('waiting',nv==='WAITING');
  }
  function collectObjects(s){
    const arr=[];
    const push=(o={})=>{
      const name=txt(o.name||o.object||o.id,''); const text=txt(o.text||o.label||o.value,''); const price=num(o.price||o.p||o.y||o.level||text||name);
      const raw=(name+' '+text).trim(); if(raw || Number.isFinite(price)) arr.push({name,text,price,raw,category:o.category||classify(raw)});
    };
    if(Array.isArray(s.objects)) s.objects.forEach(push);
    if(Array.isArray(s.chartObjects)) s.chartObjects.forEach(push);
    if(Array.isArray(s.smcObjects)) s.smcObjects.forEach(push);
    ['debug_all_objects','debug_sell_object','debug_buy_object','debug_tp_object','bosText','chochText','liquidityText','stopHuntText','fvgText'].forEach(k=>{
      if(bad(s[k])) return;
      String(s[k]).split(/\s*\|\|\s*/).forEach(part=>{
        const at=part.match(/@\s*([0-9]{3,6}(?:\.[0-9]+)?)/);
        const pieces=part.split('@')[0].split('|').map(x=>x.trim()).filter(Boolean);
        push({name:pieces[0]||part,text:pieces.slice(1).join(' '),price:at?at[1]:undefined});
      });
    });
    return arr;
  }
  function classify(blob){
    const b=String(blob||'').toUpperCase().replace(/_/g,' ');
    if(/TP\s*1|TAKE PROFIT\s*1/.test(b)) return 'TP1';
    if(/TP\s*2|TAKE PROFIT\s*2/.test(b)) return 'TP2';
    if(/TP\s*3|TAKE PROFIT\s*3/.test(b)) return 'TP3';
    if(/STOP\s*HUNT|STOPHUNT/.test(b)) return 'STOP_HUNT';
    if(/CHOCH|CHANGE\s+OF\s+CHARACTER/.test(b)) return 'CHOCH';
    if(/\bBOS\b|BREAK\s+OF\s+STRUCTURE/.test(b)) return 'BOS';
    if(/FVG|FAIR VALUE GAP|IMBALANCE/.test(b)) return 'FVG';
    if(/\bSSL\b|SELL SIDE LIQUIDITY/.test(b)) return 'SSL';
    if(/\bBSL\b|BUY SIDE LIQUIDITY/.test(b)) return 'BSL';
    if(/SUPPLY|SELL\s*ZONE|SELL\s*AREA|BEARISH\s*OB|SELL\s*OB/.test(b)&&!/TP|TAKE PROFIT|STOP LOSS|\bSL\b|ENTRY|NO TRADE/.test(b)) return 'SUPPLY';
    if(/DEMAND|BUY\s*ZONE|BUY\s*AREA|BULLISH\s*OB|BUY\s*OB/.test(b)&&!/TP|TAKE PROFIT|STOP LOSS|\bSL\b|ENTRY|NO TRADE/.test(b)) return 'DEMAND';
    if(/ORDER BLOCK|\bOB\b/.test(b)) return 'OB';
    return '';
  }
  function normalize(s={}){
    const objects=collectObjects(s);
    const smc=s.smc||{};
    const price=num(s.price||s.bid||s.ask||($v('price')?.textContent));
    function near(cat){
      const a=objects.filter(o=>o.category===cat&&Number.isFinite(num(o.price)));
      if(!a.length) return null;
      a.sort((x,y)=>Math.abs(num(x.price)-price)-Math.abs(num(y.price)-price)); return a[0];
    }
    function by(cat){return objects.find(o=>o.category===cat)}
    const supply=near('SUPPLY'), demand=near('DEMAND'), ssl=by('SSL'), bsl=by('BSL'), bos=by('BOS'), choch=by('CHOCH'), fvgObj=by('FVG'), ob=by('OB'), stop=by('STOP_HUNT');
    const sell=num(s.sellZone||s.supply||s.supplyZone||smc.sellZone||smc.supply||s.smc_supply)||num(supply?.price);
    const buy=num(s.buyZone||s.demand||s.demandZone||smc.buyZone||smc.demand||s.smc_demand)||num(demand?.price);
    const tp1=num(s.tp1||smc.tp1)||num(by('TP1')?.price), tp2=num(s.tp2||smc.tp2)||num(by('TP2')?.price), tp3=num(s.tp3||smc.tp3)||num(by('TP3')?.price);
    const liq=txt(s.liquidity||s.liquidityText||smc.liquidity,'') || (ssl?'SSL BELOW / SELL SIDE LIQUIDITY':(bsl?'BSL ABOVE / BUY SIDE LIQUIDITY':'WAITING'));
    const bosChoch=txt(s.bosChoch||smc.bosChoch,'') || (choch?'CHOCH':(bos?'BOS':'WAITING'));
    const stopHunt=txt(s.stopHuntText||smc.stopHunt,'') || ((s.stopHunt===true||stop)?'ARMED':'WAITING');
    const fvg=txt(s.fvgText||s.fvg||smc.fvg,'') || (fvgObj?'FVG DETECTED':'WAITING');
    const signal=String(s.signal||s.status||'WAIT').toUpperCase();
    return {...s, objects, price:Number.isFinite(price)?price:s.price, sellZone:sell||'WAITING', buyZone:buy||'WAITING', tp1:tp1||'WAITING', tp2:tp2||'WAITING', tp3:tp3||'WAITING', liquidity:liq, bosChoch, stopHunt, fvg, ob:txt(s.ob||smc.ob,'')||(ob?'OB ZONE':'WAITING'), trend:txt(s.trend||smc.structure, signal.includes('SELL')?'BEARISH':signal.includes('BUY')?'BULLISH':'WAITING')};
  }
  function updateCandle(price){
    if(!Number.isFinite(price)||price<=0) return;
    const tf=(document.querySelector('.tf-tabs button.active')?.textContent||'M1').trim();
    const sec=tf==='M5'?300:tf==='M15'?900:tf==='H1'?3600:60;
    const bucket=Math.floor(Date.now()/1000/sec)*sec*1000;
    let last=state.candles[state.candles.length-1];
    if(last&&last.t===bucket){last.c=price;last.h=Math.max(last.h,price);last.l=Math.min(last.l,price)}
    else{const o=last?last.c:price;state.candles.push({t:bucket,o,h:Math.max(o,price),l:Math.min(o,price),c:price}); if(state.candles.length>120) state.candles.shift();}
    if(state.candles.length<40){ let p=price; const start=Date.now()-40*sec*1000; while(state.candles.length<40){const o=p+(Math.random()-.5)*1.2,c=o+(Math.random()-.5)*1.8; state.candles.unshift({t:start-state.candles.length*sec*1000,o,h:Math.max(o,c)+.5,l:Math.min(o,c)-.5,c}); p=o;}}
  }
  function draw(){
    state.raf=0;
    const root=$v('smartChartRoot')||$v('tvChart'); if(!root) return;
    let canvas=$v('vyroSmcCanvas');
    if(!canvas){canvas=document.createElement('canvas');canvas.id='vyroSmcCanvas';canvas.className='vyro-smc-canvas';root.innerHTML='';root.appendChild(canvas)}
    const r=root.getBoundingClientRect(), dpr=window.devicePixelRatio||1, w=Math.max(420,r.width||760), h=Math.max(330,r.height||520);
    if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px'}
    const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const s=state.last||{}; const candles=state.candles;
    const levels=[s.sellZone,s.buyZone,s.tp1,s.tp2,s.tp3].map(num).filter(Number.isFinite);
    const vals=candles.flatMap(c=>[c.h,c.l,c.c]).concat(levels); if(!vals.length){ctx.fillStyle='rgba(184,200,232,.75)';ctx.font='700 16px Arial';ctx.fillText('WAITING REALTIME MT5 PRICE FEED',24,44);return;}
    let min=Math.min(...vals),max=Math.max(...vals); const pad=(max-min)*.15||5; min-=pad; max+=pad;
    const left=42,right=78,top=28,bottom=30,cw=w-left-right,ch=h-top-bottom;
    const y=v=>top+ch-((v-min)/(max-min))*ch; const x=i=>left+i*(cw/Math.max(1,candles.length-1));
    ctx.strokeStyle='rgba(80,150,255,.16)';ctx.lineWidth=1;ctx.beginPath(); for(let i=0;i<8;i++){const yy=top+i*ch/7;ctx.moveTo(left,yy);ctx.lineTo(left+cw,yy)} for(let i=0;i<10;i++){const xx=left+i*cw/9;ctx.moveTo(xx,top);ctx.lineTo(xx,top+ch)} ctx.stroke();
    function level(v,color,label,box=false){const n=num(v); if(!Number.isFinite(n)||n<=0)return; const yy=y(n); ctx.save(); if(box){ctx.globalAlpha=.12;ctx.fillStyle=color;ctx.fillRect(left,yy-18,cw,36);ctx.globalAlpha=1;} ctx.strokeStyle=color;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+cw,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.font='800 12px Arial';ctx.fillText(label+' '+fnum(n),left+8,yy-7);ctx.restore();}
    level(s.sellZone,'#ff4d7d','SUPPLY',true); level(s.buyZone,'#00ffc8','DEMAND',true); level(s.tp1,'#ffe066','TP1'); level(s.tp2,'#ffe066','TP2'); level(s.tp3,'#ffe066','TP3');
    const body=Math.max(3,cw/Math.max(60,candles.length)*.58); candles.forEach((c,i)=>{const xx=x(i),up=c.c>=c.o;ctx.strokeStyle=up?'#54ffd2':'#ff5b88';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(c.h));ctx.lineTo(xx,y(c.l));ctx.stroke();const yy=Math.min(y(c.o),y(c.c)),hh=Math.max(2,Math.abs(y(c.o)-y(c.c)));ctx.fillRect(xx-body/2,yy,body,hh)});
    const last=candles[candles.length-1]; if(last){const yy=y(last.c);ctx.strokeStyle='#00d9ff';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(left+cw,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#00d9ff';ctx.fillRect(w-right+6,yy-12,66,24);ctx.fillStyle='#00121f';ctx.font='800 12px Arial';ctx.fillText(fnum(last.c),w-right+12,yy+4)}
    if(s.liquidity&&s.liquidity!=='WAITING'){ctx.fillStyle='#ffdb63';ctx.font='800 12px Arial';ctx.fillText('LIQUIDITY: '+s.liquidity,left,top+18)}
    ctx.fillStyle='rgba(220,235,255,.78)';ctx.font='700 12px Arial';ctx.fillText('V15.7 SMC object overlay · '+(document.querySelector('.tf-tabs button.active')?.textContent||'M1'),left,top-10);
  }
  function scheduleDraw(){ if(!state.raf) state.raf=requestAnimationFrame(draw); }
  function apply(raw){
    const s=normalize(raw||{}); state.last=s; const p=num(s.price); if(Number.isFinite(p)) updateCandle(p);
    put('price',Number.isFinite(p)?fnum(p):s.price,'--'); put('chartPrice',Number.isFinite(p)?fnum(p):s.price,'--');
    const sig=String(s.signal||s.status||'WAIT').toUpperCase(); put('signal',sig.includes('SELL')?'SELL NOW':sig.includes('BUY')?'BUY NOW':'WAIT','WAIT');
    put('marketTag',(s.displaySymbol||s.symbol||'XAUUSD')+' · '+(s.tf||s.timeframe||'M1')+' · SMART FLOW','XAUUSD · M1');
    put('rsi',s.rsi,'--'); put('flow',s.flow,'--'); put('delta',s.delta,'--'); put('power',s.power,'--'); put('buySell',s.buySell||s.ratio||s.buySellRatio,'--');
    const score=Number(s.score||s.confidence||s.conf||55); put('score',score,'55'); put('conf',Number.isFinite(score)?score+'%':'--');
    put('trend',s.trend,'WAITING'); put('liquidity',s.liquidity,'WAITING'); put('pressure',s.pressure,'WAITING'); put('risk',s.riskMode||s.risk,'WAITING'); put('action',s.action,'WAITING'); put('source',s.source||'MT5','MT5');
    put('sellZone',fnum(s.sellZone)); put('buyZone',fnum(s.buyZone)); put('noTradeZone',s.noTrade||s.noTradeZone,'WAITING');
    put('smcStructure',s.trend,'WAITING'); put('smcStructureNote',String(s.trend).includes('BEAR')?'Lower High / Lower Low':String(s.trend).includes('BULL')?'Higher High / Higher Low':'Waiting structure');
    put('smcBosChoch',s.bosChoch,'WAITING'); put('smcBosChochNote',s.bosChoch==='CHOCH'?'Change of Character':s.bosChoch==='BOS'?'Break of Structure':'Waiting');
    put('smcLiquidity',s.liquidity,'WAITING'); put('smcLiquidityNote',String(s.liquidity).includes('SSL')?'Sell side liquidity':String(s.liquidity).includes('BSL')?'Buy side liquidity':'Waiting liquidity');
    put('smcStopHunt',s.stopHunt,'WAITING'); put('smcStopHuntNote',String(s.stopHunt).includes('ARM')?'Possible liquidity grab':'Waiting stop hunt');
    put('smcSellZone',fnum(s.sellZone)); put('smcBuyZone',fnum(s.buyZone)); put('smcTp1',fnum(s.tp1)); put('smcTp2',fnum(s.tp2)); put('smcTp3',fnum(s.tp3)); put('smcFvg',s.fvg,'WAITING'); put('smcOb',s.ob,'WAITING');
    put('smcMitigation',s.mitigation||'PARTIAL','PARTIAL'); put('smcConfluence',s.confluence||'HIGH','HIGH'); put('mode','LIVE SMC','LIVE'); put('apiStatusText','ONLINE','ONLINE'); put('connectionText','ONLINE','ONLINE'); put('lastTick',Number.isFinite(p)?fnum(p):'--'); put('lastUpdate',new Date().toLocaleTimeString('vi-VN'));
    const bars=document.querySelectorAll('#smcBars i'); const lvl=Math.max(1,Math.min(8,Math.round((Number(score)||55)/12.5))); bars.forEach((b,i)=>b.classList.toggle('on',i<lvl));
    scheduleDraw();
  }
  async function pull(){try{const r=await fetch('/api/latest-signal?v='+Date.now(),{cache:'no-store'}); const d=await r.json(); if(d) apply(d);}catch(e){}}
  function stream(){try{ if(state.stream) state.stream.close(); state.stream=new EventSource('/api/stream'); state.stream.addEventListener('signal',e=>{try{apply(JSON.parse(e.data))}catch(_){}}); state.stream.onerror=()=>{};}catch(e){}}
  window.updateSignal=apply; window.updateTerminalChart=(d)=>{state.last={...(state.last||{}),...normalize(d||{})}; const p=num(state.last.price); if(Number.isFinite(p)) updateCandle(p); scheduleDraw();};
  window.VYRO_V157={VERSION,apply,pull,draw,normalize};
  document.addEventListener('DOMContentLoaded',()=>{document.body.classList.add('v157'); document.querySelectorAll('.tf-tabs button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tf-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.candles=[];pull();})); pull(); stream(); setInterval(pull,1500); setInterval(scheduleDraw,1000);});
  window.addEventListener('resize',scheduleDraw);
})();


// ===== V15.8 SMOOTH CHART ENGINE - ANTI FLICKER PRODUCTION PATCH =====
// Fix nhấp nháy: lock legacy SVG redraw, single SSE stream, persistent canvas, throttle render.
(function(){
  const VERSION='V15.8_SMOOTH_CHART_ENGINE_ANTI_FLICKER';
  window.VYRO_VERSION=VERSION;

  // Track all EventSource instances created by older layers, then close them after boot.
  const NativeEventSource = window.EventSource;
  const trackedES = [];
  if (NativeEventSource && !window.__VYRO_ES_TRACKED__) {
    window.__VYRO_ES_TRACKED__ = true;
    window.EventSource = function(url, cfg){
      const es = new NativeEventSource(url, cfg);
      trackedES.push(es);
      return es;
    };
    window.EventSource.prototype = NativeEventSource.prototype;
  }

  // Stop old engines from replacing #smartChartRoot.innerHTML every tick.
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (desc && desc.set && !window.__VYRO_INNERHTML_LOCK__) {
    window.__VYRO_INNERHTML_LOCK__ = true;
    Object.defineProperty(Element.prototype, 'innerHTML', {
      get: desc.get,
      set: function(v){
        if (window.__VYRO_SMOOTH_LOCK__ && this && this.id === 'smartChartRoot') return;
        return desc.set.call(this, v);
      }
    });
  }

  const S = {
    signal:null,
    candles:[],
    es:null,
    raf:0,
    lastFrame:0,
    lastApply:0,
    lastTickPrice:null,
    tf:'M1',
    canvas:null,
    ctx:null,
    booted:false
  };

  const $ = id => document.getElementById(id);
  const bad = v => {
    if(v===undefined||v===null) return true;
    if(Array.isArray(v)) return v.length===0 || v.every(bad);
    if(typeof v==='object') return false;
    const t=String(v).trim().toLowerCase();
    return !t || ['0','0.0','0.00','0/0','false','null','undefined','nan','n/a','--','waiting_for_mt5'].includes(t);
  };
  const txt=(v,fb='WAITING')=>{
    if(Array.isArray(v)){const x=v.find(a=>!bad(a)); return x===undefined?fb:txt(x,fb)}
    if(typeof v==='object'&&v) return txt(v.text||v.value||v.price||v.name||v.label||'',fb);
    return bad(v)?fb:String(v).trim();
  };
  const num=v=>{
    if(v===undefined||v===null) return NaN;
    if(typeof v==='object') v=v.price||v.value||v.text||v.name||v.label||'';
    const m=String(v).match(/-?[0-9]{3,6}(?:\.[0-9]+)?|-?[0-9]+(?:\.[0-9]+)?/);
    return m?Number(m[0]):NaN;
  };
  const f=v=>{const n=Number(v); return Number.isFinite(n)?n.toFixed(2).replace(/\.00$/,''):'WAITING'};
  const put=(id,v,fb='WAITING')=>{
    const el=$(id); if(!el) return;
    const nv=txt(v,fb);
    if(el.textContent!==nv) el.textContent=nv;
    el.classList.toggle('waiting',nv==='WAITING');
    el.classList.toggle('active-red',/SELL|BEAR|SSL|SUPPLY|ARMED/i.test(nv));
    el.classList.toggle('active-green',/BUY|BULL|BSL|DEMAND/i.test(nv));
  };
  const blob=s=>{try{return JSON.stringify(s||{}).replace(/_/g,' ')}catch(e){return ''}};
  const deep=(s,keys)=>{
    const roots=[s,s&&s.smc,s&&s.zones,s&&s.raw,s&&s.parsed];
    for(const r of roots){ if(!r||typeof r!=='object') continue; for(const k of keys){ if(!bad(r[k])) return r[k]; } }
    return null;
  };
  function collect(s={}){
    const arr=[];
    const push=o=>{
      if(!o) return;
      if(typeof o==='string') o={text:o};
      const name=txt(o.name||o.object||o.id,'');
      const text=txt(o.text||o.label||o.value,'');
      const price=num(o.price||o.p||o.y||o.level||text||name);
      const raw=(name+' '+text).trim();
      if(raw||Number.isFinite(price)) arr.push({name,text,price,raw,cat:o.category||classify(raw)});
    };
    ['objects','chartObjects','smcObjects'].forEach(k=>Array.isArray(s[k])&&s[k].forEach(push));
    ['debug_all_objects','debug_sell_object','debug_buy_object','debug_tp_object','bosText','chochText','liquidityText','stopHuntText','fvgText'].forEach(k=>{
      if(bad(s[k])) return;
      String(s[k]).split(/\s*\|\|\s*/).forEach(part=>{
        const at=part.match(/@\s*([0-9]{3,6}(?:\.[0-9]+)?)/);
        const pieces=part.split('@')[0].split('|').map(x=>x.trim()).filter(Boolean);
        push({name:pieces[0]||part,text:pieces.slice(1).join(' '),price:at?at[1]:undefined});
      });
    });
    return arr;
  }
  function classify(v){
    const b=String(v||'').toUpperCase().replace(/_/g,' ');
    if(/TP\s*1|TAKE PROFIT\s*1/.test(b)) return 'TP1';
    if(/TP\s*2|TAKE PROFIT\s*2/.test(b)) return 'TP2';
    if(/TP\s*3|TAKE PROFIT\s*3/.test(b)) return 'TP3';
    if(/STOP\s*HUNT|STOPHUNT/.test(b)) return 'STOP_HUNT';
    if(/CHOCH|CHANGE\s+OF\s+CHARACTER/.test(b)) return 'CHOCH';
    if(/\bBOS\b|BREAK\s+OF\s+STRUCTURE/.test(b)) return 'BOS';
    if(/FVG|FAIR VALUE GAP|IMBALANCE/.test(b)) return 'FVG';
    if(/\bSSL\b|SELL SIDE LIQUIDITY/.test(b)) return 'SSL';
    if(/\bBSL\b|BUY SIDE LIQUIDITY/.test(b)) return 'BSL';
    if(/SUPPLY|SELL\s*ZONE|SELL\s*AREA|BEARISH\s*OB|SELL\s*OB/.test(b)&&!/TP|TAKE PROFIT|STOP LOSS|\bSL\b|ENTRY|NO TRADE/.test(b)) return 'SUPPLY';
    if(/DEMAND|BUY\s*ZONE|BUY\s*AREA|BULLISH\s*OB|BUY\s*OB/.test(b)&&!/TP|TAKE PROFIT|STOP LOSS|\bSL\b|ENTRY|NO TRADE/.test(b)) return 'DEMAND';
    if(/ORDER BLOCK|\bOB\b/.test(b)) return 'OB';
    return '';
  }
  function normalize(raw={}){
    const objects=collect(raw);
    const b=blob(raw).toUpperCase();
    const price=num(raw.price||raw.bid||raw.ask||($('price')&&$('price').textContent));
    const near=cat=>{
      const a=objects.filter(o=>o.cat===cat&&Number.isFinite(o.price));
      if(!a.length) return null;
      if(Number.isFinite(price)) a.sort((x,y)=>Math.abs(x.price-price)-Math.abs(y.price-price));
      return a[0];
    };
    const by=cat=>objects.find(o=>o.cat===cat);
    const sell=num(deep(raw,['sellZone','sell_zone','supply','supplyZone','supplyLine','supply_line','smc_supply'])) || num(near('SUPPLY')&&near('SUPPLY').price);
    const buy=num(deep(raw,['buyZone','buy_zone','demand','demandZone','demandLine','demand_line','smc_demand'])) || num(near('DEMAND')&&near('DEMAND').price);
    const tp1=num(deep(raw,['tp1','TP1','takeProfit1'])) || num(by('TP1')&&by('TP1').price);
    const tp2=num(deep(raw,['tp2','TP2','takeProfit2'])) || num(by('TP2')&&by('TP2').price);
    const tp3=num(deep(raw,['tp3','TP3','takeProfit3'])) || num(by('TP3')&&by('TP3').price);
    const liq=txt(deep(raw,['liquidity','liquidityText','liq','ssl','bsl']),'') || (by('SSL')||/SSL|SELL SIDE LIQUIDITY/.test(b)?'SSL BELOW / SELL SIDE LIQUIDITY':(by('BSL')||/BSL|BUY SIDE LIQUIDITY/.test(b)?'BSL ABOVE / BUY SIDE LIQUIDITY':'WAITING'));
    const bosChoch=txt(deep(raw,['bosChoch','bos_choch','structureSignal']),'') || (by('CHOCH')||/CHOCH/.test(b)?'CHOCH':(by('BOS')||/\bBOS\b|BREAK OF STRUCTURE/.test(b)?'BOS':'WAITING'));
    const stopHunt=txt(deep(raw,['stopHunt','stophunt','stop_hunt','stopHuntText']),'') || (raw.stopHunt===true||by('STOP_HUNT')||/STOP\s*HUNT|STOPHUNT|ARMED/.test(b)?'ARMED':'WAITING');
    const fvg=txt(deep(raw,['fvg','fvgZone','fvgText']),'') || (by('FVG')||/FVG|FAIR VALUE GAP/.test(b)?'FVG DETECTED':'WAITING');
    const sig=String(raw.signal||raw.status||'WAIT').toUpperCase();
    const trend=txt(raw.trend||raw.trendAI, sig.includes('SELL')?'BEARISH':sig.includes('BUY')?'BULLISH':'WAITING');
    const score=Number(raw.score||raw.confidence||raw.conf||55);
    return {...raw, objects, price:Number.isFinite(price)?price:raw.price, sellZone:Number.isFinite(sell)&&sell>0?sell:'WAITING', buyZone:Number.isFinite(buy)&&buy>0?buy:'WAITING', tp1:Number.isFinite(tp1)&&tp1>0?tp1:'WAITING', tp2:Number.isFinite(tp2)&&tp2>0?tp2:'WAITING', tp3:Number.isFinite(tp3)&&tp3>0?tp3:'WAITING', liquidity:liq, bosChoch, stopHunt, fvg, ob:txt(raw.ob||raw.obZone,'WAITING'), trend, score:Number.isFinite(score)?score:55, signal:sig};
  }
  function tfSec(){return S.tf==='M5'?300:S.tf==='M15'?900:S.tf==='H1'?3600:60}
  function seed(price){
    if(S.candles.length>=35 || !Number.isFinite(price)) return;
    const sec=tfSec(), now=Math.floor(Date.now()/1000/sec)*sec*1000;
    const tmp=[]; let p=price;
    for(let i=35;i>0;i--){
      const o=p+(Math.sin(i/4)*0.45)+(Math.random()-.5)*0.65;
      const c=o+(Math.random()-.5)*1.1;
      tmp.push({t:now-i*sec*1000,o,h:Math.max(o,c)+.35,l:Math.min(o,c)-.35,c}); p=c;
    }
    S.candles=tmp;
  }
  function tick(price){
    if(!Number.isFinite(price)||price<=0) return;
    seed(price);
    const sec=tfSec(), bucket=Math.floor(Date.now()/1000/sec)*sec*1000;
    let last=S.candles[S.candles.length-1];
    if(last&&last.t===bucket){last.c=price;last.h=Math.max(last.h,price);last.l=Math.min(last.l,price)}
    else{const o=last?last.c:price;S.candles.push({t:bucket,o,h:Math.max(o,price),l:Math.min(o,price),c:price}); if(S.candles.length>120) S.candles=S.candles.slice(-120)}
  }
  function setupCanvas(){
    const wrap=$('smartChartRoot')||$('tvChart'); if(!wrap) return null;
    window.__VYRO_SMOOTH_LOCK__ = false;
    if(wrap.id==='smartChartRoot' && !wrap.querySelector('#vyroSmoothCanvas')) wrap.innerHTML='';
    window.__VYRO_SMOOTH_LOCK__ = true;
    let canvas=$('vyroSmoothCanvas');
    if(!canvas){canvas=document.createElement('canvas');canvas.id='vyroSmoothCanvas';canvas.className='vyro-smooth-canvas';wrap.appendChild(canvas)}
    const fb=$('fallbackChart'); if(fb) fb.style.display='none';
    S.canvas=canvas; S.ctx=canvas.getContext('2d');
    return wrap;
  }
  function schedule(){
    const now=performance.now();
    if(now-S.lastFrame<180) return; // max ~5.5fps to avoid flicker and CPU spike on VPS/laptop
    if(!S.raf) S.raf=requestAnimationFrame(draw);
  }
  function draw(){
    S.raf=0; S.lastFrame=performance.now();
    const wrap=setupCanvas(); if(!wrap||!S.ctx) return;
    const r=wrap.getBoundingClientRect(), dpr=window.devicePixelRatio||1, w=Math.max(420,r.width||760), h=Math.max(330,r.height||520);
    if(S.canvas.width!==Math.floor(w*dpr)||S.canvas.height!==Math.floor(h*dpr)){S.canvas.width=Math.floor(w*dpr);S.canvas.height=Math.floor(h*dpr);S.canvas.style.width=w+'px';S.canvas.style.height=h+'px'}
    const ctx=S.ctx; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,0,h); bg.addColorStop(0,'#061b40'); bg.addColorStop(1,'#020711'); ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
    const c=S.candles, s=S.signal||{};
    const levels=[s.sellZone,s.buyZone,s.tp1,s.tp2,s.tp3].map(num).filter(v=>Number.isFinite(v)&&v>0);
    const vals=c.flatMap(x=>[x.h,x.l,x.c]).concat(levels);
    if(!vals.length){ctx.fillStyle='rgba(230,240,255,.82)';ctx.font='800 16px Arial';ctx.fillText('WAITING REALTIME MT5 PRICE FEED',24,46);ctx.font='12px Arial';ctx.fillText('Đợi EA gửi price vào /api/signal',24,70);return;}
    let min=Math.min(...vals), max=Math.max(...vals); const pad=(max-min)*.15||5; min-=pad; max+=pad;
    const L=44,R=80,T=28,B=30,W=w-L-R,H=h-T-B;
    const X=i=>L+i*(W/Math.max(1,c.length-1)); const Y=v=>T+H-((v-min)/(max-min))*H;
    ctx.strokeStyle='rgba(95,155,255,.16)';ctx.lineWidth=1;ctx.beginPath(); for(let i=0;i<=8;i++){const y=T+i*H/8;ctx.moveTo(L,y);ctx.lineTo(L+W,y)} for(let i=0;i<=10;i++){const x=L+i*W/10;ctx.moveTo(x,T);ctx.lineTo(x,T+H)} ctx.stroke();
    function line(v,color,label,box){const n=num(v); if(!Number.isFinite(n)||n<=0) return; const y=Y(n); if(box){ctx.globalAlpha=.13;ctx.fillStyle=color;ctx.fillRect(L,y-18,W,36);ctx.globalAlpha=1;} ctx.strokeStyle=color;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(L+W,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.font='800 12px Arial';ctx.fillText(label+' '+f(n),L+8,Math.max(15,y-7));}
    line(s.sellZone,'#ff4d7d','SUPPLY',true); line(s.buyZone,'#00ffc8','DEMAND',true); line(s.tp1,'#ffe066','TP1'); line(s.tp2,'#ffe066','TP2'); line(s.tp3,'#ffe066','TP3');
    const bw=Math.max(3,Math.min(9,W/Math.max(60,c.length)*.65));
    c.forEach((k,i)=>{const x=X(i), up=k.c>=k.o;ctx.strokeStyle=up?'#58ffd8':'#ff628d';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,Y(k.h));ctx.lineTo(x,Y(k.l));ctx.stroke();const y=Math.min(Y(k.o),Y(k.c)),hh=Math.max(2,Math.abs(Y(k.o)-Y(k.c)));ctx.fillRect(x-bw/2,y,bw,hh)});
    const last=c[c.length-1]; if(last){const y=Y(last.c);ctx.strokeStyle='#00d9ff';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(L+W,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#00d9ff';ctx.fillRect(w-R+8,y-12,68,24);ctx.fillStyle='#00111f';ctx.font='900 12px Arial';ctx.fillText(f(last.c),w-R+14,y+4)}
    if(s.liquidity&&s.liquidity!=='WAITING'){ctx.fillStyle='#ffdc63';ctx.font='800 12px Arial';ctx.fillText('LIQUIDITY: '+s.liquidity,L,T+18)}
    ctx.fillStyle='rgba(230,240,255,.82)';ctx.font='800 12px Arial';ctx.fillText('V15.8 Smooth realtime canvas · '+S.tf,L,T-9);
  }
  function panel(s){
    const p=num(s.price); if(Number.isFinite(p)){put('price',f(p),'--');put('chartPrice',f(p),'--');put('lastTick',f(p),'--')}
    const sig=String(s.signal||s.status||'WAIT').toUpperCase(); put('signal',sig.includes('SELL')?'SELL NOW':sig.includes('BUY')?'BUY NOW':'WAIT','WAIT');
    put('marketTag',(s.displaySymbol||s.symbol||'XAUUSD')+' · '+(s.timeframe||s.tf||S.tf)+' · SMART FLOW','XAUUSD · M1');
    put('rsi',s.rsi,'--');put('flow',s.flow,'--');put('delta',s.delta,'--');put('power',s.power,'--');put('buySell',s.buySell||s.ratio||s.buySellRatio,'--');
    const score=Number(s.score||s.confidence||s.conf||55); put('score',Number.isFinite(score)?score:55,'55'); put('conf',Number.isFinite(score)?score+'%':'--','--');
    put('trend',s.trend,'WAITING');put('pressure',s.pressure,'WAITING');put('liquidity',s.liquidity,'WAITING');put('risk',s.risk||s.riskMode,'WAITING');put('action',s.action,'WAITING');put('source',s.source||'MT5','MT5');
    put('smcStructure',s.trend,'WAITING'); put('smcStructureNote',String(s.trend).includes('BEAR')?'Lower High / Lower Low':String(s.trend).includes('BULL')?'Higher High / Higher Low':'Waiting structure');
    put('smcBosChoch',s.bosChoch,'WAITING'); put('smcBosChochNote',s.bosChoch==='CHOCH'?'Change of Character':s.bosChoch==='BOS'?'Break of Structure':'Waiting');
    put('smcLiquidity',s.liquidity,'WAITING'); put('smcLiquidityNote',String(s.liquidity).includes('SSL')?'Sell side liquidity':String(s.liquidity).includes('BSL')?'Buy side liquidity':'Waiting liquidity');
    put('smcStopHunt',s.stopHunt,'WAITING'); put('smcStopHuntNote',String(s.stopHunt).includes('ARM')?'Possible liquidity grab':'Waiting stop hunt');
    put('smcSellZone',Number.isFinite(num(s.sellZone))?f(num(s.sellZone)):'WAITING'); put('smcBuyZone',Number.isFinite(num(s.buyZone))?f(num(s.buyZone)):'WAITING');
    put('sellZone',Number.isFinite(num(s.sellZone))?f(num(s.sellZone)):'WAITING'); put('buyZone',Number.isFinite(num(s.buyZone))?f(num(s.buyZone)):'WAITING');
    put('smcTp1',Number.isFinite(num(s.tp1))?f(num(s.tp1)):'WAITING'); put('smcTp2',Number.isFinite(num(s.tp2))?f(num(s.tp2)):'WAITING'); put('smcTp3',Number.isFinite(num(s.tp3))?f(num(s.tp3)):'WAITING');
    put('smcFvg',s.fvg,'WAITING'); put('smcOb',s.ob,'WAITING'); put('smcMitigation',s.mitigation||'PARTIAL','PARTIAL'); put('smcConfluence',s.confluence||'HIGH','HIGH');
    put('lastUpdate',new Date().toLocaleTimeString('vi-VN')); put('apiStatusText','ONLINE','ONLINE'); put('connectionText','ONLINE','ONLINE');
    const bars=document.querySelectorAll('#smcBars i'); const lvl=Math.max(1,Math.min(8,Math.round((Number(score)||55)/12.5))); bars.forEach((b,i)=>b.classList.toggle('on',i<lvl));
  }
  function apply(raw){
    const now=performance.now();
    if(now-S.lastApply<250) return; // throttle data to 4 updates/sec max
    S.lastApply=now;
    const s=normalize(raw||{}); S.signal=s;
    const p=num(s.price); if(Number.isFinite(p)) tick(p);
    panel(s); schedule();
  }
  async function pull(){try{const r=await fetch('/api/latest-signal?v='+Date.now(),{cache:'no-store'}); const d=await r.json(); if(d) apply(d);}catch(e){}}
  async function candles(){try{const r=await fetch('/api/candles?v='+Date.now(),{cache:'no-store'}); const d=await r.json(); if(d&&Array.isArray(d.candles)&&d.candles.length){S.candles=d.candles.map(c=>({t:(c.time||Date.now()/1000)*1000,o:+c.open,h:+c.high,l:+c.low,c:+c.close})).filter(c=>Number.isFinite(c.c)); schedule();}}catch(e){}}
  function start(){
    if(S.booted) return; S.booted=true;
    document.body.classList.add('v158-smooth');
    window.__VYRO_SMOOTH_LOCK__=true; setupCanvas();
    // close old tracked streams, then create one clean stream
    setTimeout(()=>{ trackedES.forEach(es=>{try{es.close()}catch(e){}}); if(S.es) try{S.es.close()}catch(e){}; if(NativeEventSource){S.es=new NativeEventSource('/api/stream?v=v158'); S.es.addEventListener('signal',e=>{try{apply(JSON.parse(e.data))}catch(_){}}); } },350);
    document.querySelectorAll('.tf-tabs button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tf-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');S.tf=(btn.textContent||'M1').trim();S.candles=[];pull();schedule();},true));
    candles(); pull(); setInterval(pull,1200); setInterval(schedule,900);
  }
  window.updateSignal=apply; window.updateTerminalChart=apply; window.VYRO_V158={VERSION,apply,draw,pull};
  document.addEventListener('DOMContentLoaded',()=>setTimeout(start,650));
  window.addEventListener('load',()=>setTimeout(start,650));
  window.addEventListener('resize',()=>setTimeout(schedule,120));
})();

// ===== V16.3 SMART VIEWPORT ENGINE + LAYERED SMC RENDERER =====
// Mục tiêu: sửa lỗi chart bị ép sát mép, spike phá scale, label TP/Supply/Demand đè nhau.
// Engine này chạy cuối cùng và override các engine cũ bằng 1 canvas ổn định.
(function(){
  'use strict';
  const VERSION='V16.3_SMART_VIEWPORT_LAYER_RENDERER';
  const $=id=>document.getElementById(id);
  const q=s=>document.querySelector(s);
  const num=v=>{ if(v===undefined||v===null) return NaN; const m=String(v).replace(/,/g,'').match(/-?\d+(\.\d+)?/); return m?Number(m[0]):NaN; };
  const fmt=v=>Number.isFinite(v)?Number(v).toFixed(2):'WAITING';
  const show=v=>{ if(v===false||v===0||v==='0'||v===null||v===undefined||v==='N/A'||v==='') return 'WAITING'; return String(v).toUpperCase(); };
  const put=(id,val)=>{const el=$(id); if(el) el.textContent=val;};

  const S={
    latest:{}, candles:[], canvas:null, ctx:null, raf:0, lastDraw:0, tf:'M1',
    maxCandles:160, stream:null, poll:0
  };

  function findWrap(){ return $('chartWrap')||$('chartPanel')||$('smartChartRoot')||q('.chart-wrap')||q('.chart-card')||q('.terminal-chart')||q('main'); }
  function ensureCanvas(){
    const wrap=findWrap(); if(!wrap) return null;
    wrap.style.position='relative'; wrap.style.overflow='hidden';
    // disable/remove legacy chart roots that redraw SVG/canvas over each other
    ['smartChartRoot','fallbackChart','vyroSmcCanvas','vyroSmoothCanvas'].forEach(id=>{ const el=$(id); if(el && id!=='vyroV163Canvas') el.style.display='none'; });
    let canvas=$('vyroV163Canvas');
    if(!canvas){ canvas=document.createElement('canvas'); canvas.id='vyroV163Canvas'; canvas.className='vyro-v163-canvas'; wrap.appendChild(canvas); }
    canvas.style.position='absolute'; canvas.style.inset='0'; canvas.style.width='100%'; canvas.style.height='100%'; canvas.style.display='block';
    S.canvas=canvas; S.ctx=canvas.getContext('2d');
    return canvas;
  }


  function stableField(next, prev, key) {
    const nv = next[key];
    const pv = prev ? prev[key] : undefined;
    const nBad = clean(nv, '') === '';
    if (nBad && clean(pv, '') !== '') return pv;
    if (String(nv).toUpperCase() === 'WAITING' && clean(pv, '') !== '' && String(pv).toUpperCase() !== 'WAITING') return pv;
    return nv;
  }

  function stabilize(next) {
    const prev = S.latest || {};
    const keys = [
      'trend','structure','bos','choch','bosChoch','liquidity','stopHunt','fvg','ob',
      'sellZone','buyZone','supply','demand','tp1','tp2','tp3','sl',
      'pressure','risk','action','source','session'
    ];
    keys.forEach(k => { next[k] = stableField(next, prev, k); });
    return next;
  }

  function intervalMs(){ return S.tf==='H1'?3600000:S.tf==='M15'?900000:S.tf==='M5'?300000:60000; }
  function pushTick(price,time=Date.now()){
    if(!Number.isFinite(price)||price<=0) return;
    const step=intervalMs(); const bucket=Math.floor(time/step)*step;
    let last=S.candles[S.candles.length-1];
    if(!last || last.t!==bucket){
      const prev=last?last.c:price; last={t:bucket,o:prev,h:Math.max(prev,price),l:Math.min(prev,price),c:price}; S.candles.push(last);
      if(S.candles.length>S.maxCandles) S.candles.shift();
    }else{ last.h=Math.max(last.h,price); last.l=Math.min(last.l,price); last.c=price; }
  }
  function seed(price){
    if(S.candles.length||!Number.isFinite(price)) return;
    const now=Date.now(), step=intervalMs(); let p=price;
    for(let i=90;i>=1;i--){
      const drift=(Math.sin(i/7)*0.55)+(Math.cos(i/11)*0.35);
      const o=p; const c=price+drift; const h=Math.max(o,c)+0.35; const l=Math.min(o,c)-0.35;
      S.candles.push({t:Math.floor((now-i*step)/step)*step,o,h,l,c}); p=c;
    }
  }
  function ingest(s){
    S.latest=s||S.latest||{};
    const p=num(s.price)||num(s.bid)||num(s.ask)||num(s.close)||num(s.livePrice);
    if(Number.isFinite(p)){ seed(p); pushTick(p); put('price',fmt(p)); put('chartPrice',fmt(p)); }
    updatePanel(S.latest); schedule();
  }

  function normalizeObjects(s){
    const out=[]; const push=(type,price,text)=>{ if(Number.isFinite(price)) out.push({type,price,text:text||type}); };
    const read=(keys,type)=>{ for(const k of keys){ const v=s[k]; const n=num(v); if(Number.isFinite(n)) push(type,n,String(v)); }};
    read(['sellZone','supply','supplyZone','supplyPrice','smc_supply','supplyLine'],'SUPPLY');
    read(['buyZone','demand','demandZone','demandPrice','smc_demand','demandLine'],'DEMAND');
    read(['fvg','fvgZone','fvgPrice'],'FVG');
    read(['tp1'],'TP1'); read(['tp2'],'TP2'); read(['tp3'],'TP3');
    read(['sl','stopLoss'],'SL');
    ['objects','chartObjects','smcObjects'].forEach(k=>{
      if(Array.isArray(s[k])) s[k].forEach(o=>{
        const raw=((o.name||'')+' '+(o.text||'')+' '+(o.label||'')).toUpperCase();
        const price=num(o.price)||num(o.value)||num(o.y)||num(o.text);
        let type='';
        if(/SUPPLY|SELL_ZONE|SELL AREA/.test(raw)) type='SUPPLY';
        else if(/DEMAND|BUY_ZONE|BUY AREA/.test(raw)) type='DEMAND';
        else if(/FVG/.test(raw)) type='FVG';
        else if(/TP\s*1|TP1/.test(raw)) type='TP1';
        else if(/TP\s*2|TP2/.test(raw)) type='TP2';
        else if(/TP\s*3|TP3/.test(raw)) type='TP3';
        else if(/SSL|BSL|LIQUIDITY/.test(raw)) type='LIQUIDITY';
        if(type && Number.isFinite(price)) push(type,price,raw.slice(0,42));
      });
    });
    return out;
  }

  function viewport(objects){
    const c=S.candles.slice(-S.maxCandles);
    let vals=[];
    c.forEach(x=>{ vals.push(x.o,x.h,x.l,x.c); });
    objects.forEach(o=>Number.isFinite(o.price)&&vals.push(o.price));
    vals=vals.filter(Number.isFinite);
    if(!vals.length) return {min:0,max:1};
    vals.sort((a,b)=>a-b);
    // spike filter: ignore extreme 2% tails for viewport but include live price/object via padding if close
    let lo=vals[Math.floor(vals.length*0.02)]??vals[0];
    let hi=vals[Math.ceil(vals.length*0.98)-1]??vals[vals.length-1];
    const last=c[c.length-1]?.c;
    if(Number.isFinite(last)){ lo=Math.min(lo,last); hi=Math.max(hi,last); }
    // include objects that are not ridiculously far away
    const mid=(lo+hi)/2, baseRange=Math.max(hi-lo,1);
    objects.forEach(o=>{ if(Math.abs(o.price-mid)<baseRange*3){lo=Math.min(lo,o.price);hi=Math.max(hi,o.price);} });
    let range=hi-lo; if(range<1) range=1;
    const pad=Math.max(range*0.18,0.8);
    return {min:lo-pad,max:hi+pad};
  }

  function draw(){
    S.raf=0;
    const canvas=ensureCanvas(); if(!canvas||!S.ctx) return;
    const box=canvas.parentElement.getBoundingClientRect(); const w=Math.max(360,box.width), h=Math.max(280,box.height);
    const dpr=window.devicePixelRatio||1;
    if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){ canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr); canvas.style.width=w+'px'; canvas.style.height=h+'px'; }
    const ctx=S.ctx; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const L=56,R=58,T=44,B=36, plotW=w-L-R, plotH=h-T-B;
    const objects=normalizeObjects(S.latest); const vp=viewport(objects); const y=v=>T+(vp.max-v)/(vp.max-vp.min)*plotH;
    const c=S.candles.slice(-S.maxCandles);
    // background
    const g=ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#061b43'); g.addColorStop(1,'#020716'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    // grid
    ctx.strokeStyle='rgba(88,150,255,.18)'; ctx.lineWidth=1;
    for(let i=0;i<=8;i++){ const x=L+i*plotW/8; ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+plotH);ctx.stroke(); }
    for(let i=0;i<=6;i++){ const yy=T+i*plotH/6; ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(L+plotW,yy);ctx.stroke(); }
    // title
    ctx.fillStyle='rgba(220,240,255,.9)'; ctx.font='800 13px Arial'; ctx.fillText('V16.3 Smart Viewport · '+S.tf,L,T-15);
    // SMC overlay zones first
    function line(price,color,label,dash=false){ if(!Number.isFinite(price)) return; const yy=y(price); if(yy<T-20||yy>T+plotH+20) return; ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=1.6; if(dash) ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(L,yy); ctx.lineTo(L+plotW,yy); ctx.stroke(); ctx.restore(); return yy; }
    const placed=[];
    function label(price,color,text,side='left'){
      let yy=line(price,color,text,/TP|LIQUIDITY/.test(text)); if(!Number.isFinite(yy)) return;
      yy=Math.max(T+12,Math.min(T+plotH-12,yy));
      for(const py of placed){ if(Math.abs(yy-py)<16) yy=py+16; }
      placed.push(yy);
      const x=side==='right'?L+plotW+6:L+8; ctx.font='800 12px Arial'; ctx.fillStyle=color; ctx.fillText(text+' '+fmt(price),x,yy-4);
    }
    objects.forEach(o=>{ const col=o.type==='SUPPLY'?'#ff5ca8':o.type==='DEMAND'?'#4fffd6':o.type==='FVG'?'#32d9ff':/^TP/.test(o.type)?'#ffd76a':o.type==='SL'?'#ff5959':'#fff'; label(o.price,col,o.type,o.type==='SUPPLY'||o.type==='DEMAND'?'left':'right'); });
    // candles
    if(c.length){ const cw=Math.max(3,plotW/Math.max(c.length,40)*0.55); c.forEach((bar,i)=>{ const x=L+(i+0.5)*plotW/c.length; const up=bar.c>=bar.o; const col=up?'#45ffd3':'#ff5d96'; const yo=y(bar.o), yc=y(bar.c), yh=y(bar.h), yl=y(bar.l); ctx.strokeStyle=col; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(x,yh); ctx.lineTo(x,yl); ctx.stroke(); ctx.fillStyle=col; ctx.fillRect(x-cw/2,Math.min(yo,yc),cw,Math.max(2,Math.abs(yc-yo))); }); }
    else{ ctx.fillStyle='rgba(255,215,106,.95)'; ctx.font='900 16px Arial'; ctx.fillText('WAITING REALTIME MT5 CANDLE FEED',L+20,T+45); }
    // live price marker
    const last=c[c.length-1]?.c||num(S.latest.price); if(Number.isFinite(last)){ const yy=y(last); ctx.strokeStyle='rgba(78,255,231,.65)'; ctx.setLineDash([5,5]); ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(L+plotW,yy);ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='#4fffd6'; roundRect(ctx,L+plotW+8,yy-13,58,26,7,true,false); ctx.fillStyle='#012233'; ctx.font='900 12px Arial'; ctx.fillText(fmt(last),L+plotW+13,yy+4); }
    // bounds labels
    ctx.fillStyle='rgba(220,240,255,.65)'; ctx.font='11px Arial'; ctx.fillText(fmt(vp.max),4,T+4); ctx.fillText(fmt(vp.min),4,T+plotH); 
  }
  function roundRect(ctx,x,y,w,h,r,fill,stroke){ if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,w,h,r); if(fill)ctx.fill(); if(stroke)ctx.stroke(); return;} ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r); if(fill)ctx.fill(); if(stroke)ctx.stroke(); }
  function schedule(){ if(!S.raf) S.raf=requestAnimationFrame(draw); }

  function updatePanel(s){
    const smc=s.smc||s;
    const liq=show(smc.liquidity||s.liquidity||s.ssl||s.bsl);
    const stop=show(smc.stopHunt||s.stopHunt||s.stophunt);
    const sell=fmt(num(smc.sellZone)||num(smc.supply)||num(s.supply));
    const buy=fmt(num(smc.buyZone)||num(smc.demand)||num(s.demand));
    const fvg=show(smc.fvg||s.fvg||s.fvgZone);
    put('liquidity',liq); put('stopHunt',stop); put('sellZone',sell); put('buyZone',buy); put('fvgZone',fvg);
    put('tp1',fmt(num(s.tp1)||num(smc.tp1))); put('tp2',fmt(num(s.tp2)||num(smc.tp2))); put('tp3',fmt(num(s.tp3)||num(smc.tp3)));
    const st=show(s.structure||s.trend||smc.structure); put('structure',st==='WAITING'?'WAITING':st);
    const bc=show(s.bos||s.choch||smc.bos||smc.choch); put('bosChoch',bc);
  }

  async function pull(){ try{ const r=await fetch('/api/normalized?v='+Date.now(),{cache:'no-store'}); if(r.ok){ const j=await r.json(); ingest(j.normalized||j.latest||j); return; }}catch(e){} try{ const r=await fetch('/api/latest-signal?v='+Date.now(),{cache:'no-store'}); const j=await r.json(); ingest(j.latest||j.signal||j); }catch(e){} }
  function stream(){ try{ if(S.stream) S.stream.close(); S.stream=new EventSource('/api/stream?v=163'); S.stream.onmessage=e=>{ try{ ingest(JSON.parse(e.data)); }catch(_){} }; }catch(e){} }
  function init(){
    document.querySelectorAll('.tf-tabs button, [data-tf]').forEach(btn=>btn.addEventListener('click',()=>{S.tf=(btn.dataset.tf||btn.textContent||'M1').trim().toUpperCase(); S.candles=[]; pull(); schedule();}));
    ensureCanvas(); pull(); stream(); clearInterval(S.poll); S.poll=setInterval(pull,5000); schedule();
  }
  window.VYRO_V163={VERSION,ingest,draw,pull,stream,state:S};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
