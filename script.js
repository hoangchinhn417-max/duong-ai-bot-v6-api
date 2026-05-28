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
function rawFlow(s){return s.flow ?? s.cvd ?? '--'}function rawDelta(s){return s.delta ?? s.powerDelta ?? '--'}function rawPower(s){return s.power ?? s.diff ?? '--'}function rawBuySell(s){return s.buySell ?? s.buy_sell ?? s.ratio ?? '--'}
function dominanceFrom(s,sig){let f=nval(rawFlow(s)),d=nval(rawDelta(s));if(f<0&&d<0)return'Seller dominant';if(f>0&&d>0)return'Buyer dominant';if(sig.includes('SELL'))return'Seller dominant';if(sig.includes('BUY'))return'Buyer dominant';return'Mixed'}
function updateSignal(s){
  let sig=norm(s.signal),sc=Math.max(0,Math.min(100,Number(s.score||s.confidence||s.conf||55))),p=s.price||'--',fv=rawFlow(s),dv=rawDelta(s),pv=rawPower(s),bs=rawBuySell(s),dom=dominanceFrom(s,sig);
  document.body.classList.remove('sell','buy','wait');document.body.classList.add(sig.includes('SELL')?'sell':sig.includes('BUY')?'buy':'wait');
  $('signal').innerText=sig;$('score').innerText=sc;$('ring').style.background=`conic-gradient(var(--cyan) ${sc}%,rgba(255,255,255,.12) 0)`;
  $('reason').innerText=s.reason||`${s.symbol||'XAUUSD'} ${sig} from MT5 Smart Flow.`;$('marketTag').innerText=`${s.symbol||'XAUUSD'} · ${s.timeframe||'M1'} · SMART FLOW`;
  $('price').innerText=p;$('priceState').innerText=sig.replace(' NOW','');$('rsi').innerText=s.rsi||'--';$('flow').innerText=fv;$('flowSub').innerText=dom;$('delta').innerText=dv;
  $('deltaSub').innerText=nval(dv)>0?'Buyer attack':nval(dv)<0?'Seller attack':'Neutral attack';$('power').innerText=pv;$('buySell').innerText=bs;$('conf').innerText=sc+'%';$('lastUpdate').innerText=fmt(s.updatedAt||s.receivedAt||new Date().toISOString());
  if($('sellZone'))$('sellZone').innerText=s.sellZone||s.supply||s.supplyZone||s.smcSellZone||s.raw?.sellZone||s.raw?.supply||'--';if($('buyZone'))$('buyZone').innerText=s.buyZone||s.demand||s.demandZone||s.smcBuyZone||s.raw?.buyZone||s.raw?.demand||'--';$('trend').innerText=s.trend||'N/A';$('liquidity').innerText=s.liquidity||'N/A';$('pressure').innerText=s.pressure||sig;$('risk').innerText=s.risk||'Medium';$('action').innerText=s.action||'Follow setup';$('source').innerText=s.source||'MT5';$('dominance').innerText=dom;$('dominanceNote').innerText=`Flow ${fv} · Delta ${dv} · Power ${pv}`;$('lastTick').innerText=p;lastDataTime=Date.now();addHistory(sig,p,fv,dv)
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
