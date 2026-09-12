import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url).pathname;
const jobsPath = root + 'jobs.json';
const profile = JSON.parse(await fs.readFile(root + 'profile.json', 'utf8'));
const previous = JSON.parse(await fs.readFile(jobsPath, 'utf8'));

const split = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const india = s => /india|bengaluru|bangalore|hyderabad|chennai|pune|gurgaon|gurugram|mumbai|noida|delhi|kochi|kolkata|ahmedabad|remote/.test(norm(s));
const skills = profile.skills.map(norm);
const roleGroups = Object.entries(profile.targetRoles).map(([category, roles]) => ({ category, roles: roles.map(norm) }));
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const fresherSignals = [
  'fresher', 'freshers', 'new grad', 'new graduate', 'graduate', 'graduates',
  'entry level', 'entry-level', '0 1 year', '0-1 year', '0 to 1 year',
  '0 2 years', '0-2 years', '0 to 2 years', 'associate', 'trainee',
  'campus', 'college graduate', 'university graduate', '2026 batch', '2026 graduate',
  '2026 graduates', '2025 2026', '2026 2027'
].map(norm);
const internshipSignals = ['intern', 'internship', 'summer intern', 'student intern'].map(norm);
const seniorSignals = [
  '2+ years', '3+ years', '4+ years', '5+ years', '6+ years', '7+ years',
  '2 years of experience', '3 years of experience', '4 years of experience',
  '5 years of experience', 'senior', 'sr.', 'lead', 'principal', 'manager', 'architect', 'staff engineer'
].map(norm);

function experienceFit(title, description = '') {
  const text = norm(`${title} ${description}`);
  const hasSenior = seniorSignals.some(s => text.includes(s));
  const hasFresher = fresherSignals.some(s => text.includes(s));
  const isInternship = internshipSignals.some(s => text.includes(s));
  if (isInternship) return { eligible: false, reason: 'internship' };
  if (hasSenior) return { eligible: false, reason: 'experienced-role' };
  return { eligible: true, fresherSignal: hasFresher };
}

function classifyRole(title, description = '') {
  const text = norm(`${title} ${description}`);
  let best = null;
  for (const group of roleGroups) {
    const hits = group.roles.filter(r => text.includes(r));
    if (hits.length && (!best || hits.length > best.hits.length)) best = { category: group.category, hits };
  }
  return best;
}

function scoreJob(j) {
  const text = norm(`${j.title} ${j.description} ${j.location}`);
  const role = classifyRole(j.title, j.description);
  if (!role) return { score: 0, category: null };
  const skillHits = skills.filter(s => text.includes(s));
  let score = Math.min(60, skillHits.length * 8);
  score += Math.min(25, role.hits.length * 12);
  const exp = experienceFit(j.title, j.description);
  score += exp.fresherSignal ? 15 : 5;
  return {
    score: Math.min(100, Math.round(score)),
    category: role.category,
    skills: skillHits.slice(0, 8),
    fresherSignal: Boolean(exp.fresherSignal)
  };
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'JobPulse/3.0 (2026 fresher job matching)' }
    });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const out = [];
const errors = [];

function addJob({ title, company, location, applyUrl, source, description, publishedAt }) {
  if (!title || !applyUrl || !india(location)) return;
  const exp = experienceFit(title, description);
  if (!exp.eligible) return;
  const fit = scoreJob({ title, description, location });
  if (!fit.category || fit.score < 35) return;
  out.push({
    id: hash(applyUrl), title, company: company || 'Unknown company', location,
    applyUrl, source, category: fit.category, publishedAt: publishedAt || null,
    discoveredAt: publishedAt || new Date().toISOString(), score: fit.score,
    matchLevel: fit.score >= 75 ? 'Apply First' : fit.score >= 55 ? 'Good Match' : 'Possible Match',
    fresherFit: exp.fresherSignal ? 'Explicit fresher/graduate signal' : 'No experience requirement detected',
    batchFit: profile.graduationBatch, skills: fit.skills
  });
}

