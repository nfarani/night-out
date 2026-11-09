-- Who made a curation decision: 'editor' (you, in /curate) or 'research' (the automated
-- research run). Research rows are replaced on every refresh; editor rows never are.
ALTER TABLE curation ADD COLUMN origin TEXT NOT NULL DEFAULT 'editor';

-- How often a venue was still in the plan when someone shared it or opened the route.
ALTER TABLE stats ADD COLUMN kept INTEGER NOT NULL DEFAULT 0;
