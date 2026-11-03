-- =============================================================================
-- Sets the sender ("From") details shown on quote and invoice PDFs. These
-- columns (companies.legal_name/registered_address) already existed but had
-- no admin UI and were only ever read into the document footer — the PDFs
-- now also show them as a proper "From" block up top, next to "Bill To".
-- =============================================================================

update companies
set
  legal_name = 'Global Bus Rentals',
  registered_address = '71-75 Shelton Street, Covent Garden' || chr(10) || 'London, Greater London WC2H 9JQ' || chr(10) || 'United Kingdom';
