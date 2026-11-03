-- =============================================================================
-- Fix: chat_channel_members_insert's "the channel's creator can add other
-- members" branch did `exists(select 1 from chat_channels c where c.id =
-- channel_id and c.created_by = auth.uid())` as a raw subquery — which is
-- itself filtered by chat_channels' own RLS SELECT policy. For a brand-new
-- DM (type='dm'), that policy requires is_chat_member(id), which is false
-- at exactly the moment we're inserting the first membership rows for that
-- channel — so the creator's own freshly-created DM was invisible to this
-- check, and starting a DM failed with an RLS violation on
-- chat_channel_members (one level deeper than the chat_channels fix in the
-- app code). Same fix as is_chat_member(): a SECURITY DEFINER helper that
-- bypasses RLS for this one lookup.
-- =============================================================================

create or replace function is_chat_channel_creator(p_channel_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from chat_channels where id = p_channel_id and created_by = auth.uid());
$$;

drop policy if exists chat_channel_members_insert on chat_channel_members;
create policy chat_channel_members_insert on chat_channel_members for insert
  with check (profile_id = auth.uid() or is_chat_channel_creator(channel_id));
