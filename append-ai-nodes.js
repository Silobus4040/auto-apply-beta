const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIwYjMxMC0wOWE3LTQ0YzYtYjZmNC0zNzllMjRhMjdhYWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDlhYWQ1ZjUtZjRkMy00Mjk4LWFhNmItNmNlYzY3ODUyN2UyIiwiaWF0IjoxNzc3MjE0MjQ1fQ.ZtIp48vSUaF3dWrT6dIjY7w8hKAharZkg6Uh2pWGbUw';
const BASE = 'https://n8n.leadscompass.ai/api/v1';
const WORKFLOW_ID = 'i4sCnNwAeNQjLZ6J';

const headers = { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' };

async function run() {
  console.log('Fetching workflow...');
  const res = await fetch(`${BASE}/workflows/${WORKFLOW_ID}`, { headers });
  const wf = await res.json();
  
  // 1. Update Parse Webhook Data to include resumeUrl
  const parseNode = wf.nodes.find(n => n.name === 'Parse Webhook Data');
  if (parseNode) {
    const assignments = parseNode.parameters.assignments.assignments;
    if (!assignments.find(a => a.name === 'resumeUrl')) {
      assignments.push({
        id: "f1000001-0000-0000-0000-000000000005",
        name: "resumeUrl",
        value: "={{ $json.body.resumeUrl }}",
        type: "string"
      });
    }
  }

  // 2. Add Download Resume (HTTP Request)
  const downloadNodeId = "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c";
  wf.nodes.push({
    id: downloadNodeId,
    name: "Download Resume",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.1,
    position: [900, 0],
    parameters: {
      method: "GET",
      url: "={{ $('Parse Webhook Data').first().json.resumeUrl }}",
      options: {
        response: {
          response: {
            responseFormat: "file",
            outputPropertyName: "data"
          }
        }
      }
    }
  });

  // 3. Add Extract Resume Text
  const extractNodeId = "b2c3d4e5-f6a7-48b9-0c1d-2e3f4a5b6c7d";
  wf.nodes.push({
    id: extractNodeId,
    name: "Extract Resume Text",
    type: "n8n-nodes-base.extractFromFile",
    typeVersion: 1,
    position: [1160, 0],
    parameters: {
      filePropertyName: "data"
    }
  });

  // 4. Add AI Matchmaker (OpenAI)
  const aiNodeId = "c3d4e5f6-a7b8-49c0-1d2e-3f4a5b6c7d8e";
  wf.nodes.push({
    id: aiNodeId,
    name: "AI Matchmaker",
    type: "n8n-nodes-base.openAi",
    typeVersion: 1.1,
    position: [1420, 0],
    parameters: {
      resource: "chat",
      operation: "message",
      prompt: {
        messages: [
          {
            content: "You are an expert ATS (Applicant Tracking System). Determine if the provided Resume is a good match for the Job Description. Respond ONLY in valid JSON format with exactly two keys: \"match\" (boolean) and \"reason\" (string explaining your decision).\n\nJob Description:\n{{ $('Run an Actor and get dataset').item.json.description }}\n\nResume Text:\n{{ $json.text }}"
          }
        ]
      },
      options: {
        systemMessage: "You are a professional HR recruiter assessing resume matches."
      }
    }
  });

  // 5. Connect the nodes
  wf.connections["Filter Missing applyUrl"] = {
    main: [
      [
        { node: "Download Resume", type: "main", index: 0 }
      ]
    ]
  };
  wf.connections["Download Resume"] = {
    main: [
      [
        { node: "Extract Resume Text", type: "main", index: 0 }
      ]
    ]
  };
  wf.connections["Extract Resume Text"] = {
    main: [
      [
        { node: "AI Matchmaker", type: "main", index: 0 }
      ]
    ]
  };

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
    console.log('✅ AI pipeline successfully added!');
  } else {
    console.log('❌ Failed to update:', result);
  }
}

run().catch(console.error);
