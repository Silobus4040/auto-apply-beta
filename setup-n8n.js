const N8N_URL = 'http://187.124.215.235:5678';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMmFhYThiYmQtNDU1NS00ZDMwLWJjNTctNDJmNDViYWMxN2I1IiwiaWF0IjoxNzc2OTc1ODUzfQ.uY5ppSZoZRuP9_tqaspPQDb1-mSsnWzI_oagLSO8Hu4';

const SUPABASE_URL = 'https://ahpvdcdpwtdeoiatjvnq.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocHZkY2Rwd3RkZW9pYXRqdm5xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3OTM5OCwiZXhwIjoyMDkyMzU1Mzk4fQ.psUKRCmZO7hLNSvV_DFBn9YepGGaVtpthwJjSQH-y9E';

const workflow = {
  name: "AutoApply - Lead Intake & Resume Scorer",
  nodes: [
    {
      name: "New Lead Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        httpMethod: "POST",
        path: "new-lead",
        responseMode: "onReceived",
        options: {}
      }
    },
    {
      name: "Extract Lead Data",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
      parameters: {
        jsCode: `
const body = $input.first().json;
const record = body.record || body;
return [{
  json: {
    lead_id: record.id || 'unknown',
    name: record.name || '',
    email: record.email || '',
    linkedin: record.linkedin || '',
    job_titles: record.job_titles || '',
    resume_url: record.resume_url || '',
    accepted_pricing: record.accepted_pricing || false,
    created_at: record.created_at || new Date().toISOString()
  }
}];`
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
      parameters: {
        operation: "pdf",
        options: {}
      }
    },
    {
      name: "Merge Lead + Text",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1170, 300],
      parameters: {
        jsCode: `
const pdfText = $input.first().json.text || $input.first().json.content || JSON.stringify($input.first().json);
const leadData = $('Extract Lead Data').first().json;
return [{
  json: {
    ...leadData,
    resume_text: pdfText.substring(0, 8000)
  }
}];`
      }
    },
    {
      name: "Score Resume with GPT",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1400, 300],
      parameters: {
        method: "POST",
        url: "https://api.openai.com/v1/chat/completions",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Authorization", value: "Bearer YOUR_OPENAI_KEY_HERE" },
            { name: "Content-Type", value: "application/json" }
          ]
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={
  "model": "gpt-4o",
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "You are an expert ATS resume analyst for US remote jobs. Analyze the resume and return JSON with: overall_score (0-100), grade (A+ to F), categories (ats_compatibility out of 20, keyword_density out of 20, quantified_achievements out of 15, format_structure out of 15, contact_remote_readiness out of 10, summary_objective out of 10, readability out of 10 — each with score, max, verdict), critical_issues (array max 5), strengths (array max 3), top_recommendation (string). Return ONLY valid JSON."
    },
    {
      "role": "user",
      "content": "Score this resume for remote US job applications:\\n\\n{{ $json.resume_text }}"
    }
  ]
}`
      }
    },
    {
      name: "Parse Score Result",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1630, 300],
      parameters: {
        jsCode: `
const gptResponse = $input.first().json;
const content = gptResponse.choices[0].message.content;
const score = JSON.parse(content);
const leadData = $('Merge Lead + Text').first().json;
return [{
  json: {
    lead_id: leadData.lead_id,
    name: leadData.name,
    email: leadData.email,
    job_titles: leadData.job_titles,
    overall_score: score.overall_score,
    grade: score.grade,
    score_details: score
  }
}];`
      }
    },
    {
      name: "Save Score to Supabase",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1860, 300],
      parameters: {
        method: "PATCH",
        url: `=${SUPABASE_URL}/rest/v1/beta_leads?id=eq.{{ $json.lead_id }}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "apikey", value: SUPABASE_SERVICE_KEY },
            { name: "Authorization", value: `Bearer ${SUPABASE_SERVICE_KEY}` },
            { name: "Content-Type", value: "application/json" },
            { name: "Prefer", value: "return=minimal" }
          ]
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={
  "resume_score": {{ $json.overall_score }},
  "score_details": {{ JSON.stringify($json.score_details) }}
}`
      }
    }
  ],
  connections: {
    "New Lead Webhook": { main: [[{ node: "Extract Lead Data", type: "main", index: 0 }]] },
    "Extract Lead Data": { main: [[{ node: "Download Resume PDF", type: "main", index: 0 }]] },
    "Download Resume PDF": { main: [[{ node: "Extract PDF Text", type: "main", index: 0 }]] },
    "Extract PDF Text": { main: [[{ node: "Merge Lead + Text", type: "main", index: 0 }]] },
    "Merge Lead + Text": { main: [[{ node: "Score Resume with GPT", type: "main", index: 0 }]] },
    "Score Resume with GPT": { main: [[{ node: "Parse Score Result", type: "main", index: 0 }]] },
    "Parse Score Result": { main: [[{ node: "Save Score to Supabase", type: "main", index: 0 }]] }
  },
  settings: { executionOrder: "v1" }
};

async function main() {
  try {
    // 1. Create the workflow
    const createRes = await fetch(`${N8N_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow)
    });
    const created = await createRes.json();
    console.log('✅ Workflow created! ID:', created.id);

    // 2. Activate the workflow
    const activateRes = await fetch(`${N8N_URL}/api/v1/workflows/${created.id}`, {
      method: 'PATCH',
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true })
    });
    const activated = await activateRes.json();
    console.log('✅ Workflow activated:', activated.active);
    console.log('');
    console.log('🔗 Webhook URL (Production):');
    console.log(`   ${N8N_URL}/webhook/new-lead`);
    console.log('');
    console.log('⚠️  NEXT: Replace YOUR_OPENAI_KEY_HERE in the "Score Resume with GPT" node');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
