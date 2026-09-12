import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const jobsPath = root + 'jobs.json';
const profile = JSON.parse(await fs.readFile(root + 'profile.json', 'utf8'));
const previous = JSON.parse(await fs.readFile(jobsPath, 'utf8'));

const split = s => (s||'').split(',').map(x=>x.trim()).filter(Boolean);
const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const india = s => /india|bengaluru|bangalore|hyderabad|chennai|pune|gurgaon|gurugram|mumbai|noida|delhi|kochi|kolkata|ahmedabad|remote/.test(norm(s));
const skills = profile.skills.map(norm);
const roles = profile.roles.map(norm);
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0,16);

const ROLE_RULES = [
  ['Machine Learning Engineer', /machine learning|ml engineer|ml developer|ai engineer|applied ml/],
  ['Data Scientist', /data scientist|data science/],
  ['Data Engineer', /data engineer|data platform engineer|analytics engineer/],
  ['Backend Engineer', /backend engineer|back end engineer|backend developer|back end developer|server side engineer/],
  ['Full Stack Engineer', /full stack|fullstack/],
  ['Python Developer', /python developer|python engineer/],
  ['Software Engineer', /software engineer|software developer|sde\b|application engineer/]
];
const CITY_RULES = [
  ['Bengaluru', /bengaluru|bangalore/],
  ['Hyderabad', /hyderabad/],
  ['Chennai', /chennai/],
  ['Pune', /pune/],
  ['Gurgaon', /gurgaon|gurugram/],
  ['Mumbai', /mumbai/],
  ['Noida', /noida/],
  ['Delhi', /delhi/],
  ['Kolkata', /kolkata/],
  ['Kochi', /kochi/],
  ['Ahmedabad', /ahmedabad/],
  ['Remote India', /remote.*india|india.*remote|remote/]
];

function classifyRole(title, description='') {
  const t=norm(title);
  for (const [label,re] of ROLE_RULES) if(re.test(t)) return label;
  // Only use description as a fallback when the title is generic.
  const d=norm(description).slice(0,5000);
  if(/machine learning|ml engineer|ai engineer/.test(d)) return 'Machine Learning Engineer';
  if(/data scientist|data science/.test(d)) return 'Data Scientist';
  if(/data engineer|data platform/.test(d)) return 'Data Engineer';
  if(/backend|back end/.test(d)) return 'Backend Engineer';
  if(/full stack|fullstack/.test(d)) return 'Full Stack Engineer';
  if(/python developer|python engineer/.test(d)) return 'Python Developer';
  if(/software engineer|software developer/.test(d)) return 'Software Engineer';
  return null;
}
function classifyCity(location) {
  const l=norm(location);
  for (const [label,re] of CITY_RULES) if(re.test(l)) return label;
  return 'Other India';
}
function score(j) {
  const text=norm(`${j.title} ${j.description} ${j.location}`);
  let hits=skills.filter(s=>text.includes(s)).length;
  let role=roles.some(r=>text.includes(r));
  let n=Math.min(100, Math.round((hits/Math.max(5,Math.min(skills.length,12)))*80)+(role?20:0));
  return n;
}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'JobPulse/1.1'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}

function makeJob({title,company,location,applyUrl,source,publishedAt,description}) {
  const roleCategory=classifyRole(title,description);
  if(!roleCategory) return null; // role-specific feed: ignore jobs that don't fit the configured role categories
  const sc=score({title,description,location});
  return {id:hash(applyUrl),title,company,location,applyUrl,source,publishedAt:publishedAt||null,discoveredAt:publishedAt||new Date().toISOString(),score:sc,matchLevel:sc>=75?'Apply First':sc>=50?'Good Match':'Stretch',roleCategory,cityCategory:classifyCity(location),skills:profile.skills.filter(s=>norm(description).includes(norm(s))).slice(0,8)};
}

