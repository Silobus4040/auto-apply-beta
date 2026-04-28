const N8N = 'http://187.124.215.235:5678';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMmFhYThiYmQtNDU1NS00ZDMwLWJjNTctNDJmNDViYWMxN2I1IiwiaWF0IjoxNzc2OTc1ODUzfQ.uY5ppSZoZRuP9_tqaspPQDb1-mSsnWzI_oagLSO8Hu4';
const h = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

const SB_URL = 'https://ahpvdcdpwtdeoiatjvnq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocHZkY2Rwd3RkZW9pYXRqdm5xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3OTM5OCwiZXhwIjoyMDkyMzU1Mzk4fQ.psUKRCmZO7hLNSvV_DFBn9YepGGaVtpthwJjSQH-y9E';
const OR_KEY = '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';

// Node 1: Fetch unscored leads from Supabase
const fetchLeadsCode = `
const response = await fetch('${SB_URL}/rest/v1/beta_leads?resume_score=is.null&select=*&limit=5', {
  headers: {
    'apikey': '${SB_KEY}',
    'Authorization': 'Bearer ${SB_KEY}'
  }
});
const leads = await response.json();
if (!leads || leads.length === 0) return [];
return leads.map(lead => ({ json: lead }));
`;

// Node 2: Download + extract PDF text
const downloadAndExtractCode = `
const lead = $input.first().json;
const pdfUrl = lead.resume_url;
if (!pdfUrl) return [{ json: { ...lead, resume_text: 'No resume uploaded' } }];

try {
  const res = await fetch(pdfUrl);
  const buffer = await res.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < uint8.length; i++) {
    if (uint8[i] >= 32 && uint8[i] <= 126) text += String.fromCharCode(uint8[i]);
    else if (uint8[i] === 10 || uint8[i] === 13) text += '\\n';
    else text += ' ';
  }
  // Clean up the extracted text
  text = text.replace(/\\s+/g, ' ').substring(0, 8000);
  return [{ json: { ...lead, resume_text: text } }];
} catch(e) {
  return [{ json: { ...lead, resume_text: 'Error reading PDF: ' + e.message } }];
}
`;

// Node 3: Score via OpenRouter GPT-4o
const scoreCode = `
const lead = $input.first().json;
const resumeText = lead.resume_text;

const systemPrompt = \`You are an expert ATS resume analyst for US remote jobs.

Analyze the following resume text and return a JSON object with:
1. overall_score: A score from 0-100 (weighted across 7 categories)
2. grade: Letter grade (A+ to F)
3. categories: An object with these 7 keys, each having score, max, and verdict fields:
   - ats_compatibility (max 20): Check for tables, graphics, headers/footers, text boxes, fancy columns that break ATS parsers. Two-column Canva templates are the number one killer. Single-column layout is required. Standard fonts (Calibri, Arial, Georgia). No images, logos, or headshots. No skill bars or visual rating meters.
   - keyword_density (max 20): Does it contain industry-standard keywords for remote jobs? Look for terms like cross-functional, stakeholder management, async communication, remote-first, Slack, Jira, Python, etc relevant to the job titles.
   - quantified_achievements (max 15): Does every bullet point have a measurable number? Increased revenue by 40 percent beats Helped grow revenue. Count how many bullets have numbers vs total.
   - format_structure (max 15): Clear sections in order: Contact, Summary, Experience, Skills, Education. Standard headings, not creative names like My Journey. Consistent date format.
   - contact_remote_readiness (max 10): LinkedIn URL present. GitHub for tech roles. Professional email. No full street address. Time zone mention is a bonus.
   - summary_objective (max 10): Is there a 2-3 line punchy summary at the top a recruiter can read in 6 seconds and understand who you are?
   - readability (max 10): 1 page for under 5 years experience. Max 2 pages. No walls of text. Bullet points not paragraphs.
4. critical_issues: Array of max 5 specific issues found
5. strengths: Array of max 3 things done well
6. top_recommendation: Single most impactful action the user should take immediately

Return ONLY valid JSON.\`;

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${OR_KEY}',
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://jobs.leadscompass.ai',
    'X-Title': 'AutoApply Resume Scorer'
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Score this resume for remote US job applications. The applicant is targeting these roles: ' + (lead.job_titles || 'General') + '\\n\\nResume text:\\n' + resumeText }
    ]
  })
});

const data = await response.json();
if (!data.choices || !data.choices[0]) {
  throw new Error('OpenRouter returned: ' + JSON.stringify(data));
}
const score = JSON.parse(data.choices[0].message.content);

return [{
  json: {
    id: lead.id,
    resume_score: score.overall_score,
    score_details: JSON.stringify(score)
  }
}];
`;

// Node 4: Update Supabase with score
const updateCode = `
const item = $input.first().json;
const response = await fetch('${SB_URL}/rest/v1/beta_leads?id=eq.' + item.id, {
  method: 'PATCH',
  headers: {
    'apikey': '${SB_KEY}',
    'Authorization': 'Bearer ${SB_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({
    resume_score: item.resume_score,
    score_details: JSON.parse(item.score_details)
  })
});
return [{ json: { success: true, id: item.id, score: item.resume_score } }];
`;

const workflow = {
  name: "AutoApply - Resume Scorer v3",
  nodes: [
    {
      name: "Check Every Minute",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [250, 300],
      parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 1 }] } }
    },
    {
      name: "Fetch Unscored Leads",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
      parameters: { jsCode: fetchLeadsCode }
    },
    {
      name: "Download Resume",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [710, 300],
      parameters: { jsCode: downloadAndExtractCode }
    },
    {
      name: "Score Resume via GPT-4o",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [940, 300],
      parameters: { jsCode: scoreCode }
    },
    {
      name: "Save Score to Supabase",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1170, 300],
      parameters: { jsCode: updateCode }
    }
  ],
  connections: {
    "Check Every Minute": { main: [[{ node: "Fetch Unscored Leads", type: "main", index: 0 }]] },
    "Fetch Unscored Leads": { main: [[{ node: "Download Resume", type: "main", index: 0 }]] },
    "Download Resume": { main: [[{ node: "Score Resume via GPT-4o", type: "main", index: 0 }]] },
    "Score Resume via GPT-4o": { main: [[{ node: "Save Score to Supabase", type: "main", index: 0 }]] }
  },
  settings: { executionOrder: "v1" }
};

async function main() {
  // 1. Delete old broken workflow
  console.log('Deleting old workflow...');
  await fetch(`${N8N}/api/v1/workflows/RISs560zN7dW59yX`, { method: 'DELETE', headers: h });

  // 2. Create new workflow
  console.log('Creating v3 workflow...');
  const res = await fetch(`${N8N}/api/v1/workflows`, {
    method: 'POST', headers: h, body: JSON.stringify(workflow)
  });
  const wf = await res.json();
  if (wf.id) {
    console.log('✅ Workflow created! ID:', wf.id);

    // 3. Activate
    const actRes = await fetch(`${N8N}/api/v1/workflows/${wf.id}/activate`, {
      method: 'POST', headers: h
    });
    console.log('✅ Activation response:', actRes.status);
    console.log('');
    console.log('This workflow runs EVERY MINUTE automatically.');
    console.log('It checks Supabase for leads without a score and processes them.');
    console.log('No webhook needed. No CORS issues. Fully automatic.');
  } else {
    console.log('Error creating workflow:', JSON.stringify(wf));
  }
}

main().catch(e => console.error('Error:', e.message));