const ashby = split(process.env.ASHBY_BOARDS || 'aiprise,ontic,sarvam');
for (const board of ashby) {
  try {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
    for (const j of (d.jobs || [])) addJob({
      title: j.title, company: j.companyName || board, location: j.location || '',
      applyUrl: j.applyUrl || j.jobUrl, source: 'Ashby',
      description: j.descriptionHtml || j.description || '', publishedAt: j.publishedAt || null
    });
  } catch (e) {
    errors.push(`Ashby ${board}: ${e.message}`);
    console.log(`Ashby ${board}: ${e.message}`);
  }
}

const gh = split(process.env.GREENHOUSE_BOARDS);
for (const board of gh) {
  try {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
    for (const j of (d.jobs || [])) addJob({
      title: j.title, company: board, location: j.location?.name || '',
      applyUrl: j.absolute_url, source: 'Greenhouse', description: j.content || '',
      publishedAt: j.updated_at || null
    });
  } catch (e) {
    errors.push(`Greenhouse ${board}: ${e.message}`);
    console.log(`Greenhouse ${board}: ${e.message}`);
  }
}

if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
  const searches = [
    'data analyst fresher', 'data engineer fresher', 'data scientist fresher',
    'software engineer fresher', 'software developer fresher', 'python developer fresher',
    'machine learning engineer fresher'
  ];
  for (const what of searches) {
    try {
      const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${encodeURIComponent(process.env.ADZUNA_APP_ID)}&app_key=${encodeURIComponent(process.env.ADZUNA_APP_KEY)}&results_per_page=50&content-type=application/json&where=India&what=${encodeURIComponent(what)}`;
      const d = await getJson(url);
      for (const j of (d.results || [])) addJob({
        title: j.title, company: j.company?.display_name || 'Adzuna',
        location: j.location?.display_name || 'India', applyUrl: j.redirect_url,
        source: 'Adzuna', description: j.description || '', publishedAt: j.created || null
      });
    } catch (e) {
      errors.push(`Adzuna ${what}: ${e.message}`);
      console.log(`Adzuna ${what}: ${e.message}`);
    }
  }
}

const unique = new Map();
for (const j of out) {
  if (!unique.has(j.id) || j.score > unique.get(j.id).score) unique.set(j.id, j);
}

const previousJobs = previous.jobs || [];
const previousMap = new Map(previousJobs.map(j => [j.id, j]));
for (const j of unique.values()) {
  const old = previousMap.get(j.id);
  if (old) j.discoveredAt = old.discoveredAt;
}

// If every live source failed or returned nothing, preserve the previous data
// instead of replacing a working dashboard with an empty list.
if (unique.size === 0 && previousJobs.length > 0) {
  console.log(`No live jobs collected. Preserving ${previousJobs.length} existing jobs.`);
  if (errors.length) console.log(`Sources with errors: ${errors.length}`);
  process.exit(0);
}

const jobs = [...unique.values()]
  .sort((a, b) => b.score - a.score || String(b.publishedAt).localeCompare(String(a.publishedAt)))
  .slice(0, 500);

const counts = {};
for (const j of jobs) counts[j.category] = (counts[j.category] || 0) + 1;

await fs.writeFile(jobsPath, JSON.stringify({
  updatedAt: new Date().toISOString(),
  filters: {
    graduationBatch: profile.graduationBatch,
    experienceLevel: profile.experienceLevel,
    targetCategories: roleGroups.map(x => x.category),
    excluded: ['internships', 'senior/experienced roles']
  },
  counts,
  jobs
}, null, 2));

console.log(`Collected ${jobs.length} fresher-fit jobs.`);
console.log('By category:', JSON.stringify(counts));
if (errors.length) console.log(`Sources with errors: ${errors.length}`);
