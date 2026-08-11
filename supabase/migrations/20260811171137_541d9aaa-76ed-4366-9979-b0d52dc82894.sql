-- Demo conversation for the Chicago Investors workspace so the redesigned
-- Conversations UI can be reviewed with real thread content.
insert into public.jobs (id, workspace_id, source_type, status, record_type, channel, params, data_provenance, created_at)
values (
  '3c7e1f2a-0000-4a10-9c11-11a0de000001',
  '0aa08043-c34c-4375-8783-d776ee9a2ac3',
  'sample',
  'complete',
  'foreclosure',
  'sms',
  '{"demo": true, "label": "Sample List"}'::jsonb,
  'mock_legacy',
  now() - interval '6 days'
)
on conflict (id) do nothing;

insert into public.leads (id, workspace_id, job_id, full_name, phone, phone_type, city, state, data_provenance, created_at)
values (
  '3c7e1f2a-0000-4a10-9c11-11a0de000002',
  '0aa08043-c34c-4375-8783-d776ee9a2ac3',
  '3c7e1f2a-0000-4a10-9c11-11a0de000001',
  'Marcus Webb',
  '+13125550142',
  'mobile',
  'Chicago',
  'IL',
  'mock_legacy',
  now() - interval '6 days'
)
on conflict (id) do nothing;

insert into public.messages (workspace_id, lead_id, thread_key, direction, channel, body, status, is_bot, read_at, created_at)
values
  ('0aa08043-c34c-4375-8783-d776ee9a2ac3', '3c7e1f2a-0000-4a10-9c11-11a0de000002', '3c7e1f2a-0000-4a10-9c11-11a0de000002', 'outbound', 'sms',
   'Hi Marcus — I saw the property on S Wabash came up in the county filings. Are you open to an offer on it?', 'delivered', false, null, now() - interval '2 days' - interval '4 hours'),
  ('0aa08043-c34c-4375-8783-d776ee9a2ac3', '3c7e1f2a-0000-4a10-9c11-11a0de000002', '3c7e1f2a-0000-4a10-9c11-11a0de000002', 'inbound', 'sms',
   'Who is this?', 'received', false, now() - interval '2 days' - interval '3 hours', now() - interval '2 days' - interval '3 hours' - interval '20 minutes'),
  ('0aa08043-c34c-4375-8783-d776ee9a2ac3', '3c7e1f2a-0000-4a10-9c11-11a0de000002', '3c7e1f2a-0000-4a10-9c11-11a0de000002', 'outbound', 'sms',
   'This is Dana with LeadTrace. We buy in Cook County — the filing is public record. Happy to stop texting if the timing is off.', 'delivered', true, null, now() - interval '2 days' - interval '3 hours'),
  ('0aa08043-c34c-4375-8783-d776ee9a2ac3', '3c7e1f2a-0000-4a10-9c11-11a0de000002', '3c7e1f2a-0000-4a10-9c11-11a0de000002', 'inbound', 'sms',
   'No it is fine. I have been thinking about selling but the place needs a new roof and I do not want to deal with repairs.', 'received', false, now() - interval '2 days' - interval '2 hours', now() - interval '2 days' - interval '2 hours' - interval '10 minutes'),
  ('0aa08043-c34c-4375-8783-d776ee9a2ac3', '3c7e1f2a-0000-4a10-9c11-11a0de000002', '3c7e1f2a-0000-4a10-9c11-11a0de000002', 'outbound', 'sms',
   'Understood — we buy as-is, so the roof is on us. Would a quick 10-minute call this week work to talk numbers?', 'delivered', true, null, now() - interval '2 days' - interval '1 hour'),
  ('0aa08043-c34c-4375-8783-d776ee9a2ac3', '3c7e1f2a-0000-4a10-9c11-11a0de000002', '3c7e1f2a-0000-4a10-9c11-11a0de000002', 'inbound', 'sms',
   'Thursday afternoon works. Call me after 2pm.', 'received', false, null, now() - interval '3 hours');

insert into public.thread_states (workspace_id, thread_key, lead_id, starred, status)
values ('0aa08043-c34c-4375-8783-d776ee9a2ac3', '3c7e1f2a-0000-4a10-9c11-11a0de000002', '3c7e1f2a-0000-4a10-9c11-11a0de000002', true, 'interested')
on conflict (workspace_id, thread_key) do nothing;