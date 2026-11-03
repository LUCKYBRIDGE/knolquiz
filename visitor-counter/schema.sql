-- Counts unique browser IDs per service and per KST calendar day.
CREATE TABLE IF NOT EXISTS visitors (
  site TEXT NOT NULL CHECK (site IN ('quiz','print','art')),
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (site, visitor_hash)
);
CREATE TABLE IF NOT EXISTS daily_visits (
  site TEXT NOT NULL CHECK (site IN ('quiz','print','art')),
  visit_date TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (site, visit_date, visitor_hash)
);
CREATE INDEX IF NOT EXISTS idx_daily_site_date ON daily_visits (site, visit_date);
