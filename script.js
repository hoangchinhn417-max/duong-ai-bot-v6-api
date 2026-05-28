const APP_VERSION='VYRO_PRO_MAX';
const USER_KEY='vyro_pro_users';
const PIN_KEY='vyro_pro_pin';
const SESSION_KEY='vyro_pro_session';

let users=[],currentUser=null,ADMIN_PIN=localStorage.getItem(PIN_KEY)||'2606';
let API_BASE=window.location.origin,eventSource=null,lastDataTime=0,heartbeatTimer=null;

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
  connectApi();pullLatest();startHeartbeat();
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
function setApiState(ok){$('apiStatusText').innerText=ok?'ONLINE':'STANDBY';$('connectionText').innerText=ok?'ONLINE':'STANDBY'; if($('apiSubText'))$('apiSubText').innerText=ok?'SSE realtime - nhận tức thì từ MT5':'MT5 realtime bridge'}
async function pullLatest(){
  try{let r=await fetch(API_BASE+'/api/latest-signal',{cache:'no-store'}),d=await r.json();if(d&&d.symbol){updateSignal(d);setApiState(true)}else throw new Error('empty')}
  catch(e){setApiState(false);demoSignal();showToast('API standby - đang dùng demo signal')}
}
function demoSignal(){
  updateSignal({symbol:'XAUUSD',timeframe:'M1',signal:'WAIT',score:55,price:'--',rsi:'--',flow:'--',delta:'--',power:'--',buySell:'--',reason:'API chưa có dữ liệu mới. Dashboard vẫn sẵn sàng nhận tín hiệu MT5.',trend:'Neutral',liquidity:'Waiting',pressure:'Waiting',risk:'Medium',source:'DEMO'});
}
function norm(v){let s=String(v||'WAIT').toUpperCase();if(s.includes('SELL'))return'SELL NOW';if(s.includes('BUY'))return'BUY NOW';return'WAIT'}
function nval(v){let x=Number(v);return isNaN(x)?0:x}

function firstVal(obj, keys, fallback='--'){
  for(const k of keys){
    if(!obj) continue;
    if(obj[k]!==undefined && obj[k]!==null && obj[k]!=='') return obj[k];
    if(obj.raw && obj.raw[k]!==undefined && obj.raw[k]!==null && obj.raw[k]!=='') return obj.raw[k];
  }
  return fallback;
}
function rawFlow(s){return firstVal(s,['flow','FLOW','cvd'],'--')}
function rawDelta(s){return firstVal(s,['delta','DELTA','powerDelta'],'--')}
function rawPower(s){return firstVal(s,['power','POWER','diff'],'--')}
function rawBuySell(s){return firstVal(s,['buySell','buy_sell','ratio','BUY/SELL','buy_sell_ratio'],'--')}
function zoneVal(s,type){
  const keys=type==='sell'?['sellZone','sell_zone','supply','supplyZone','smcSellZone','smc_supply','supply_line','supplyPrice']:['buyZone','buy_zone','demand','demandZone','smcBuyZone','smc_demand','demand_line','demandPrice'];
  return firstVal(s,keys,'--');
}
function smcVal(s,keys,fallback='--'){return firstVal(s,keys,fallback)}

