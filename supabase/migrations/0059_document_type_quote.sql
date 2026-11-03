-- =============================================================================
-- Add 'quote' to document_type so generated quote PDFs (previously only
-- ever emailed, never archived) can be persisted into the Documents module
-- the same way invoice PDFs already are.
-- =============================================================================

alter type document_type add value if not exists 'quote';
