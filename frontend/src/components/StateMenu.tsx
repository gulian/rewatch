import { useState } from 'react'

// The state button + dropdown shared by the show and movie detail pages:
// an accent-outlined button showing the current list state, opening a menu
// of states plus a "remove" row.
export default function StateMenu({
  label,
  options,
  removeLabel,
  onRemove,
}: {
  label: string
  options: { key: string; label: string; active: boolean; onSelect: () => void }[]
  removeLabel: string
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="border-accent text-accent rounded-xl border-[1.5px] px-3.5 py-2.75 text-[13px] font-bold"
      >
        {label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="bg-card absolute top-full right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-line shadow-[0_10px_30px_rgba(0,0,0,.35)]">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (!o.active) o.onSelect()
                }}
                className={`flex w-full items-center justify-between px-4 py-2.75 text-left text-[13px] ${
                  o.active ? 'text-accent font-extrabold' : 'text-text font-bold'
                }`}
              >
                {o.label}
                {o.active && <span>✓</span>}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onRemove()
              }}
              className="text-muted w-full border-t border-line px-4 py-2.75 text-left text-[13px] font-bold"
            >
              {removeLabel}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