function dominanceFrom(s,sig){let f=nval(rawFlow(s)),d=nval(rawDelta(s));if(f<0&&d<0)return'Seller dominant';if(f>0&&d>0)return'Buyer dominant';if(sig.includes('SELL'))return'Seller dominant';if(sig.includes('BUY'))return'Buyer dominant';return'Mixed'}
function updateSignal(s){
  let sig=norm(s.signal),sc=Math.max(0,Math.min(100,Number(s.score||s.confidence||s.conf||55))),p=s.price||s.bid||s.ask||'--',fv=rawFlow(s),dv=rawDelta(s),pv=rawPower(s),bs=rawBuySell(s),dom=dominanceFrom(s,sig);
  let sellZ=zoneVal(s,'sell'), buyZ=zoneVal(s,'buy');
  let liquidity=smcVal(s,['liquidity','liq','ssl','bsl','liquidityText'],'N/A');
  let bos=smcVal(s,['bosChoch','bos_choch','bos','choch','structureSignal'],'--');
  let stopHunt=smcVal(s,['stopHunt','stophunt','stop_hunt'],'--');
  let fvg=smcVal(s,['fvg','fvgZone','fvg_zone'],'--');
  let ob=smcVal(s,['ob','obZone','orderBlock','order_block'],'--');
  let tp1=smcVal(s,['tp1','TP1'],'--'), tp2=smcVal(s,['tp2','TP2'],'--'), tp3=smcVal(s,['tp3','TP3'],'--');
  document.body.classList.remove('sell','buy','wait');document.body.classList.add(sig.includes('SELL')?'sell':sig.includes('BUY')?'buy':'wait');
  $('signal').innerText=sig;$('score').innerText=sc;$('ring').style.background=`conic-gradient(var(--cyan) ${sc}%,rgba(255,255,255,.12) 0)`;
  $('reason').innerText=s.reason||`${s.symbol||'XAUUSD'} ${sig} from MT5 Smart Flow.`;$('marketTag').innerText=`${s.symbol||'XAUUSD'} · ${s.timeframe||'M1'} · SMART FLOW`;
  $('price').innerText=p;$('priceState').innerText=sig.replace(' NOW','');$('rsi').innerText=s.rsi||'--';$('flow').innerText=fv;$('flowSub').innerText=dom;$('delta').innerText=dv;
  $('deltaSub').innerText=nval(dv)>0?'Buyer attack':nval(dv)<0?'Seller attack':'Neutral attack';$('power').innerText=pv;$('buySell').innerText=bs;$('conf').innerText=sc+'%';$('lastUpdate').innerText=fmt(s.updatedAt||s.receivedAt||new Date().toISOString());
  if($('sellZone'))$('sellZone').innerText=sellZ;if($('buyZone'))$('buyZone').innerText=buyZ;$('trend').innerText=s.trend||'N/A';$('liquidity').innerText=liquidity;$('pressure').innerText=s.pressure||sig;$('risk').innerText=s.risk||'Medium';$('action').innerText=s.action||'Follow setup';$('source').innerText=s.source||'MT5';$('dominance').innerText=dom;$('dominanceNote').innerText=`Flow ${fv} · Delta ${dv} · Power ${pv}`;$('lastTick').innerText=p;lastDataTime=Date.now();addHistory(sig,p,fv,dv);
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
  heartbeatTimer=setInterval(()=>{$('heartbeat').innerText=new Date().toLocaleTimeString('vi-VN');$('mode').innerText=lastDataTime&&Date.now()-lastDataTime>30000?'NO NEW SIGNAL':'LIVE';$('age').innerText=lastDataTime?Math.floor((Date.now()-lastDataTime)/1000)+'s ago':'waiting'},1000)
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


// ===== V15 TradingView Terminal + SMC renderer =====
let vyroChart=null, candleSeries=null, lineSeries=null, markerSeries=null, fallbackCanvas=null, fallbackData=[];
function initTerminalChart(){
  const el=$('tvChart'); if(!el) return;
  fallbackCanvas=$('fallbackChart');
  if(window.LightweightCharts){
    try{
      vyroChart=LightweightCharts.createChart(el,{layout:{background:{color:'transparent'},textColor:'#b8c8e8'},grid:{vertLines:{color:'rgba(80,130,210,.12)'},horzLines:{color:'rgba(80,130,210,.12)'}},crosshair:{mode:1},rightPriceScale:{borderColor:'rgba(80,130,210,.18)'},timeScale:{borderColor:'rgba(80,130,210,.18)',timeVisible:true,secondsVisible:true}});
      candleSeries=vyroChart.addCandlestickSeries({upColor:'#00ff9d',downColor:'#ff3f68',borderUpColor:'#00ff9d',borderDownColor:'#ff3f68',wickUpColor:'#9fffd6',wickDownColor:'#ff9aaa'});
      seedCandles(Number($('price')?.innerText)||4380);
      window.addEventListener('resize',()=>{try{vyroChart.applyOptions({width:el.clientWidth,height:el.clientHeight});vyroChart.timeScale().fitContent()}catch(e){}});
      return;
    }catch(e){}
  }
  seedFallback(Number($('price')?.innerText)||4380);
}
function seedCandles(base){
  const now=Math.floor(Date.now()/1000)-1200; let data=[],p=Number(base)||4380;
  for(let i=0;i<80;i++){let o=p,c=o+(Math.random()-.52)*1.8,h=Math.max(o,c)+Math.random()*1.2,l=Math.min(o,c)-Math.random()*1.2;data.push({time:now+i*15,open:o,high:h,low:l,close:c});p=c}
  candleSeries.setData(data); vyroChart.timeScale().fitContent(); fallbackData=data;
}
function seedFallback(base){fallbackData=[];let p=Number(base)||4380;for(let i=0;i<80;i++){let c=p+(Math.random()-.52)*1.8;fallbackData.push({close:c});p=c}drawFallbackChart({})}
function updateTerminalChart(d){
  if($('chartPrice')) $('chartPrice').innerText=d.price||'--';
  const price=Number(d.price); if(!Number.isFinite(price)) return;
  if(candleSeries){
    const last=fallbackData[fallbackData.length-1]||{close:price};
    const o=last.close, c=price, h=Math.max(o,c)+Math.random()*.65, l=Math.min(o,c)-Math.random()*.65;
    const bar={time:Math.floor(Date.now()/1000),open:o,high:h,low:l,close:c};
    fallbackData.push(bar); if(fallbackData.length>120)fallbackData.shift(); candleSeries.update(bar);
    drawOverlayLines(d);
  } else {fallbackData.push({close:price}); if(fallbackData.length>120)fallbackData.shift(); drawFallbackChart(d)}
}
function drawOverlayLines(d){
  // Lightweight overlay drawings are intentionally simple here; SMC values render in right panel and fallback canvas.
}
function drawFallbackChart(d){
  const canvas=fallbackCanvas; if(!canvas) return; const box=canvas.parentElement.getBoundingClientRect(); canvas.width=box.width; canvas.height=box.height;
  const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height; ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(80,130,210,.14)'; ctx.lineWidth=1; for(let i=0;i<8;i++){let y=h*i/8;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  const vals=fallbackData.map(x=>x.close), min=Math.min(...vals)-2,max=Math.max(...vals)+2; const y=v=>h-((v-min)/(max-min))*h;
  ctx.strokeStyle='rgba(0,217,255,.9)'; ctx.lineWidth=2; ctx.beginPath(); vals.forEach((v,i)=>{let x=i*(w/(Math.max(vals.length-1,1))); i?ctx.lineTo(x,y(v)):ctx.moveTo(x,y(v))}); ctx.stroke();
  function zone(val,color,label){let n=Number(String(val).split(/[-–]/)[0]); if(!Number.isFinite(n))return; let yy=y(n); ctx.strokeStyle=color;ctx.fillStyle=color;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillText(label+' '+val,12,yy-6)}
  ctx.font='12px Arial'; zone(d.sellZone,'#ff3f68','SUPPLY'); zone(d.buyZone,'#00ff9d','DEMAND'); zone(d.tp1,'#ffd34d','TP1'); zone(d.tp2,'#ffd34d','TP2'); zone(d.tp3,'#ffd34d','TP3');
}
function updateSMCPanel(x){
  const set=(id,v)=>{if($(id))$(id).innerText=(v===undefined||v===null||v==='')?'--':v};
  set('smcStructure',x.s.trend||x.sig.replace(' NOW','')); set('smcStructureNote',x.sig.includes('SELL')?'Lower High / Lower Low':x.sig.includes('BUY')?'Higher High / Higher Low':'Waiting structure');
  set('smcBosChoch',x.bos); set('smcBosChochNote',String(x.bos).includes('CHOCH')?'Change of Character':String(x.bos).includes('BOS')?'Break of Structure':'Waiting');
  set('smcStrength',x.s.trendStrength||((x.sc>=80||Math.abs(nval(x.fv))>500)?'STRONG':'MEDIUM'));
  set('smcLiquidity',x.liquidity); set('smcLiquidityNote',String(x.liquidity).includes('SSL')?'Sell side liquidity':String(x.liquidity).includes('BSL')?'Buy side liquidity':'Liquidity read');
  set('smcStopHunt',x.stopHunt); set('smcSellZone',x.sellZ); set('smcBuyZone',x.buyZ); set('smcTp1',x.tp1); set('smcTp2',x.tp2); set('smcTp3',x.tp3); set('smcFvg',x.fvg); set('smcOb',x.ob); set('smcMitigation',smcVal(x.s,['mitigation'],'PARTIAL')); set('smcConfluence',smcVal(x.s,['confluence'],'HIGH'));
  const bars=document.querySelectorAll('#smcBars i'); const level=Math.max(1,Math.min(8,Math.round((x.sc||55)/12.5))); bars.forEach((b,i)=>b.classList.toggle('on',i<level));
}
window.addEventListener('load',()=>setTimeout(initTerminalChart,500));
