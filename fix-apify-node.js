const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDlhYWQ1ZjUtZjRkMy00Mjk4LWFhNmItNmNlYzY3ODUyN2UyIiwiaWF0IjoxNzc3MjE0MjQ1fQ.ZtIp48vSUaF3dWrT6dIjY7w8hKAharZkg6Uh2pWGbUw';
const BASE = 'https://n8n.leadscompass.ai/api/v1';
const WORKFLOW_ID = 'i4sCnNwAeNQjLZ6J';

const headers = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

const updatedWorkflow = {
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
    },
    {
      id: "8c19fd8f-eac8-4ee0-aa00-53d55bd0f0ef",
      name: "Run an Actor and get dataset",
      type: "@apify/n8n-nodes-apify.apify",
      typeVersion: 1,
      position: [380, 0],
      parameters: {
        operation: "Run actor and get dataset",
        actorId: {
          __rl: true,
          value: "hKByXkMQaC5Qt9UMN",
          mode: "list",
          cachedResultName: "Linkedin Jobs Scraper (curious_coder/linkedin-jobs-scraper)",
          cachedResultUrl: "https://console.apify.com/actors/hKByXkMQaC5Qt9UMN/input"
        },
        // Use n8n expression to build a valid JSON body dynamically
        customBody: "={{ JSON.stringify({ count: 100, scrapeCompany: true, splitByLocation: false, urls: [$json.linkedInUrl] }) }}",
        timeout: 3600
      }
    }
  ],
  connections: {
    "Webhook": {
      main: [
        [{ node: "Parse Webhook Data", type: "main", index: 0 }]
      ]
    },
    "Parse Webhook Data": {
      main: [
        [{ node: "Run an Actor and get dataset", type: "main", index: 0 }]
      ]
    }
  },
  settings: { executionOrder: "v1" }
};

async function run() {
  console.log('Fixing Apify node customBody...');
  const res = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updatedWorkflow)
  });
  const result = await res.json();
  if (result.id) {
    console.log('✅ Workflow fixed successfully!');
    console.log('Nodes:', result.nodes?.length);
    // Print the apify node params to confirm
    const apifyNode = result.nodes?.find(n => n.name === 'Run an Actor and get dataset');
    console.log('Apify customBody:', apifyNode?.parameters?.customBody);
  } else {
    console.log('❌ Error:', JSON.stringify(result));
  }
}

run().catch(console.error);
