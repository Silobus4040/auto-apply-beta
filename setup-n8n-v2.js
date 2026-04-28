const N8N = 'http://187.124.215.235:5678';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMmFhYThiYmQtNDU1NS00ZDMwLWJjNTctNDJmNDViYWMxN2I1IiwiaWF0IjoxNzc2OTc1ODUzfQ.uY5ppSZoZRuP9_tqaspPQDb1-mSsnWzI_oagLSO8Hu4';
const SB_URL = 'https://ahpvdcdpwtdeoiatjvnq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocHZkY2Rwd3RkZW9pYXRqdm5xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3OTM5OCwiZXhwIjoyMDkyMzU1Mzk4fQ.psUKRCmZO7hLNSvV_DFBn9YepGGaVtpthwJjSQH-y9E';
const OR_KEY = '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';

const h = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

const SYSTEM_PROMPT = `You are an expert ATS resume analyst for US remote jobs.

Analyze the following resume text and return a JSON object with:
1. overall_score: A score from 0-100 (weighted across 7 categories)
2. grade: Letter grade (A+ to F)
3. categories: An object with these 7 keys, each having score, max, and verdict fields:
   - ats_compatibility (max 20): Check for tables, graphics, headers/footers, text boxes, fancy columns that break ATS parsers. Two-column Canva templates are the number one killer. Single-column layout is required. Standard fonts (Calibri, Arial, Georgia). No images, logos, or headshots. No skill bars or visual rating meters.
   - keyword_density (max 20): Does it contain industry-standard keywords for remote jobs? Look for terms like cross-functional, stakeholder management, async communication, remote-first, Slack, Jira, Python, etc relevant to the job titles.
   - quantified_achievements (max 15): Does every bullet point have a measurable number? "Increased revenue by 40%" beats "Helped grow revenue". Count how many bullets have numbers vs total.
   - format_structure (max 15): Clear sections in order: Contact, Summary, Experience, Skills, Education. Standard section headings (not creative names like "My Journey"). Consistent date format like "Jan 2022 - Mar 2024".
   - contact_remote_readiness (max 10): LinkedIn URL present. GitHub for tech roles. Professional email. No full street address (privacy for remote). Time zone mention is a bonus.
   - summary_objective (max 10): Is there a 2-3 line punchy summary at the top a recruiter can read in 6 seconds and understand who you are and your value?
   - readability (max 10): 1 page for under 5 years experience. Max 2 pages. No walls of text. Bullet points not paragraphs. Clean formatting implied.
4. critical_issues: Array of max 5 specific issues found
5. strengths: Array of max 3 things done well
6. top_recommendation: Single most impactful action the user should take immediately

Return ONLY valid JSON. No explanation outside the JSON block.`;

const scoreCode = `
const resumeText = $input.first().json.resume_text;
const leadData = {
  lead_id: $input.first().json.lead_id,
  name: $input.first().json.name,
  email: $input.first().json.email,
  job_titles: $input.first().json.job_titles
};

const systemPrompt = ${JSON.stringify(SYSTEM_PROMPT)};

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
      { role: 'user', content: 'Score this resume for remote US job applications:\\n\\n' + resumeText }
    ]
  })
});

const data = await response.json();
const score = JSON.parse(data.choices[0].message.content);

return [{
  json: {
    id: leadData.lead_id,
    resume_score: score.overall_score,
    score_details: score
  }
}];
`;

async function main() {
  // 1. Delete old workflow
  console.log('Deleting old workflow...');
  await fetch(`${N8N}/api/v1/workflows/0sSxjzx2kE3ArJsP`, { method: 'DELETE', headers: h });

  // 2. Create Supabase credential
  console.log('Creating Supabase credential...');
  const credRes = await fetch(`${N8N}/api/v1/credentials`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      name: "Supabase - AutoApply",
      type: "supabaseApi",
      data: { host: SB_URL, serviceRole: SB_KEY }
    })
  });
  const cred = await credRes.json();
  console.log('Credential ID:', cred.id);

  // 3. Create workflow
  const workflow = {
    name: "AutoApply - Lead Intake & Resume Scorer",
    nodes: [
      {
        name: "New Lead Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [250, 300],
        parameters: { httpMethod: "POST", path: "new-lead", responseMode: "onReceived", options: {} }
      },
      {
        name: "Extract Lead Data",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [480, 300],
        parameters: {
          jsCode: "const body = $input.first().json;\nconst record = body.record || body;\nreturn [{\n  json: {\n    lead_id: record.id || 'unknown',\n    name: record.name || '',\n    email: record.email || '',\n    linkedin: record.linkedin || '',\n    job_titles: record.job_titles || '',\n    resume_url: record.resume_url || '',\n    accepted_pricing: record.accepted_pricing || false\n  }\n}];"
        }
      },
      {
        name: "Download Resume PDF",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [710, 300],
        parameters: {
          method: "GET",
          url: "={{ $json.resume_url }}",
          options: { response: { response: { responseFormat: "file" } } }
        }
      },
      {
        name: "Extract PDF Text",
        type: "n8n-nodes-base.extractFromFile",
        typeVersion: 1,
        position: [940, 300],
        parameters: { operation: "pdf", options: {} }
      },
      {
        name: "Merge Lead + Text",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1170, 300],
        parameters: {
          jsCode: "const pdfText = $input.first().json.text || $input.first().json.content || JSON.stringify($input.first().json);\nconst leadData = $('Extract Lead Data').first().json;\nreturn [{\n  json: {\n    ...leadData,\n    resume_text: pdfText.substring(0, 8000)\n  }\n}];"
        }
      },
      {
        name: "Score Resume via OpenRouter",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1400, 300],
        parameters: { jsCode: scoreCode }
      },
      {
        name: "Save Score to Supabase",
        type: "n8n-nodes-base.supabase",
        typeVersion: 1,
        position: [1630, 300],
        parameters: {
          operation: "update",
          tableId: "beta_leads",
          matchingColumns: ["id"]
        },
        credentials: {
          supabaseApi: { id: String(cred.id), name: "Supabase - AutoApply" }
        }
      }
    ],
    connections: {
      "New Lead Webhook": { main: [[{ node: "Extract Lead Data", type: "main", index: 0 }]] },
      "Extract Lead Data": { main: [[{ node: "Download Resume PDF", type: "main", index: 0 }]] },
      "Download Resume PDF": { main: [[{ node: "Extract PDF Text", type: "main", index: 0 }]] },
      "Extract PDF Text": { main: [[{ node: "Merge Lead + Text", type: "main", index: 0 }]] },
      "Merge Lead + Text": { main: [[{ node: "Score Resume via OpenRouter", type: "main", index: 0 }]] },
      "Score Resume via OpenRouter": { main: [[{ node: "Save Score to Supabase", type: "main", index: 0 }]] }
    },
    settings: { executionOrder: "v1" }
  };

  console.log('Creating workflow...');
  const wfRes = await fetch(`${N8N}/api/v1/workflows`, {
    method: 'POST', headers: h, body: JSON.stringify(workflow)
  });
  const wf = await wfRes.json();
  console.log('Workflow created! ID:', wf.id);

  // 4. Activate
  const actRes = await fetch(`${N8N}/api/v1/workflows/${wf.id}`, {
    method: 'PATCH', headers: h, body: JSON.stringify({ active: true })
  });
  const act = await actRes.json();
  console.log('Activated:', act.active);
  console.log('\nWebhook URL:', `${N8N}/webhook/new-lead`);
}

main().catch(e => console.error('Error:', e.message));
