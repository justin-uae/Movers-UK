-- Email Centre redesign: star and archive conversations.
--
-- Archiving is a timestamp rather than moving the row to folder='archived':
-- the IMAP sync (app/api/cron/email-sync) re-reads the inbox by date and
-- upserts on (email_account_id, folder, message_uid), so a row moved out of
-- 'inbox' would be re-inserted there as a fresh unread copy on the next
-- sync. Leaving folder alone and flagging archived_at avoids that.
alter table email_messages add column is_starred boolean not null default false;
alter table email_messages add column archived_at timestamptz;

create index email_messages_account_starred_idx on email_messages(email_account_id) where is_starred;
