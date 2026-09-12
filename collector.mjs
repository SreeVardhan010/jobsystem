import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const jobsPath = root + 'jobs.json';
const profile = JSON.parse(await fs.readFile(root + 'profile.json', 'utf8'));
const previous = JSON.parse(await fs.readFile(jobsPath, 'utf8'));

const split = s => (s||'').split(',').map(x=>x.trim()).filter(Boolean);
const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const india = s => /india|bengaluru|bangalore|hyderabad|chennai|pune|gurgaon|gurugram|mumbai|noida|delhi|kochi|kolkata|ahmedabad/.test(norm(s));
const skills = profile.skills.map(norm);
const roles = profile.roles.map(norm);
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0,16);
const score = j => {
  const text=norm(`${j.title} ${j.description} ${j.location}`);
  let hits=skills.filter(s=>text.includes(s)).length;
  let role=roles.some(r=>text.includes(r));
  let n=Math.min(100, Math.round((hits/Math.max(5,Math.min(skills.length,12)))*80)+(role?20:0));
  return n;
};
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'JobPulse/1.0'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
let out=[];
const ashby=split(process.env.ASHBY_BOARDS||'aiprise,ontic,sarvam');
for(const board of ashby){try{const d=await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);for(const j of (d.jobs||[])){const location=j.location||'';if(!india(location))continue;const applyUrl=j.applyUrl||j.jobUrl;if(!applyUrl)continue;const sc=score({title:j.title,description:j.descriptionHtml||j.description||'',location});out.push({id:hash(applyUrl),title:j.title,company:j.companyName||board,location,applyUrl,source:'Ashby',publishedAt:j.publishedAt||null,discoveredAt:j.publishedAt||new Date().toISOString(),score:sc,matchLevel:sc>=75?'Apply First':sc>=50?'Good Match':'Stretch',skills:profile.skills.filter(s=>norm((j.descriptionHtml||j.description||'')).includes(norm(s))).slice(0,8)});}}catch(e){console.log('Ashby',board,e.message)}}
const gh=split(process.env.GREENHOUSE_BOARDS);
for(const board of gh){try{const d=await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);for(const j of (d.jobs||[])){const location=j.location?.name||'';if(!india(location))continue;const applyUrl=j.absolute_url;if(!applyUrl)continue;const sc=score({title:j.title,description:j.content||'',location});out.push({id:hash(applyUrl),title:j.title,company:board,location,applyUrl,source:'Greenhouse',publishedAt:j.updated_at||null,discoveredAt:j.updated_at||new Date().toISOString(),score:sc,matchLevel:sc>=75?'Apply First':sc>=50?'Good Match':'Stretch',skills:profile.skills.filter(s=>norm(j.content||'').includes(norm(s))).slice(0,8)});}}catch(e){console.log('Greenhouse',board,e.message)}}
if(process.env.ADZUNA_APP_ID&&process.env.ADZUNA_APP_KEY){try{const url=`https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${encodeURIComponent(process.env.ADZUNA_APP_ID)}&app_key=${encodeURIComponent(process.env.ADZUNA_APP_KEY)}&results_per_page=50&content-type=application/json&where=India`;const d=await getJson(url);for(const j of (d.results||[])){const location=j.location?.display_name||'India';const applyUrl=j.redirect_url;if(!applyUrl)continue;const sc=score({title:j.title,description:j.description||'',location});out.push({id:hash(applyUrl),title:j.title,company:j.company?.display_name||'Adzuna',location,applyUrl,source:'Adzuna',publishedAt:j.created||null,discoveredAt:j.created||new Date().toISOString(),score:sc,matchLevel:sc>=75?'Apply First':sc>=50?'Good Match':'Stretch',skills:profile.skills.filter(s=>norm(j.description||'').includes(norm(s))).slice(0,8)});}}catch(e){console.log('Adzuna',e.message)}}
const map=new Map((previous.jobs||[]).map(j=>[j.id,j]));for(const j of out){const old=map.get(j.id);if(old)j.discoveredAt=old.discoveredAt;map.set(j.id,j)}
const jobs=[...map.values()].sort((a,b)=>b.score-a.score || String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,500);
const newJobs=out.filter(j=>!previous.jobs?.some(p=>p.id===j.id) && j.score>=50).sort((a,b)=>b.score-a.score);
await fs.writeFile(jobsPath,JSON.stringify({updatedAt:new Date().toISOString(),jobs},null,2));
console.log(`Collected ${out.length}; new matching ${newJobs.length}`);

async function telegram(){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token||!newJobs.length){console.log('Telegram skipped');return;}

  // Prefer an explicitly configured private chat ID. If it is not set,
  // fall back to the latest private chat that has messaged the bot.
  let chatId=process.env.TELEGRAM_CHAT_ID||null;
  if(!chatId){
    let updates=[];
    try {
      const u=await getJson(`https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates?limit=100&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`);
      updates=u.result||[];
    } catch(e){ console.log('Telegram getUpdates',e.message); return; }
    const privateUpdates=updates.filter(x=>x.message?.chat?.type==='private' && x.message?.chat?.id);
    chatId=privateUpdates.length ? privateUpdates[privateUpdates.length-1].message.chat.id : null;
  }
  if(!chatId){console.log('Telegram skipped: no chat ID. Set TELEGRAM_CHAT_ID or send /start to the bot.');return;}

  const top=newJobs.slice(0,8);
  const lines=top.map((j,i)=>`<b>${i+1}. ${escapeHtml(j.title)}</b>
${escapeHtml(j.company)} • ${escapeHtml(j.location)} • Match ${j.score}%
<a href="${j.applyUrl}">Apply Now</a>`).join('\n\n');
  const body=`🔔 <b>New jobs are available to apply!</b>\n\n<b>${newJobs.length}</b> new matching job(s) found.\n\n${lines}`;
  const url=`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:body,parse_mode:'HTML',disable_web_page_preview:true})});
  console.log('Telegram',r.status,await r.text());
}
function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}
await telegram();
