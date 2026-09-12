import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const jobsPath = root + 'jobs.json';
const profile = JSON.parse(await fs.readFile(root + 'profile.json', 'utf8'));
let previous = { jobs: [] };
try { previous = JSON.parse(await fs.readFile(jobsPath, 'utf8')); } catch {}

const split = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const india = s => /india|bengaluru|bangalore|hyderabad|chennai|pune|gurgaon|gurugram|mumbai|noida|delhi|kochi|cochin|kolkata|calcutta|ahmedabad|remote/.test(norm(s));
const skills = profile.skills.map(norm);

// Early-career targeting: avoid senior/leadership roles unless explicitly junior/associate/apprentice.
const seniorTitle = /\b(senior|sr\.?|staff|principal|lead|manager|director|head|architect|vp|vice president)\b/i;
const earlyTitle = /\b(junior|jr\.?|associate|apprentice|graduate|entry[- ]level|trainee|new grad|fresher)\b/i;

const ROLE_RULES = [
  ['Machine Learning Engineer', /machine learning|ml engineer|ml developer|ai engineer|applied ml|machine learning developer/],
  ['Data Scientist', /data scientist|data science|applied scientist/],
  ['Data Engineer', /data engineer|data platform engineer|analytics engineer|big data engineer/],
  ['Backend Engineer', /backend engineer|back end engineer|backend developer|back end developer|server side engineer/],
  ['Full Stack Engineer', /full stack|fullstack/],
  ['Python Developer', /python developer|python engineer/],
  ['Software Engineer', /software engineer|software developer|software development engineer|sde\b|application engineer/]
];

const CITY_RULES = [
  ['Bengaluru', /bengaluru|bangalore/],
  ['Hyderabad', /hyderabad/],
  ['Chennai', /chennai/],
  ['Pune', /pune/],
  ['Gurgaon', /gurgaon|gurugram/],
  ['Mumbai', /mumbai/],
  ['Noida', /noida/],
  ['Delhi', /new delhi|delhi/],
  ['Kolkata', /kolkata|calcutta/],
  ['Kochi', /kochi|cochin/],
  ['Ahmedabad', /ahmedabad/],
  ['Remote India', /remote.*india|india.*remote|remote/]
];

function classifyRole(title, description = '') {
  const t = norm(title);
  for (const [label, re] of ROLE_RULES) if (re.test(t)) return label;
  const d = norm(description).slice(0, 7000);
  for (const [label, re] of ROLE_RULES) if (re.test(d)) return label;
  return null;
}
function classifyCity(location) {
  const l = norm(location);
  for (const [label, re] of CITY_RULES) if (re.test(l)) return label;
  return 'Other India';
}
function score(j) {
  const text = norm(`${j.title} ${j.description} ${j.location}`);
  const hits = skills.filter(s => s && text.includes(s)).length;
  const roleHit = profile.roles.some(r => text.includes(norm(r)));
  const early = earlyTitle.test(j.title);
  let n = Math.min(100, Math.round((hits / Math.max(6, Math.min(skills.length, 14))) * 75) + (roleHit ? 20 : 0) + (early ? 5 : 0));
  return n;
}
async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'JobPulse-India/2.0' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
function shouldKeep(title, location, description = '') {
  if (!india(location)) return false;
  const role = classifyRole(title, description);
  if (!role) return false;
  if (seniorTitle.test(title) && !earlyTitle.test(title)) return false;
  return true;
}
function makeJob({ title, company, location, applyUrl, source, publishedAt, description }) {
  if (!applyUrl || !shouldKeep(title, location, description)) return null;
  const roleCategory = classifyRole(title, description);
  const cityCategory = classifyCity(location);
  const sc = score({ title, description, location });
  return {
    id: hash(applyUrl), title, company, location, applyUrl, source,
    publishedAt: publishedAt || null,
    discoveredAt: publishedAt || new Date().toISOString(),
    score: sc,
    matchLevel: sc >= 75 ? 'Apply First' : sc >= 50 ? 'Good Match' : 'Stretch',
    roleCategory, cityCategory,
    skills: profile.skills.filter(s => norm(description).includes(norm(s))).slice(0, 8)
  };
}

const out = [];
const seen = new Set();
const add = job => { if (job && !seen.has(job.id)) { seen.add(job.id); out.push(job); } };

// Ashby public boards. This list includes India-focused/current boards we have verified as using Ashby.
const defaultAshby = 'aiprise,ontic,sarvam,ema,granica,bolna,altimate,CUBE,gainsight,spoton,Wisdom-AI';
const ashby = split(process.env.ASHBY_BOARDS || defaultAshby);
for (const board of ashby) {
  try {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
    for (const j of (d.jobs || [])) {
      const location = j.location || '';
      add(makeJob({ title: j.title, company: j.companyName || board, location, applyUrl: j.applyUrl || j.jobUrl, source: 'Ashby', publishedAt: j.publishedAt, description: j.descriptionHtml || j.description || '' }));
    }
  } catch (e) { console.log('Ashby', board, e.message); }
}

