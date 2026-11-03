-- The leads page's "quotes awaiting response" count filters quotes by
-- status (sent/viewed) on every load; only tenant_id and enquiry_id were
-- indexed, so this was a sequential scan that grows with quote volume.
create index if not exists quotes_status_idx on quotes(status);
