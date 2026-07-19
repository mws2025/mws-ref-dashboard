"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { navigationLinks, externalLinks } from "./nav-links"

export function MobileNav({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <div className={cn("relative md:hidden", className)}>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-cream relative z-50 flex size-10 items-center justify-center rounded-md transition-opacity hover:opacity-80"
      >
        {open ? <X className="size-6" /> : <Menu className="size-6" />}
      </button>

      {open && (
        <>
          {/* click-away layer — keeps the menu a small dropdown, not fullscreen */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="bg-caramel absolute right-0 z-50 mt-3 w-52 rounded-xl p-2 shadow-lg">
            <nav className="flex flex-col">
              {navigationLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={close}
                  className="text-cream hover:text-strawberry rounded-md px-3 py-2"
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="bg-cream/20 mx-3 my-2 h-px" />

            <div className="flex items-center gap-1 px-2 pb-1">
              {externalLinks.map(({ href, label, icon }) => (
                <Link
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  onClick={close}
                  className="flex size-9 items-center justify-center rounded-full transition-transform hover:scale-110 hover:opacity-80"
                >
                  <Image
                    src={icon}
                    alt=""
                    width={48}
                    height={48}
                    className="size-8 h-auto w-auto"
                  />
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
