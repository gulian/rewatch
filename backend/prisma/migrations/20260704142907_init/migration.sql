-- CreateEnum
CREATE TYPE "FollowState" AS ENUM ('WATCHING', 'ARCHIVED', 'FOR_LATER');

-- CreateEnum
CREATE TYPE "RatingTarget" AS ENUM ('SHOW', 'MOVIE', 'EPISODE');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shows" (
    "tmdb_id" INTEGER NOT NULL,
    "tvdb_id" INTEGER,
    "name" TEXT NOT NULL,
    "poster_path" TEXT,
    "backdrop_path" TEXT,
    "overview" TEXT,
    "genres" TEXT[],
    "status" TEXT,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shows_pkey" PRIMARY KEY ("tmdb_id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" SERIAL NOT NULL,
    "show_tmdb_id" INTEGER NOT NULL,
    "tmdb_id" INTEGER,
    "season" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "air_date" DATE,
    "runtime" INTEGER,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movies" (
    "tmdb_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster_path" TEXT,
    "backdrop_path" TEXT,
    "overview" TEXT,
    "genres" TEXT[],
    "release_date" DATE,
    "runtime" INTEGER,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("tmdb_id")
);

-- CreateTable
CREATE TABLE "follows" (
    "user_id" INTEGER NOT NULL,
    "show_tmdb_id" INTEGER NOT NULL,
    "state" "FollowState" NOT NULL DEFAULT 'WATCHING',
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "followed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("user_id","show_tmdb_id")
);

-- CreateTable
CREATE TABLE "watch_events" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "episode_id" INTEGER,
    "movie_id" INTEGER,
    "watched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_watchlist" (
    "user_id" INTEGER NOT NULL,
    "movie_tmdb_id" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movie_watchlist_pkey" PRIMARY KEY ("user_id","movie_tmdb_id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "user_id" INTEGER NOT NULL,
    "target" "RatingTarget" NOT NULL,
    "target_ref" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "rated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("user_id","target","target_ref")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shows_tvdb_id_key" ON "shows"("tvdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_tmdb_id_key" ON "episodes"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_show_tmdb_id_season_number_key" ON "episodes"("show_tmdb_id", "season", "number");

-- CreateIndex
CREATE INDEX "watch_events_user_id_watched_at_idx" ON "watch_events"("user_id", "watched_at");

-- CreateIndex
CREATE UNIQUE INDEX "watch_events_user_id_episode_id_watched_at_key" ON "watch_events"("user_id", "episode_id", "watched_at");

-- CreateIndex
CREATE UNIQUE INDEX "watch_events_user_id_movie_id_watched_at_key" ON "watch_events"("user_id", "movie_id", "watched_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_show_tmdb_id_fkey" FOREIGN KEY ("show_tmdb_id") REFERENCES "shows"("tmdb_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_show_tmdb_id_fkey" FOREIGN KEY ("show_tmdb_id") REFERENCES "shows"("tmdb_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("tmdb_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_watchlist" ADD CONSTRAINT "movie_watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_watchlist" ADD CONSTRAINT "movie_watchlist_movie_tmdb_id_fkey" FOREIGN KEY ("movie_tmdb_id") REFERENCES "movies"("tmdb_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
