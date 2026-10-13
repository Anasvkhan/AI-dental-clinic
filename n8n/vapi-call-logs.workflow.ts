import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const receiveEvent = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Receive Vapi Event',
    parameters: {
      httpMethod: 'POST',
      path: 'vapi-events',
      authentication: 'headerAuth',
      responseMode: 'onReceived',
      options: {}
    },
    credentials: { httpHeaderAuth: newCredential('Vapi Webhook Secret') },
    position: [0, 300]
  },
  output: [{
    body: {
      message: {
        type: 'end-of-call-report',
        endedReason: 'customer-ended-call',
        startedAt: '2026-10-13T14:00:00.000Z',
        endedAt: '2026-10-13T14:03:10.000Z',
        durationSeconds: 190,
        analysis: { summary: 'Caller booked a cleaning for Tuesday at 9 AM.' },
        artifact: { transcript: 'AI: Hello...', recordingUrl: 'https://example.com/recording.wav' },
        call: { id: 'vapi-call-1', customer: { number: '+15551234567' } }
      }
    }
  }]
});

const onlyEndOfCall = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: {
    name: 'Only End-of-Call Reports',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.body?.message?.type }}'), rightValue: 'end-of-call-report', operator: { type: 'string', operation: 'equals' } }]
      }
    },
    position: [260, 300]
  },
  output: [{ body: { message: { type: 'end-of-call-report', call: { id: 'vapi-call-1' } } } }]
});

const saveCallLog = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Save Call Log in Supabase',
    parameters: {
      method: 'POST',
      url: 'https://ytwkdbapvufwogeemsuv.supabase.co/rest/v1/rpc/save_call_log',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_message: $json.body.message }) }}'),
      options: { timeout: 15000 }
    },
    credentials: { supabaseApi: newCredential('Supabase Dental') },
    retryOnFail: true,
    maxTries: 3,
    position: [520, 300]
  },
  output: [{ success: true, call_log_id: '6b1f0c1e-0000-4000-8000-000000000000' }]
});

const note = sticky(
  '## Vapi call logs\nSet this URL as the assistant Server URL in Vapi. End-of-call reports (summary, transcript, recording) are saved to the call_logs table. Other events are ignored.',
  [receiveEvent, onlyEndOfCall, saveCallLog],
  { color: 4 }
);

export default workflow('vapi-dental-call-logs', 'Vapi Dental Call Logs')
  .add(receiveEvent)
  .to(onlyEndOfCall)
  .to(saveCallLog)
  .add(note)
  .group('Store call report', [onlyEndOfCall, saveCallLog], {
    description: 'Keeps only end-of-call reports and saves them to Supabase call_logs'
  });
