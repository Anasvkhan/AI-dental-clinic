-- One call per Vapi "tool-calls" message: parses every tool call (arguments may be an
-- object or a JSON string) and returns Vapi's {"results": [...]} shape directly.
-- Replaces the n8n Code node, which added ~1.6 s per tool call on n8n Cloud.

create or replace function public.handle_vapi_tool_calls(p_message jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_call jsonb := coalesce(p_message -> 'call', '{}'::jsonb);
  v_tool_call jsonb;
  v_fn jsonb;
  v_args jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_tool_call in
    select * from jsonb_array_elements(coalesce(p_message -> 'toolCallList', p_message -> 'toolCalls', '[]'::jsonb))
  loop
    v_fn := coalesce(v_tool_call -> 'function', v_tool_call);
    v_args := v_fn -> 'arguments';
    if jsonb_typeof(v_args) = 'string' then
      begin
        v_args := (v_args #>> '{}')::jsonb;
      exception when others then
        v_args := '{}'::jsonb;
      end;
    end if;

    -- One failing tool must not stop the others or leave Vapi without a reply
    begin
      v_result := public.handle_vapi_tool(
        v_fn ->> 'name', coalesce(v_args, '{}'::jsonb), v_call #>> '{customer,number}', v_call ->> 'id');
    exception when others then
      v_result := jsonb_build_object('success', false,
        'message', 'The booking system had a problem. Apologise and offer to take a message for the clinic to call back.');
    end;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('toolCallId', v_tool_call ->> 'id', 'result', v_result::text));
  end loop;

  return jsonb_build_object('results', v_results);
end;
$$;

revoke execute on function public.handle_vapi_tool_calls(jsonb) from public, anon, authenticated;
grant execute on function public.handle_vapi_tool_calls(jsonb) to service_role;
