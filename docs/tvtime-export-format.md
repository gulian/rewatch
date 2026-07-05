# TV Time GDPR export format

Notes from reverse-engineering real exports (July 2026), for anyone maintaining the importer in `backend/src/lib/tvtime.ts`.

The export is a zip of ~50 CSV files. Only five matter.

## `tracking-prod-records-v2.csv` — source of truth for episodes

One row per event, discriminated by the `key` column prefix:

| `key` prefix | Meaning | Useful columns |
|---|---|---|
| `watch-episode` | One episode viewing | `s_id` (TheTVDB show id), `season_number`, `episode_number`, `created_at` (watch datetime, UTC), `series_name` |
| `rewatch-episode` | Same, for rewatches | same |
| `user-series` | Per-show metadata | `s_id`, `series_name`, `is_followed`, `is_archived`, `is_for_later`, `created_at` (follow date) |

Fields with commas are properly quoted; a standard CSV parser handles the file.

## `tracking-prod-records.csv` (v1) — source of truth for movies

Episodes also appear here but the v2 file is more complete; use v1 **only for movies**:

- `type=watch` + `entity_type=movie`: a watched movie. Only `movie_name` and `created_at` are usable. Movies are keyed by internal TV Time UUIDs with **no external id** and no reliable release date (`0001-01-01`), so matching against TMDB has to happen by title.
- `type=towatch` + `entity_type=movie`: the movie watchlist.

## `tv_show_rate.csv`

Show ratings, 1-5 scale: `tv_show_id` (TheTVDB), `rating`, `created_at`.

## `user_tv_show_data.csv`

Per-show flags; `is_favorited` is the one worth importing.

## `user_statistics.csv`

`time_spent` (minutes) makes a good sanity check after an import, keeping in mind TMDB runtimes differ from TheTVDB's, so totals won't match exactly.

## Gotchas learned the hard way

- **Legacy TheTVDB ids**: some `s_id` values are old TheTVDB ids that TMDB's `/find` endpoint doesn't know (TheTVDB series and episode id spaces overlap; `/find` may return an unrelated episode). Fallback: search TMDB by `series_name` with exact normalized-title matching, then retry with any `(YYYY)` suffix stripped.
- **Shows with empty names**: exports can contain shows TV Time itself had lost (no name in any CSV). Nothing can be done with those; report them.
- **Movie titles come in their original language** (Japanese, Korean originals included). TMDB title search handles them well.
- **Duplicate titles across remakes** resolve to the most relevant TMDB result; a manual resolution queue catches the rest.
