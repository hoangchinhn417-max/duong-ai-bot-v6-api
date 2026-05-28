const API_URL = window.location.origin;
const $ = id => document.getElementById(id);
let eventSource = null;
let fallbackTimer = null;
let lastSignalJson = '';

function set(id, v){
  const e=$(id);
  if(!e) return;
  const text = (v===undefined||v===null||v==='') ? '--' : String(v);
  if(e.textContent !== text){
    e.textContent = text;
    const card = e.closest('.card');
    if(card){ card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
  }
}
function getSession(){ try{return JSON.parse(localStorage.getItem('vyroUser') || 'null')}catch(e){return null} }
function saveSession(u){ localStorage.setItem('vyroUser', JSON.stringify(u)); }
function showDash(user){
  $('loginPage').classList.add('hidden'); $('dashboard').classList.remove('hidden');
  set('accountName', user.name || user.username); set('accountPlan', user.plan || 'VIP AI'); set('expire', user.expire || '2099-12-31');
  if(!user.admin) document.querySelector('[data-tab="admin"]').style.display='none';
  startRealtime(); loadUsers(); loadHistory();
}
function showLogin(){ stopRealtime(); $('dashboard').classList.add('hidden'); $('loginPage').classList.remove('hidden'); }
async function login(e){
  e.preventDefault();
  $('loginMsg').textContent = 'Đang đăng nhập...';
  try{
    const r = await fetch(API_URL + '/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:$('username').value.trim(), password:$('password').value.trim()})});
    const d = await r.json();
    if(!d.ok && !d.success) throw new Error(d.message || 'Sai tài khoản hoặc mật khẩu');
    saveSession(d.user); $('loginMsg').textContent=''; showDash(d.user);
  }catch(err){ $('loginMsg').textContent = err.message || 'Không đăng nhập được'; }
}
function switchTab(tab){
  document.querySelectorAll('#navMenu button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.tab-page').forEach(p=>p.classList.remove('active'));
  const page = $('tab-' + tab); if(page) page.classList.add('active');
  if(tab==='history') loadHistory();
  if(tab==='admin') loadUsers();
}
function updateRealtimeStatus(text, ok=true){
  set('realtimeStatus', ok ? '● ONLINE' : '● FALLBACK');
  $('realtimeStatus')?.classList.toggle('offline', !ok);
  $('realtimeStatus')?.classList.toggle('online', ok);
  set('streamInfo', text);
}
function applySignal(d){
  if(!d || typeof d !== 'object') return;
  const json = JSON.stringify(d);
  if(json === lastSignalJson) return;
  lastSignalJson = json;

  const sig = d.signal || d.status || 'WAIT';
  const conf = d.conf || d.confidence || d.score || 55;
  set('mainSignal', sig);
  set('symbolTop', d.symbol || 'XAUUSD.G');
  set('tfTop', d.timeframe || 'M1');
  set('symbolValue', d.price ?? d.symbol ?? 'XAUUSD.G');
  set('symbolSub', sig);
  set('rsiValue', d.rsi);
  set('flowValue', d.flow);
  set('deltaValue', d.delta);
  set('powerValue', d.power);
  set('buySellValue', d.buySell || '0/0');
  set('confValue', conf + '%');
  set('aiScore', conf);
  set('pressureValue', d.pressure || d.raw?.pressure || sig);
  set('deltaText', (Number(d.delta) < 0 ? 'Seller attack' : Number(d.delta) > 0 ? 'Buyer attack' : 'Neutral attack'));
  set('trendValue', d.trend || d.raw?.trend || (sig.includes('BUY')?'Bullish':sig.includes('SELL')?'Bearish':'Neutral'));
  set('liquidityValue', d.liquidity || d.raw?.liquidity || 'Waiting');
  set('riskValue', d.risk || d.raw?.risk || '--');
  set('actionValue', d.action || d.raw?.action || '--');
  set('supplyValue', d.sellZone || d.supply || d.raw?.sellZone || d.raw?.supply || '--');
  set('demandValue', d.buyZone || d.demand || d.raw?.buyZone || d.raw?.demand || '--');
  set('dominanceValue', d.pressure || d.raw?.pressure || 'Mixed');
  set('flowMini', d.flow);
  set('deltaMini', d.delta);
  set('powerMini', d.power);
  set('updateValue', new Date(d.updatedAt || Date.now()).toLocaleTimeString());
  set('agoValue', 'live');
  $('statusText').textContent = d.reason || 'Realtime layer đang nhận dữ liệu trực tiếp từ MT5.';

  const h = $('mainSignal');
  const hero = $('heroBox');
  h.classList.remove('buy','sell'); hero.classList.remove('buy','sell');
  if(sig.includes('SELL')){ h.classList.add('sell'); hero.classList.add('sell'); }
  if(sig.includes('BUY')){ h.classList.add('buy'); hero.classList.add('buy'); }
}
async function loadSignal(){
  try{
    const r = await fetch(API_URL + '/api/latest-signal?t=' + Date.now(), {cache:'no-store'});
    const d = await r.json();
    applySignal(d);
  }catch(e){ console.error(e); }
}
function startRealtime(){
  stopRealtime();
  updateRealtimeStatus('Connecting realtime stream...', false);
  try{
    eventSource = new EventSource(API_URL + '/api/stream');
    eventSource.addEventListener('connected', () => updateRealtimeStatus('SSE connected - dữ liệu đẩy trực tiếp', true));
    eventSource.addEventListener('signal', e => {
      updateRealtimeStatus('SSE live - nhận tức thì từ MT5', true);
      applySignal(JSON.parse(e.data));
    });
    eventSource.addEventListener('ping', () => updateRealtimeStatus('SSE live - heartbeat OK', true));
    eventSource.onerror = () => {
      updateRealtimeStatus('SSE fallback polling 1s', false);
      if(!fallbackTimer) fallbackTimer = setInterval(loadSignal, 1000);
    };
  }catch(e){
    updateRealtimeStatus('Polling 1s', false);
    fallbackTimer = setInterval(loadSignal, 1000);
  }
  loadSignal();
}
function stopRealtime(){
  if(eventSource){ eventSource.close(); eventSource=null; }
  if(fallbackTimer){ clearInterval(fallbackTimer); fallbackTimer=null; }
}
async function testBuy(){ await fetch(API_URL + '/api/test-signal', {method:'POST'}); await loadSignal(); await loadHistory(); }
async function loadHistory(){
  try{
    const r = await fetch(API_URL + '/api/signal-history?t=' + Date.now(), {cache:'no-store'}); const d = await r.json();
    const body = $('historyBody'); if(!body) return; body.innerHTML = '';
    (d.history || []).forEach(x => {
      body.innerHTML += `<tr><td>${new Date(x.updatedAt||Date.now()).toLocaleString()}</td><td>${x.symbol||'--'}</td><td>${x.signal||'--'}</td><td>${x.rsi??'--'}</td><td>${x.flow??'--'}</td><td>${x.delta??'--'}</td><td>${x.conf??x.confidence??'--'}</td><td>${x.pressure||'--'}</td></tr>`;
    });
  }catch(e){ console.error(e); }
}
async function loadUsers(){
  try{
    const r = await fetch(API_URL + '/api/users?t=' + Date.now(), {cache:'no-store'}); const d = await r.json();
    const body = $('usersBody'); if(!body) return; body.innerHTML = '';
    (d.users || []).forEach(u => {
      body.innerHTML += `<tr><td>${u.username}</td><td>${u.name||''}</td><td>${u.plan||''}</td><td>${u.status||''}</td><td>${u.expire||''}</td><td>${u.admin?'YES':'NO'}</td></tr>`;
    });
  }catch(e){ console.error(e); }
}
async function createUser(){
  $('adminMsg').textContent = 'Đang tạo user...';
  try{
    const payload = {username:$('newUser').value.trim(), password:$('newPass').value.trim(), name:$('newName').value.trim(), plan:$('newPlan').value, expire:$('newExpire').value, status:'active'};
    const r = await fetch(API_URL + '/api/users', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const d = await r.json(); if(!d.ok) throw new Error(d.message || 'Không tạo được user');
    $('adminMsg').textContent = 'Đã tạo user thành công'; loadUsers();
  }catch(e){ $('adminMsg').textContent = e.message; }
}
async function registerClient(){
  $('regMsg').textContent = 'Đang gửi đăng ký...';
  try{
    const username = $('regPhone').value.trim();
    const payload = {username, password:$('regPass').value.trim(), name:$('regName').value.trim(), email:$('regEmail').value.trim(), plan:$('regPlan').value, status:'pending', expire:'2099-12-31'};
    const r = await fetch(API_URL + '/api/users', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const d = await r.json(); if(!d.ok) throw new Error(d.message || 'Không đăng ký được');
    $('regMsg').textContent = 'Đã tạo tài khoản chờ duyệt.';
  }catch(e){ $('regMsg').textContent = e.message; }
}
document.addEventListener('DOMContentLoaded', () => {
  $('loginForm').addEventListener('submit', login);
  $('logoutBtn').addEventListener('click', ()=>{localStorage.removeItem('vyroUser'); showLogin();});
  $('pullBtn').addEventListener('click', loadSignal);
  $('testBtn').addEventListener('click', testBuy);
  $('refreshHistory').addEventListener('click', loadHistory);
  $('createUserBtn').addEventListener('click', createUser);
  $('openRegister').addEventListener('click', ()=>$('registerBox').classList.toggle('hidden'));
  $('regBtn').addEventListener('click', registerClient);
  document.querySelectorAll('#navMenu button').forEach(b => b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
  const u = getSession(); if(u) showDash(u); else showLogin();
});
