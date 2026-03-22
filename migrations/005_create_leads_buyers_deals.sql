-- Migration 005: Create leads, buyers, and deals tables
-- Run in Supabase SQL Editor after migrations 001-004

-- ============================================
-- LEADS TABLE
-- Persists researched leads per user
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL DEFAULT 'Research Candidate',
  lead_type TEXT NOT NULL DEFAULT 'Seller',
  distressed BOOLEAN DEFAULT false,
  score INTEGER DEFAULT 50,
  heat TEXT GENERATED ALWAYS AS (
    CASE WHEN score >= 80 THEN 'Hot' WHEN score >= 55 THEN 'Warm' ELSE 'Cold' END
  ) STORED,
  -- Location
  property_address TEXT,
  property_street TEXT,
  property_city TEXT,
  property_state TEXT,
  property_zip TEXT,
  area TEXT,
  -- Contact
  phone TEXT,
  alt_phone TEXT,
  email TEXT,
  contact_pref TEXT DEFAULT 'Any',
  contact_count INTEGER DEFAULT 0,
  last_contacted TIMESTAMPTZ,
  -- Property intel
  property_type TEXT DEFAULT 'SFR',
  year_built INTEGER,
  sqft INTEGER,
  bed_bath TEXT,
  lot_size TEXT,
  assessed_value NUMERIC,
  mortgage_estimate NUMERIC,
  equity_estimate NUMERIC,
  -- Deal numbers
  arv NUMERIC DEFAULT 0,
  repair_cost NUMERIC DEFAULT 0,
  mao NUMERIC DEFAULT 0,
  offer_price NUMERIC DEFAULT 0,
  assignment_fee NUMERIC DEFAULT 0,
  buyer_equity NUMERIC DEFAULT 0,
  -- Pipeline
  stage TEXT NOT NULL DEFAULT 'New Lead',
  -- Motivation & distress
  distress_types TEXT[] DEFAULT '{}',
  motiv_tags TEXT[] DEFAULT '{}',
  violations TEXT[] DEFAULT '{}',
  tax_owed NUMERIC,
  tax_years TEXT,
  tax_lien BOOLEAN,
  -- Metadata
  lead_source TEXT DEFAULT 'Live Research',
  source_mode TEXT DEFAULT 'live-research',
  source_urls TEXT[] DEFAULT '{}',
  research_confidence INTEGER DEFAULT 0,
  timeline TEXT DEFAULT 'Flexible',
  budget TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT '',
  user_notes TEXT DEFAULT '',
  marketing_cost NUMERIC DEFAULT 0,
  activity_log JSONB DEFAULT '[]',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_city_state ON leads(property_city, property_state);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select_own" ON leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "leads_insert_own" ON leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "leads_update_own" ON leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "leads_delete_own" ON leads FOR DELETE USING (auth.uid() = user_id);

-- Admin bypass
CREATE POLICY "leads_admin_all" ON leads FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- ============================================
-- BUYERS TABLE
-- User-managed cash buyer list
-- ============================================
CREATE TABLE IF NOT EXISTS buyers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  buyer_type TEXT DEFAULT 'Fix & Flip',
  phone TEXT,
  email TEXT,
  price_min NUMERIC DEFAULT 0,
  price_max NUMERIC DEFAULT 999999,
  criteria TEXT[] DEFAULT '{}',
  locations TEXT[] DEFAULT '{}',
  rehab_tolerance TEXT DEFAULT 'Medium',
  financing TEXT DEFAULT 'Cash',
  deals_closed INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buyers_user_id ON buyers(user_id);
CREATE INDEX IF NOT EXISTS idx_buyers_active ON buyers(user_id, is_active);

ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers_select_own" ON buyers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "buyers_insert_own" ON buyers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "buyers_update_own" ON buyers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "buyers_delete_own" ON buyers FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "buyers_admin_all" ON buyers FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- ============================================
-- DEALS TABLE
-- Closed/tracked deals for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL,
  property_address TEXT NOT NULL,
  seller_name TEXT,
  buyer_name TEXT,
  arv NUMERIC DEFAULT 0,
  repair_cost NUMERIC DEFAULT 0,
  purchase_price NUMERIC DEFAULT 0,
  assignment_fee NUMERIC DEFAULT 0,
  total_buyer_price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Under Contract',
  close_date DATE,
  earnest_money NUMERIC DEFAULT 1000,
  inspection_days INTEGER DEFAULT 7,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_user_id ON deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(user_id, status);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_select_own" ON deals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "deals_insert_own" ON deals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "deals_update_own" ON deals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "deals_delete_own" ON deals FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "deals_admin_all" ON deals FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true));

-- Updated_at trigger function (reuse if already exists)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER buyers_updated_at BEFORE UPDATE ON buyers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
