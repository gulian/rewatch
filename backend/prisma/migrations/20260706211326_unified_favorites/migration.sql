-- Unified favorites: one heart concept for shows AND movies, addressed like
-- ratings (user_id, target, target_ref). Existing show hearts migrate over.

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" INTEGER NOT NULL,
    "target" "RatingTarget" NOT NULL,
    "target_ref" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","target","target_ref")
);

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data move: every show heart becomes a favorites row
INSERT INTO "favorites" ("user_id", "target", "target_ref")
SELECT "user_id", 'SHOW', "show_tmdb_id" FROM "follows" WHERE "is_favorite";

-- DropColumn
ALTER TABLE "follows" DROP COLUMN "is_favorite";
