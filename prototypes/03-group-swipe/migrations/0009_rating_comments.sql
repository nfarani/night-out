-- A short comment with a "would you go again?" rating. Shown only on that group's plan
-- (to the people who have the link), never publicly: public reviews would need moderation.
ALTER TABLE ratings ADD COLUMN comment TEXT;   -- up to 280 characters
