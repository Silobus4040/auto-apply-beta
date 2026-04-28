const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDlhYWQ1ZjUtZjRkMy00Mjk4LWFhNmItNmNlYzY3ODUyN2UyIiwiaWF0IjoxNzc3MjE0MjQ1fQ.ZtIp48vSUaF3dWrT6dIjY7w8hKAharZkg6Uh2pWGbUw';
const BASE = 'https://n8n.leadscompass.ai/api/v1';
const WORKFLOW_ID = 'IY35WHaTRi1tFDCS';

const headers = {
  'X-N8N-API-KEY': KEY,
  'Content-Type': 'application/json'
};

const newWorkflow = {
  name: "Job Search Automation",
  nodes: [
    {
      id: "b4996b7a-7c1e-4a04-aa24-4627963ba651",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: [-128, 0],
      webhookId: "3e4ee99d-dac6-499c-a5cd-d1234be1e258",
      parameters: {
        httpMethod: "POST",
        path: "3e4ee99d-dac6-499c-a5cd-d1234be1e258",
        options: {}
      }
    },
    {
      id: "c5d6e7f8-a9b0-c1d2-e3f4-a5b6c7d8e9f0",
      name: "Parse Webhook Data",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [120, 0],
      parameters: {
        assignments: {
          assignments: [
            { id: "f1000001-0000-0000-0000-000000000001", name: "role", value: "={{ $json.body.role }}", type: "string" },
            { id: "f1000001-0000-0000-0000-000000000002", name: "country", value: "={{ $json.body.country }}", type: "string" },
            { id: "f1000001-0000-0000-0000-000000000003", name: "workplaceTypes", value: "={{ $json.body.workplaceTypes }}", type: "string" },
            { id: "f1000001-0000-0000-0000-000000000004", name: "linkedInUrl", value: "={{ $json.body.linkedInUrl }}", type: "string" }
          ]
        },
        options: {}
      }
    }
  ],
  connections: {
    "Webhook": {
      main: [
        [{ node: "Parse Webhook Data", type: "main", index: 0 }]
      ]
    }
  },
  settings: { executionOrder: "v1" }
};

async function run() {
  // Step 1: Delete the old corrupted workflow
  console.log('Deleting old workflow...');
  const del = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { method: 'DELETE', headers });
  console.log('Delete status:', del.status);

  // Step 2: Create a fresh clean workflow
  console.log('Creating new workflow...');
  const create = await fetch(`${BASE}/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(newWorkflow)
  });
  const result = await create.json();
  console.log('New workflow created!');
  console.log('ID:', result.id);
  console.log('Name:', result.name);
  console.log('Nodes:', result.nodes?.length);
  console.log('\nOpen it at:');
  console.log(`https://n8n.leadscompass.ai/workflow/${result.id}`);
}

run().catch(console.error);
