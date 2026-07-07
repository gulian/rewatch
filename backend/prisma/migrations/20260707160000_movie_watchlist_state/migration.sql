-- Movies gain a list state (FOR_LATER / ARCHIVED), mirroring show follows.
-- Existing watchlist entries are all "for later" by definition.
ALTER TABLE "movie_watchlist" ADD COLUMN "state" "FollowState" NOT NULL DEFAULT 'FOR_LATER';
