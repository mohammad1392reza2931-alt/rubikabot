export const PANEL_HTML = String.raw`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>پنل مدیریت ربات</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css">
<style>
:root{--bg:#0f1220;--c:#181c30;--c2:#20253d;--t:#eef0fa;--m:#98a0c4;--g:#ffc83d;--ok:#3ddc97;--bad:#ff5c7a;--r:16px}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#2a2150,transparent),var(--bg);color:var(--t);font-family:Vazirmatn,Tahoma,sans-serif;padding:14px;max-width:760px;margin:auto}
h1{font-size:20px;margin:6px 0}h2{font-size:16px;margin:0 0 10px;color:var(--g)}
.card{background:var(--c);border:1px solid #ffffff12;border-radius:var(--r);padding:14px;margin:12px 0;box-shadow:0 8px 24px #0005}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sp{justify-content:space-between}
button{font-family:inherit;border:0;border-radius:12px;padding:9px 13px;background:var(--c2);color:var(--t);cursor:pointer;font-size:13px}
button.p{background:linear-gradient(135deg,#ffc83d,#ff9f1c);color:#1b1500;font-weight:700}button.d{background:#ff5c7a22;color:var(--bad)}button:active{transform:scale(.96)}
input,textarea{width:100%;font-family:inherit;background:var(--c2);border:1px solid #ffffff18;color:var(--t);border-radius:12px;padding:10px;font-size:14px}
textarea{min-height:70px;resize:vertical}label{font-size:12px;color:var(--m);display:block;margin:8px 0 4px}
.chip{background:var(--c2);border-radius:99px;padding:5px 11px;font-size:12px;color:var(--m)}.chip b{color:var(--t)}
.ch{border-top:1px solid #ffffff10;padding:12px 0}.ch:first-child{border:0}.nm{font-weight:700;font-size:15px}.id{font-size:11px;color:var(--m);direction:ltr;display:inline-block}
.tag{font-size:11px;padding:2px 8px;border-radius:99px;background:#3ddc9722;color:var(--ok)}.tag.off{background:#ff5c7a22;color:var(--bad)}
.log{font-size:12px;color:var(--m);padding:6px 0;border-top:1px solid #ffffff0d;white-space:pre-wrap;word-break:break-word}
#toast{position:fixed;bottom:18px;left:50%;transform:translate(-50%,80px);background:#000c;padding:11px 18px;border-radius:12px;transition:.3s;font-size:13px;max-width:90%}#toast.show{transform:translate(-50%,0)}
</style></head><body>
<div id="app"></div><div id="toast"></div>
<script>
var K=localStorage.getItem('k')||'',D=null;
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
async function call(b){var ac=new AbortController(),tm=setTimeout(function(){ac.abort()},60000);try{var r=await fetch('/api',{method:'POST',headers:{'x-key':K,'Content-Type':'application/json'},body:JSON.stringify(b),signal:ac.signal});if(r.status==403){localStorage.removeItem('k');K='';login();throw new Error('رمز اشتباه است')}var j=await r.json();if(j.error)throw new Error(j.error);return j}catch(e){if(e.name==='AbortError')throw new Error('پاسخی از سرور نیامد');throw e}finally{clearTimeout(tm)}}
function toast(t){var e=$('toast');e.textContent=t;e.className='show';setTimeout(function(){e.className=''},4000)}
async function act(b,msg){try{toast('در حال انجام...');var r=await call(b);if(r&&r.channels){D=r;render()}else await load();toast(msg||(typeof r==='string'&&r!=='ok'?r:'انجام شد'))}catch(e){toast('خطا: '+e.message)}}
function ago(t){if(!t)return'هنوز پستی نرفته';var m=Math.round((D.now-t)/60000);if(m<1)return'همین الان';if(m<60)return m+' دقیقه پیش';var h=Math.round(m/60);return h<48?h+' ساعت پیش':Math.round(h/24)+' روز پیش'}
function login(){$('app').innerHTML='<div class="card"><h1>ورود به پنل</h1><label>رمز (همان SECRET)</label><input id="pw" type="password"><div style="height:10px"></div><button class="p" onclick="doLogin()">ورود</button></div>'}
function doLogin(){K=$('pw').value;localStorage.setItem('k',K);load().catch(function(e){toast(e.message)})}
async function load(){D=await call({action:'state'});render()}
function render(){var s=D.settings,h='';
h+='<div class="row sp"><h1>🤖 پنل مدیریت ربات</h1><button onclick="load()">بروزرسانی</button></div>';
h+='<div class="card"><div class="row"><span class="chip">کانال‌ها: <b>'+D.channels.length+'</b></span><span class="chip">پست‌شده: <b>'+D.doneCount+'</b></span><span class="chip">وضعیت: <b>'+(s.paused?'متوقف':'فعال')+'</b></span></div><div style="height:10px"></div><div class="row"><button class="'+(s.paused?'p':'d')+'" onclick="act({action:\'settings\',settings:{paused:'+!s.paused+'}},\'ثبت شد\')">'+(s.paused?'▶ روشن کردن ربات':'⏸ توقف کل ربات')+'</button></div></div>';
h+='<div class="card"><h2>کانال‌ها</h2>';
D.channels.forEach(function(c,i){var id=c.id;h+='<div class="ch"><div class="row sp"><div><div class="nm">'+(i+1)+') '+esc(c.name||'نام نامشخص (ربات دسترسی ندارد؟)')+'</div><span class="id">'+id+'</span></div><span class="tag'+(c.paused?' off':'')+'">'+(c.paused?'متوقف':'فعال')+'</span></div>';
h+='<div style="font-size:12px;color:var(--m);margin:6px 0">آخرین پست: '+ago(c.last)+' | بنر: '+(c.bannerOn?'روشن':'خاموش')+'</div>';
h+='<label>پیام زیر پست‌ها</label><textarea id="f_'+id+'">'+esc(c.footer||'')+'</textarea><div style="height:8px"></div><div class="row">';
h+='<button class="p" onclick="act({action:\'setChannel\',id:\''+id+'\',patch:{footer:$(\'f_'+id+'\').value}},\'ذخیره شد\')">ذخیره پیام</button>';
h+='<button onclick="act({action:\'post\',id:\''+id+'\'})">پست فوری</button><button onclick="act({action:\'banner\',id:\''+id+'\'},\'بنر ارسال شد\')">ارسال بنر</button>';
h+='<button onclick="act({action:\'setChannel\',id:\''+id+'\',patch:{paused:'+!c.paused+'}},\'ثبت شد\')">'+(c.paused?'فعال کن':'توقف')+'</button>';
h+='<button onclick="act({action:\'setChannel\',id:\''+id+'\',patch:{banner:'+!c.bannerOn+'}},\'ثبت شد\')">بنر '+(c.bannerOn?'خاموش':'روشن')+'</button>';
h+='<button class="d" onclick="if(confirm(\'حذف شود؟\'))act({action:\'remove\',id:\''+id+'\'},\'حذف شد\')">حذف</button></div></div>'});
if(!D.channels.length)h+='<div class="log">کانالی نیست. ربات را ادمین کنید و در کانال پیام بنویسید.</div>';
h+='<label>افزودن دستی کانال (آیدی c0...)</label><div class="row"><input id="addid" style="flex:1" dir="ltr"><button class="p" onclick="act({action:\'add\',id:$(\'addid\').value.trim()},\'اضافه شد\')">افزودن</button></div>';
h+='<div style="height:8px"></div><button onclick="act({action:\'scan\'})">شناسایی کانال‌های جدید</button></div>';
h+='<div class="card"><h2>کانال‌های حذف‌شده</h2>';D.blocked.forEach(function(b){h+='<div class="row sp ch"><div><div class="nm">'+esc(b.name||'نام نامشخص')+'</div><span class="id">'+b.id+'</span></div><button class="p" onclick="act({action:\'unblock\',id:\''+b.id+'\'},\'برگشت\')">برگردان</button></div>'});
if(!D.blocked.length)h+='<div class="log">خالی است.</div>';h+='</div>';
h+='<div class="card"><h2>تنظیمات</h2><label>فاصله‌ی پست هر کانال (دقیقه)</label><input id="s1" type="number" value="'+s.intervalMin+'"><label>فاصله‌ی بنر (ساعت)</label><input id="s2" type="number" value="'+s.bannerHours+'"><label>حداکثر حجم فایل ماد (مگابایت)</label><input id="s3" type="number" value="'+s.maxMb+'"><label>کلمات جستجو (با کاما جدا کنید)</label><textarea id="s4">'+esc(s.words.join(', '))+'</textarea><label>متن بنر</label><textarea id="s5" style="min-height:150px">'+esc(s.bannerText)+'</textarea><label><input id="s6" type="checkbox" style="width:auto" '+(s.showAuthor?'checked':'')+'> نمایش نام سازنده زیر پست</label><div style="height:8px"></div><button class="p" onclick="saveS()">ذخیره تنظیمات</button></div>';
h+='<div class="card"><h2>عکس بنر</h2><div class="row"><span class="chip">'+(D.hasBanner?'عکس سفارشی ثبت شده':'عکس پیش‌فرض')+'</span></div><label>انتخاب عکس جدید</label><input id="bf" type="file" accept="image/*" onchange="upB(this)">'+(D.hasBanner?'<div style="height:8px"></div><button class="d" onclick="act({action:\'bannerImage\',clear:true},\'حذف شد\')">بازگشت به عکس پیش‌فرض</button>':'')+'</div>';
h+='<div class="card"><div class="row sp"><h2>گزارش‌ها</h2><button class="d" onclick="act({action:\'clearLogs\'},\'پاک شد\')">پاک کردن</button></div>';
D.logs.slice().reverse().forEach(function(l){h+='<div class="log">'+new Date(l.t).toLocaleString('fa-IR')+'\n'+esc(l.m)+'</div>'});if(!D.logs.length)h+='<div class="log">گزارشی نیست.</div>';h+='</div>';
$('app').innerHTML=h}
function saveS(){act({action:'settings',settings:{intervalMin:+$('s1').value,bannerHours:+$('s2').value,maxMb:+$('s3').value,words:$('s4').value.split(/[,،]/).map(function(x){return x.trim()}).filter(Boolean),bannerText:$('s5').value,showAuthor:$('s6').checked}},'تنظیمات ذخیره شد')}
function upB(inp){var f=inp.files[0];if(!f)return;var im=new Image();im.onload=function(){var k=Math.min(1,720/im.width,1150/im.height),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);act({action:'bannerImage',b64:c.toDataURL('image/jpeg',.85).split(',')[1]},'عکس بنر ذخیره شد')};im.src=URL.createObjectURL(f)}
if(K)load().catch(function(e){toast(e.message)});else login();
</script></body></html>`;
