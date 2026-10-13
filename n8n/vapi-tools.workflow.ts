import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

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
    position: [0, 300]
  },
  output: [{
    body: {
      message: {
        type: 'tool-calls',
        toolCallList: [{ id: 'call_abc123', type: 'function', function: { name: 'check_availability', arguments: { date: '2026-10-20', service: 'cleaning' } } }],
        call: { id: 'vapi-call-1', customer: { number: '+15551234567' } }
      }
    }
  }]
});

const parseToolCalls = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Tool Calls',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// Vapi sends { message: { toolCallList: [{ id, function: { name, arguments } }], call: { id, customer: { number } } } }\nconst message = $input.first().json.body?.message ?? {};\nconst call = message.call ?? {};\nconst toolCalls = message.toolCallList ?? message.toolCalls ?? [];\n\nreturn toolCalls.map((tc) => {\n  const fn = tc.function ?? tc;\n  let args = fn.arguments ?? {};\n  if (typeof args === 'string') {\n    try {\n      args = JSON.parse(args || '{}');\n    } catch (e) {\n      args = {};\n    }\n  }\n  return {\n    json: {\n      toolCallId: tc.id,\n      name: fn.name,\n      args,\n      callerPhone: call.customer?.number ?? '',\n      callId: call.id ?? '',\n    },\n    pairedItem: { item: 0 },\n  };\n});"
    },
    position: [360, 300]
  },
  output: [{ toolCallId: 'call_abc123', name: 'check_availability', args: { date: '2026-10-20', service: 'cleaning' }, callerPhone: '+15551234567', callId: 'vapi-call-1' }]
});

const runTool = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Run Tool in Supabase',
    parameters: {
      method: 'POST',
      url: 'https://ytwkdbapvufwogeemsuv.supabase.co/rest/v1/rpc/handle_vapi_tool',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_name: $json.name, p_args: $json.args, p_caller_phone: $json.callerPhone || null, p_call_id: $json.callId || null }) }}'),
      options: {
        timeout: 8000,
        response: { response: { neverError: true, responseFormat: 'json' } }
      }
    },
    credentials: { supabaseApi: newCredential('Supabase Dental') },
    onError: 'continueRegularOutput',
    position: [640, 300]
  },
  output: [{ success: true, service: 'Checkup & Cleaning', message: '12 open start times for Checkup & Cleaning.', available_times: [{ time: '9:00 AM', start_local: '2026-10-20 09:00', dentists: ['Dr. Sarah Ahmed'] }] }]
});

const formatResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Format Vapi Result',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'result-tool-call-id', name: 'toolCallId', value: expr("{{ $('Parse Tool Calls').item.json.toolCallId }}"), type: 'string' },
          { id: 'result-text', name: 'result', value: expr("{{ ($json.message && $json.code) || $json.error ? JSON.stringify({ success: false, message: 'The booking system had a problem. Apologise and offer to take a message for the clinic to call back.' }) : JSON.stringify($json) }}"), type: 'string' }
        ]
      },
      options: {}
    },
    position: [900, 300]
  },
  output: [{ toolCallId: 'call_abc123', result: '{"success":true,"message":"12 open start times for Checkup & Cleaning."}' }]
});

const collectResults = node({
  type: 'n8n-nodes-base.aggregate',
  version: 1,
  config: {
    name: 'Collect Results',
    parameters: {
      aggregate: 'aggregateAllItemData',
      destinationFieldName: 'results',
      include: 'allFields'
    },
    position: [1160, 300]
  },
  output: [{ results: [{ toolCallId: 'call_abc123', result: '{"success":true}' }] }]
});

const respondToVapi = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond to Vapi',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ { results: $json.results } }}'),
      options: {}
    },
    position: [1400, 300]
  },
  output: [{ results: [{ toolCallId: 'call_abc123', result: '{"success":true}' }] }]
});

const note = sticky(
  '## Vapi tool server\nVapi POSTs tool calls here. Each call is sent to the Supabase function `handle_vapi_tool`, which checks availability, books, reschedules, cancels or looks up patients.\n\nTools: get_clinic_info, check_availability, book_appointment, get_patient_appointments, reschedule_appointment, cancel_appointment.',
  [receiveToolCall, parseToolCalls, runTool, formatResult, collectResults, respondToVapi],
  { color: 4 }
);

export default workflow('vapi-dental-tools', 'Vapi Dental Tools')
  .add(receiveToolCall)
  .to(parseToolCalls)
  .to(runTool)
  .to(formatResult)
  .to(collectResults)
  .to(respondToVapi)
  .add(note)
  .group('Run tool calls', [parseToolCalls, runTool, formatResult], {
    description: 'Reads each Vapi tool call and runs it in Supabase'
  })
  .group('Reply to Vapi', [collectResults, respondToVapi], {
    description: 'Combines all tool results and returns them to Vapi in its results format'
  });
