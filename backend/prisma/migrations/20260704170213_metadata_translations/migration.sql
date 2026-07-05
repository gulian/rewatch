-- CreateTable
CREATE TABLE "show_translations" (
    "show_tmdb_id" INTEGER NOT NULL,
    "lang" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "overview" TEXT,
    "genres" TEXT[],

    CONSTRAINT "show_translations_pkey" PRIMARY KEY ("show_tmdb_id","lang")
);

-- CreateTable
CREATE TABLE "episode_translations" (
    "episode_id" INTEGER NOT NULL,
    "lang" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "episode_translations_pkey" PRIMARY KEY ("episode_id","lang")
);

-- CreateTable
CREATE TABLE "movie_translations" (
    "movie_tmdb_id" INTEGER NOT NULL,
    "lang" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "overview" TEXT,
    "genres" TEXT[],

    CONSTRAINT "movie_translations_pkey" PRIMARY KEY ("movie_tmdb_id","lang")
);

-- AddForeignKey
ALTER TABLE "show_translations" ADD CONSTRAINT "show_translations_show_tmdb_id_fkey" FOREIGN KEY ("show_tmdb_id") REFERENCES "shows"("tmdb_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_translations" ADD CONSTRAINT "episode_translations_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_translations" ADD CONSTRAINT "movie_translations_movie_tmdb_id_fkey" FOREIGN KEY ("movie_tmdb_id") REFERENCES "movies"("tmdb_id") ON DELETE CASCADE ON UPDATE CASCADE;
