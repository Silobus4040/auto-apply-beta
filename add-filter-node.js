const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDlhYWQ1ZjUtZjRkMy00Mjk4LWFhNmItNmNlYzY3ODUyN2UyIiwiaWF0IjoxNzc3MjE0MjQ1fQ.ZtIp48vSUaF3dWrT6dIjY7w8hKAharZkg6Uh2pWGbUw';
const BASE = 'https://n8n.leadscompass.ai/api/v1';
const WORKFLOW_ID = 'i4sCnNwAeNQjLZ6J';

const headers = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

async function run() {
  console.log('Fetching workflow to add Filter node...');
  const res = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers });
  const wf = await res.json();
  
  // Add the Filter node
  wf.nodes.push({
    id: "d9e8f7g6-h5i4-j3k2-l1m0-n9o8p7q6r5s4",
    name: "Filter Missing applyUrl",
    type: "n8n-nodes-base.filter",
    typeVersion: 2,
    position: [640, 0], // Place it to the right of Apify node
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "strict"
        },
        conditions: [
          {
            id: "272589e4-ccbc-4e6d-9b57-69b7681329c4",
            leftValue: "={{ $json.applyUrl }}",
            rightValue: "",
            operator: {
              type: "string",
              operation: "exists",
              singleValue: true
            }
          },
          {
            id: "382589e4-ccbc-4e6d-9b57-69b7681329c5",
            leftValue: "={{ $json.applyUrl }}",
            rightValue: "",
            operator: {
              type: "string",
              operation: "notEmpty",
              singleValue: true
            }
          }
        ],
        combinator: "and"
      },
      options: {}
    }
  });

  // Connect Apify node to Filter node
  wf.connections["Run an Actor and get dataset"] = {
    main: [
      [
        {
          node: "Filter Missing applyUrl",
          type: "main",
          index: 0
        }
      ]
    ]
  };

  // Clean the object before sending
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: "v1" } // Strip all other settings
  };

  // Update the workflow
  console.log('Updating workflow...');
  const updateRes = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  
  const result = await updateRes.json();
  if (result.id) {
    console.log('✅ Filter node successfully added!');
  } else {
    console.log('❌ Failed to update:', result);
  }
}

run().catch(console.error);
