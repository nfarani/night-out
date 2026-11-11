-- Each voter can also name up to three places they love (OSM ids, JSON) and say whether the
-- group should go classic (well-known places) or for hidden gems. Both shape the plan.
ALTER TABLE poll_votes ADD COLUMN venues TEXT;   -- JSON ["n123", "w456"], up to 3
ALTER TABLE poll_votes ADD COLUMN style TEXT;    -- 'classic' | 'gems' | NULL (either)
