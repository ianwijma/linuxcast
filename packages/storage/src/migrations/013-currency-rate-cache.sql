-- Rebuildable public reference rates only. No amounts, expressions or result history.
CREATE TABLE currency_rate_cache (
  base TEXT NOT NULL CHECK(length(base)=3 AND base GLOB '[A-Z][A-Z][A-Z]'),
  quote TEXT NOT NULL CHECK(length(quote)=3 AND quote GLOB '[A-Z][A-Z][A-Z]' AND base<>quote),
  rate REAL NOT NULL CHECK(rate>0),
  as_of_date TEXT NOT NULL CHECK(length(as_of_date)=10),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(base,quote)
) STRICT;
