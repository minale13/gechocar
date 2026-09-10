-- ============================================================================
-- 006: Telegram Bot Settings columns
-- ============================================================================
-- app_settings is a SINGLE-ROW table (always row id = 1). The bot token and
-- chat id are stored in the dedicated `telegram_bot_token` /
-- `telegram_chat_id` COLUMNS.
--
-- (A previous revision seeded these as key/value rows back when the table
-- briefly used that shape — that model is obsolete.)
--
-- Idempotent: safe to run multiple times.
-- ============================================================================

alter table public.app_settings
  add column if not exists telegram_bot_token text;

alter table public.app_settings
  add column if not exists telegram_chat_id text;
