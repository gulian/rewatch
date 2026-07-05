// One-off: backfill fr/en translations for already-cached shows and movies.
// Idempotent (upserts) — safe to re-run after a failure.
import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { cacheShowTranslations, cacheMovie, LANGS } from '../lib/catalog.js'

const shows = await prisma.show.findMany({
  select: { tmdbId: true, name: true, translations: { select: { lang: true } } },
})
const movies = await prisma.movie.findMany({
  select: { tmdbId: true, title: true, translations: { select: { lang: true } } },
})

let done = 0
for (const show of shows) {
  if (show.translations.length === LANGS.length) continue // already complete
  try {
    await cacheShowTranslations(show.tmdbId)
  } catch (err) {
    console.error(`show ${show.tmdbId} (${show.name}) failed:`, (err as Error).message)
  }
  done++
  if (done % 20 === 0) console.log(`shows: ${done}`)
}
console.log(`shows backfilled: ${done}/${shows.length}`)

done = 0
for (const movie of movies) {
  if (movie.translations.length === LANGS.length) continue
  try {
    await cacheMovie(movie.tmdbId) // refreshes base + both translations
  } catch (err) {
    console.error(`movie ${movie.tmdbId} (${movie.title}) failed:`, (err as Error).message)
  }
  done++
}
console.log(`movies backfilled: ${done}/${movies.length}`)
await prisma.$disconnect()