// Lever public postings. Configure company site names through LEVER_SITES.
const defaultLever = 'acceldata,saviynt,neuron7,bazaarvoice,100ms,Zadara,safe';
const lever = split(process.env.LEVER_SITES || defaultLever);
for (const site of lever) {
  try {
    const d = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
    for (const j of (d || [])) {
      const location = j.categories?.location || (j.categories?.allLocations || []).join(', ') || '';
      add(makeJob({ title: j.text, company: site, location, applyUrl: j.hostedUrl || j.applyUrl, source: 'Lever', publishedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null, description: j.descriptionPlain || j.description || '' }));
    }
  } catch (e) { console.log('Lever', site, e.message); }
}

// Greenhouse public boards. Configure board tokens through GREENHOUSE_BOARDS.
const gh = split(process.env.GREENHOUSE_BOARDS);
for (const board of gh) {
  try {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
    for (const j of (d.jobs || [])) {
      const location = j.location?.name || '';
      add(makeJob({ title: j.title, company: board, location, applyUrl: j.absolute_url, source: 'Greenhouse', publishedAt: j.updated_at, description: j.content || '' }));
    }
  } catch (e) { console.log('Greenhouse', board, e.message); }
}

// Adzuna is the broad cross-company source. It requires ADZUNA_APP_ID/ADZUNA_APP_KEY.
// Multiple role/city queries improve coverage while the collector still deduplicates listings.
if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
  const queries = [
    'software engineer', 'backend engineer', 'python developer',
    'data engineer', 'machine learning engineer', 'data scientist', 'full stack engineer'
  ];
  const places = ['Hyderabad', 'Bengaluru', 'Chennai', 'Pune', 'Gurgaon', 'Mumbai', 'Noida', 'Delhi', 'Kolkata', 'Kochi', 'Ahmedabad'];
  for (const what of queries) {
    for (const where of places) {
      try {
        const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${encodeURIComponent(process.env.ADZUNA_APP_ID)}&app_key=${encodeURIComponent(process.env.ADZUNA_APP_KEY)}&results_per_page=20&content-type=application/json&what=${encodeURIComponent(what)}&where=${encodeURIComponent(where)}`;
        const d = await getJson(url);
        for (const j of (d.results || [])) {
          const location = j.location?.display_name || where;
          add(makeJob({ title: j.title, company: j.company?.display_name || 'Adzuna listing', location, applyUrl: j.redirect_url, source: 'Adzuna', publishedAt: j.created, description: j.description || '' }));
        }
      } catch (e) { console.log('Adzuna', what, where, e.message); }
    }
  }
}

const previousJobs = previous.jobs || [];
const previousIds = new Set(previousJobs.map(j => j.id));
const map = new Map(previousJobs.map(j => [j.id, j]));
for (const j of out) {
  const old = map.get(j.id);
  if (old) j.discoveredAt = old.discoveredAt;
  map.set(j.id, j);
}
const jobs = [...map.values()]
  .sort((a, b) => b.score - a.score || String(b.publishedAt).localeCompare(String(a.publishedAt)))
  .slice(0, 1000);

const newJobs = out.filter(j => !previousIds.has(j.id) && j.score >= 50).sort((a, b) => b.score - a.score);
await fs.writeFile(jobsPath, JSON.stringify({ updatedAt: new Date().toISOString(), jobs }, null, 2));
console.log(`Collected ${out.length} unique matching jobs; ${newJobs.length} new alert-worthy jobs.`);

async function telegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || !newJobs.length) { console.log('Telegram skipped'); return; }
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const top = newJobs.slice(0, 10);
  const cityCounts = new Map(), roleCounts = new Map();
  for (const j of newJobs) {
    cityCounts.set(j.cityCategory, (cityCounts.get(j.cityCategory) || 0) + 1);
    roleCounts.set(j.roleCategory, (roleCounts.get(j.roleCategory) || 0) + 1);
  }
  const summary = m => [...m].sort((a,b) => b[1]-a[1]).map(([k,v]) => `${esc(k)}: ${v}`).join(' • ');
  const lines = top.map((j,i) => `<b>${i+1}. ${esc(j.title)}</b>\n${esc(j.company)} • ${esc(j.cityCategory)} • ${esc(j.roleCategory)}\nMatch: ${j.score}%\n<a href="${esc(j.applyUrl)}">Apply Now</a>`).join('\n\n');
  const body = `🔔 <b>New jobs are available to apply!</b>\n\n<b>${newJobs.length}</b> new role-matched job(s).\n\n<b>By city:</b> ${summary(cityCounts)}\n<b>By role:</b> ${summary(roleCounts)}\n\n${lines}`;
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
  const r = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: chatId, text: body, parse_mode:'HTML', disable_web_page_preview:true }) });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
  console.log('Telegram alert sent.');
}
await telegram();
