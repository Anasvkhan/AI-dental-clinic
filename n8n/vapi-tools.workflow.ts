import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

// Tool-call parsing lives in the Supabase function handle_vapi_tool_calls: an n8n
// Code node added ~1.6 s per call on n8n Cloud, and expressions cannot read Vapi's
// "arguments" field.

const receiveToolCall = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Receive Vapi Tool Call',
    parameters: {
      httpMethod: 'POST',
      path: 'vapi-tools',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {}
    },
    credentials: { httpHeaderAuth: newCredential('Vapi Webhook Secret') },
    position: [0, 304]
  },
  output: [{
    body: {
      message: {
        type: 'tool-calls',
        toolCallList: [{ id: 'call_abc123', type: 'function', function: { name: 'check_availability', arguments: { date: '2026-10-20', service: 'cleaning' } } }],
        call: { id: 'vapi-call-1', customer: { number: '+923001234567' } }
      }
    }
  }]
});

const runTool = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Run Tool in Supabase',
    parameters: {
      method: 'POST',
      url: 'https://ytwkdbapvufwogeemsuv.supabase.co/rest/v1/rpc/handle_vapi_tool_calls',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_message: $json.body.message }) }}'),
      options: {
        timeout: 8000,
        response: { response: { neverError: true, responseFormat: 'json' } }
      }
    },
    credentials: { supabaseApi: newCredential('Supabase Dental') },
    onError: 'continueRegularOutput',
    position: [280, 304]
  },
  output: [{ results: [{ toolCallId: 'call_abc123', result: '{"success":true,"message":"12 open start times for Checkup & Cleaning."}' }] }]
});

const respondToVapi = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond to Vapi',
    parameters: {
      respondWith: 'json',
      responseBody: expr(
        "{{ Array.isArray($json.results) ? { results: $json.results } : { results: ($('Receive Vapi Tool Call').first().json.body.message.toolCallList || []).map(t => ({ toolCallId: t.id, result: JSON.stringify({ success: false, message: 'The booking system had a problem. Apologise and offer to take a message for the clinic to call back.' }) })) } }}"
      ),
      options: {}
    },
    position: [560, 304]
  },
  output: [{ results: [{ toolCallId: 'call_abc123', result: '{"success":true}' }] }]
});

const note = sticky(
  '## Vapi tool server\nVapi POSTs tool calls here. The whole message goes to the Supabase function `handle_vapi_tool_calls`, which runs each tool (availability, booking, reschedule, cancel, patient lookup, clinic info) and returns Vapi\'s results format.',
  [receiveToolCall, runTool, respondToVapi],
  { color: 4 }
);

export default workflow('vapi-dental-tools', 'Vapi Dental Tools')
  .add(receiveToolCall)
  .to(runTool)
  .to(respondToVapi)
  .add(note);
