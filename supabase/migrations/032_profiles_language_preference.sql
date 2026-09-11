-- 032_profiles_language_preference.sql
-- Bot ↔ Mini App language preference (multi-language inline keyboard).
--
-- The Telegram bots (webhook + long-poll) write the language picked from the
-- «🌐 ቋንቋ» inline keyboard here; the Mini App reads profiles.language_preference
-- on open (or a ?startapp=lang_xx link) so the UI starts in the user's chosen
-- language automatically.
--
-- `language` (short ISO/legacy code) and `language_preference` (bot-internal
-- lang_* code) are both persisted so either convention resolves to the choice.
--
-- Idempotent — safe to re-run.

alter table public.profiles add column if not exists language_preference text;
alter table public.profiles add column if not exists language text;
alter table public.users    add column if not exists language_preference text;
alter table public.users    add column if not exists language text;

-- Fast admin lookups by saved language.
create index if not exists profiles_language_preference_idx
  on public.profiles (language_preference);
create index if not exists profiles_language_idx
  on public.profiles (language);