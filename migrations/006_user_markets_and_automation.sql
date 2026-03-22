-- Migration 006: User markets and automation settings
-- Run in Supabase SQL Editor after migration 005

-- ============================================
-- USER MARKETS
-- Target markets for auto-research per user
-- ============================================
CREATE TABLE IF NOT EXISTS user_markets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT,
  county TEXT,
  price_range TEXT DEFAULT 'any price range',
  lead_types TEXT[] DEFAULT '{"Sellers Only"}',
  distress_filters JSONB DEFAULT '{}',
  fee_target TEXT DEFAULT '$10,000',
  is_active BOOLEAN DEFAULT true,
  last_researched TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_markets_user ON user_markets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_markets_active ON user_markets(user_id, is_active);

ALTER TABLE user_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markets_all_own" ON user_markets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================
-- AUTOMATION SETTINGS
-- Per-user automation configuration
-- ============================================
CREATE TABLE IF NOT EXISTS automation_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_mode BOOLEAN DEFAULT false,
  frequency_hours INTEGER DEFAULT 24,
  auto_buyers BOOLEAN DEFAULT true,
  auto_stage BOOLEAN DEFAULT true,
  auto_followup_days INTEGER DEFAULT 3,
  auto_dead_days INTEGER DEFAULT 21,
  last_auto_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_all_own" ON automation_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER automation_updated_at BEFORE UPDATE ON automation_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- UNIQUE CONSTRAINT ON BUYERS
-- Prevent duplicate buyer names per user
-- ============================================
ALTER TABLE buyers ADD CONSTRAINT buyers_user_name_unique UNIQUE (user_id, name);
