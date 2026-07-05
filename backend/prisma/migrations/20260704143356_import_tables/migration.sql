-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "PendingMovieKind" AS ENUM ('WATCHED', 'WATCHLIST');

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'RUNNING',
    "progress" JSONB,
    "report" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_pending_movies" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PendingMovieKind" NOT NULL,
    "watched_ats" TIMESTAMP(3)[],
    "candidates" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_pending_movies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_user_id_idx" ON "import_jobs"("user_id");

-- CreateIndex
CREATE INDEX "import_pending_movies_user_id_idx" ON "import_pending_movies"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_pending_movies_user_id_title_kind_key" ON "import_pending_movies"("user_id", "title", "kind");
