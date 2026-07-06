-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'TVTIME';

-- CreateTable
CREATE TABLE "trakt_accounts" (
    "user_id" INTEGER NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "mirror_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trakt_accounts_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "trakt_accounts" ADD CONSTRAINT "trakt_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
