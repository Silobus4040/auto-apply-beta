const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDlhYWQ1ZjUtZjRkMy00Mjk4LWFhNmItNmNlYzY3ODUyN2UyIiwiaWF0IjoxNzc3MjE0MjQ1fQ.ZtIp48vSUaF3dWrT6dIjY7w8hKAharZkg6Uh2pWGbUw';
const BASE = 'https://n8n.leadscompass.ai/api/v1';
const WORKFLOW_ID = 'i4sCnNwAeNQjLZ6J';

const headers = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

async function run() {
  const res = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers });
  const wf = await res.json();

  console.log('=== ALL NODES ===');
  wf.nodes.forEach(n => {
    console.log(`\nNode: "${n.name}" | ID: ${n.id} | Type: ${n.type}`);
    console.log('Parameters:', JSON.stringify(n.parameters, null, 2));
  });

  console.log('\n=== CONNECTIONS ===');
  console.log(JSON.stringify(wf.connections, null, 2));
}

run().catch(console.error);
