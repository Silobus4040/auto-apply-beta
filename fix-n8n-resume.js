const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDlhYWQ1ZjUtZjRkMy00Mjk4LWFhNmItNmNlYzY3ODUyN2UyIiwiaWF0IjoxNzc3MjE0MjQ1fQ.ZtIp48vSUaF3dWrT6dIjY7w8hKAharZkg6Uh2pWGbUw';
const BASE = 'https://n8n.leadscompass.ai/api/v1';
const WORKFLOW_ID = 'i4sCnNwAeNQjLZ6J';
const headers = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

async function run() {
  console.log('Fetching workflow...');
  const res = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers });
  const wf = await res.json();

  // Remove "Download Resume" and "Extract Resume Text" nodes — no longer needed
  // We now receive resumeText directly in the webhook payload
  wf.nodes = wf.nodes.filter(n =>
    n.name !== 'Download Resume' && n.name !== 'Extract Resume Text'
  );

  // Fix the Parse Webhook Data node: replace resumeUrl with resumeText
  const parseNode = wf.nodes.find(n => n.name === 'Parse Webhook Data');
  if (parseNode) {
    const assignments = parseNode.parameters.assignments.assignments;
    // Remove old resumeUrl assignment if present
    const urlIdx = assignments.findIndex(a => a.name === 'resumeUrl');
    if (urlIdx !== -1) assignments.splice(urlIdx, 1);
    // Add resumeText if not already there
    if (!assignments.find(a => a.name === 'resumeText')) {
      assignments.push({
        id: "f1000001-0000-0000-0000-000000000006",
        name: "resumeText",
        value: "={{ $json.body.resumeText }}",
        type: "string"
      });
    }
  }

  // Fix the AI Matchmaker node to reference resumeText from Parse Webhook Data
  const aiNode = wf.nodes.find(n => n.name === 'AI Matchmaker');
  if (aiNode) {
    aiNode.parameters.prompt = {
      messages: [
        {
          content: `You are an expert ATS (Applicant Tracking System) and professional HR recruiter. Determine if the provided Resume is a good match for the Job Description.

Respond ONLY in valid JSON format with exactly two keys:
- "match": boolean (true if good match, false if not)
- "reason": string (2-3 sentences explaining WHY it is or is not a match, referencing specific skills, experience gaps, or strong alignment)

Job Description:
{{ $('Run an Actor and get dataset').item.json.description }}

Candidate Resume:
{{ $('Parse Webhook Data').first().json.resumeText }}`
        }
      ]
    };
  }

  // Fix connections: Filter -> AI Matchmaker (skip the removed nodes)
  wf.connections["Filter Missing applyUrl"] = {
    main: [[{ node: "AI Matchmaker", type: "main", index: 0 }]]
  };
  // Clean up stale connections for deleted nodes
  delete wf.connections["Download Resume"];
  delete wf.connections["Extract Resume Text"];

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: "v1" }
  };

  console.log('Updating workflow...');
  const updateRes = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });

  const result = await updateRes.json();
  if (result.id) {
    console.log('✅ Workflow updated! Pipeline: Webhook → Parse → Apify → Filter → AI Matchmaker');
    console.log('   resumeText now flows directly from webhook payload — no download node needed.');
  } else {
    console.log('❌ Failed:', JSON.stringify(result, null, 2));
  }
}

run().catch(console.error);