let out=[];
const ashby=split(process.env.ASHBY_BOARDS||'aiprise,ontic,sarvam');
for(const board of ashby){try{const d=await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);for(const j of (d.jobs||[])){const location=j.location||'';if(!india(location))continue;const applyUrl=j.applyUrl||j.jobUrl;if(!applyUrl)continue;const job=makeJob({title:j.title,company:j.companyName||board,location,applyUrl,source:'Ashby',publishedAt:j.publishedAt,description:j.descriptionHtml||j.description||''});if(job)out.push(job);}}catch(e){console.log('Ashby',board,e.message)}}

const gh=split(process.env.GREENHOUSE_BOARDS);
for(const board of gh){try{const d=await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);for(const j of (d.jobs||[])){const location=j.location?.name||'';if(!india(location))continue;const applyUrl=j.absolute_url;if(!applyUrl)continue;const job=makeJob({title:j.title,company:board,location,applyUrl,source:'Greenhouse',publishedAt:j.updated_at,description:j.content||''});if(job)out.push(job);}}catch(e){console.log('Greenhouse',board,e.message)}}

if(process.env.ADZUNA_APP_ID&&process.env.ADZUNA_APP_KEY){try{const url=`https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${encodeURIComponent(process.env.ADZUNA_APP_ID)}&app_key=${encodeURIComponent(process.env.ADZUNA_APP_KEY)}&results_per_page=50&content-type=application/json&where=India`;const d=await getJson(url);for(const j of (d.results||[])){const location=j.location?.display_name||'India';const applyUrl=j.redirect_url;if(!applyUrl)continue;const job=makeJob({title:j.title,company:j.company?.display_name||'Adzuna',location,applyUrl,source:'Adzuna',publishedAt:j.created,description:j.description||''});if(job)out.push(job);}}catch(e){console.log('Adzuna',e.message)}}

const map=new Map((previous.jobs||[]).map(j=>[j.id,j]));
for(const j of out){const old=map.get(j.id);if(old)j.discoveredAt=old.discoveredAt;map.set(j.id,j)}
const jobs=[...map.values()].sort((a,b)=>b.score-a.score || String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,500);
const newJobs=out.filter(j=>!(previous.jobs||[]).some(p=>p.id===j.id) && j.score>=50).sort((a,b)=>b.score-a.score);
await fs.writeFile(jobsPath,JSON.stringify({updatedAt:new Date().toISOString(),jobs},null,2));
console.log(`Collected ${out.length}; new matching ${newJobs.length}`);

function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
async function telegram(){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token||!newJobs.length){console.log('Telegram skipped');return;}
  const chatId=process.env.TELEGRAM_CHAT_ID||null;
  if(!chatId){console.log('Telegram skipped: TELEGRAM_CHAT_ID not set');return;}
  const top=newJobs.slice(0,10);
  const cityCounts=new Map(),roleCounts=new Map();
  for(const j of newJobs){cityCounts.set(j.cityCategory,(cityCounts.get(j.cityCategory)||0)+1);roleCounts.set(j.roleCategory,(roleCounts.get(j.roleCategory)||0)+1)}
  const citySummary=[...cityCounts].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${escapeHtml(k)}: ${v}`).join(' • ');
  const roleSummary=[...roleCounts].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${escapeHtml(k)}: ${v}`).join(' • ');
  const lines=top.map((j,i)=>`<b>${i+1}. ${escapeHtml(j.title)}</b>\n${escapeHtml(j.company)} • ${escapeHtml(j.cityCategory)} • ${escapeHtml(j.roleCategory)}\nMatch: ${j.score}%\n<a href="${escapeHtml(j.applyUrl)}">Apply Now</a>`).join('\n\n');
  const body=`🔔 <b>New jobs are available to apply!</b>\n\n<b>${newJobs.length}</b> new role-matched job(s).\n\n<b>By city:</b> ${citySummary}\n<b>By role:</b> ${roleSummary}\n\n${lines}`;
  const url=`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:body,parse_mode:'HTML',disable_web_page_preview:true})});
  console.log('Telegram',r.status,await r.text());
}
await telegram();
