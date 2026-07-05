import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './client'
import type {
  AdminOverview,
  AdminSetting,
  AdminUser,
  CalendarEpisode,
  ImportJob,
  LibraryShow,
  Movie,
  MovieUser,
  PendingMovie,
  SearchResult,
  ShowDetail,
  ShowUser,
  Stats,
  User,
  Watchlist,
} from './types'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/api/auth/me'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    staleTime: 5 * 60 * 1000,
  })
}

export const useWatchlist = () =>
  useQuery({ queryKey: ['watchlist'], queryFn: () => api.get<Watchlist>('/api/watchlist') })

export const useCalendar = () =>
  useQuery({ queryKey: ['calendar'], queryFn: () => api.get<CalendarEpisode[]>('/api/calendar?days=60') })

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    placeholderData: (prev) => prev,
  })

export const useLibrary = () =>
  useQuery({ queryKey: ['library'], queryFn: () => api.get<LibraryShow[]>('/api/library/shows') })

export const useShow = (id: number) =>
  useQuery({ queryKey: ['show', id], queryFn: () => api.get<ShowDetail>(`/api/shows/${id}`) })

export const useShowUser = (id: number) =>
  useQuery({ queryKey: ['show-user', id], queryFn: () => api.get<ShowUser>(`/api/shows/${id}/user`) })

export const useMovie = (id: number) =>
  useQuery({ queryKey: ['movie', id], queryFn: () => api.get<Movie>(`/api/movies/${id}`) })

export const useMovieUser = (id: number) =>
  useQuery({ queryKey: ['movie-user', id], queryFn: () => api.get<MovieUser>(`/api/movies/${id}/user`) })

export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/api/stats') })

export const usePending = () =>
  useQuery({ queryKey: ['pending'], queryFn: () => api.get<PendingMovie[]>('/api/import/pending') })

export const useImportJob = (id: number | null) =>
  useQuery({
    queryKey: ['import-job', id],
    queryFn: () => api.get<ImportJob>(`/api/import/jobs/${id}`),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' || !query.state.data ? 2000 : false),
  })

export const useAdminOverview = () =>
  useQuery({ queryKey: ['admin-overview'], queryFn: () => api.get<AdminOverview>('/api/admin/overview') })

export const useSetupStatus = () =>
  useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get<{ needsSetup: boolean }>('/api/setup-status'),
    staleTime: 60_000,
  })

// Home instances leave both fields empty: the legal page and its links
// only exist once the operator fills them in.
export const useLegalInfo = () =>
  useQuery({
    queryKey: ['legal-info'],
    queryFn: () => api.get<{ host: string | null; contact: string | null }>('/api/legal-info'),
    staleTime: Infinity,
  })

export const useAdminSettings = () =>
  useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<AdminSetting[]>('/api/admin/settings') })

export const useAdminUsers = () =>
  useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<AdminUser[]>('/api/admin/users') })

/** Generic mutation: invalidates user-dependent caches after a write. */
export function useTracking() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        ['watchlist', 'calendar', 'library', 'stats', 'show-user', 'movie-user', 'pending'].includes(
          q.queryKey[0] as string,
        ),
    })
  return useMutation({
    mutationFn: ({ method, path, body }: { method: 'post' | 'put' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      api[method]<unknown>(path, body),
    onSettled: invalidate,
  })
}
