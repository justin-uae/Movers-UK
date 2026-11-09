-- =============================================================================
-- Sets the sender ("From") details shown on quote and invoice PDFs. These
-- columns (companies.legal_name/registered_address) already existed but had
-- no admin UI and were only ever read into the document footer — the PDFs
-- now also show them as a proper "From" block up top, next to "Bill To".
-- =============================================================================

-- (Originally backfilled one specific company's sender details; each
-- tenant now sets its own legal name and registered address.)
select 1;
