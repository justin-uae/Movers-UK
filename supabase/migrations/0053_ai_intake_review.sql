-- =============================================================================
-- Global Transport CRM — AI-04: link a Complex Booking's source file/email
-- into the real `documents` table instead of only referencing it inside
-- leads.raw_payload jsonb.
--
-- Today the uploaded itinerary file already lands in the `documents` storage
-- bucket (0025_documents.sql) and is already protected by that bucket's
-- tenant-scoped RLS, but no row is ever created in the `documents` table for
-- it — so it never shows up anywhere staff can find it again, and the
-- table's own delete policy (uploader-or-master-admin) can never match it.
-- Adding a nullable lead_id link lets the lead-creation action register a
-- real `documents` row (doc_type 'itinerary', which already existed in the
-- enum) so the source artifact is retrievable from the lead it produced.
-- =============================================================================

alter table documents add column lead_id uuid references leads(id) on delete set null;
create index documents_lead_id_idx on documents(lead_id);
