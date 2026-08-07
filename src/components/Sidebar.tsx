"use client";

// Teacher console sidebar.
//
// Thirty-two links is too many to scan, so the groups collapse and only one
// stays open at a time. Two things make that not annoying:
//
//   1. The group holding the current page opens on load, so you never arrive
//      somewhere and have to hunt for where you are.
//   2. A pinned row sits above the groups and never collapses, so the morning
//      routine — attendance, grading, invoices — stays one click even though
//      those live in three different groups. Without it, an exclusive accordion
//      would make the most common path the slowest one.
//
// Teachers choose what is pinned; they do not rename or reorder groups. The
// reasoning for that line is at the top of src/lib/nav.ts.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { TEACHER_NAV, isActive, groupForPath, pinnedItems, MAX_PINS } from "@/lib/nav";
import { toggleNavPin } from "@/app/(teacher)/actions";

export function Sidebar({
  schoolName,
  schoolState,
  railLabel,
  userName,
  pins = [],
  messagesUnread = 0,
  notificationsUnread = 0,
}: {
  schoolName: string;
  schoolState: string;
  railLabel: string;
  userName: string;
  pins?: string[];
  messagesUnread?: number;
  notificationsUnread?: number;
}) {
  const pathname = usePathname();
  const activeGroup = groupForPath(pathname);
  // Only the current group starts open. A route that isn't in the nav (an
  // invoice detail, say) resolves to null, and then nothing is forced open
  // rather than everything being slammed shut.
  const [open, setOpen] = useState<string | null>(activeGroup);
  const [editing, setEditing] = useState(false);

  const pinned = pinnedItems(pins);
  const pinnedSet = new Set(pins);
  const badge = (href: string) =>
    href === "/messages" ? messagesUnread : href === "/notifications" ? notificationsUnread : 0;

  function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
    const n = badge(href);
    return (
      <Link href={href} className={isActive(href, pathname) ? "on" : ""}>
        <Icon name={icon} />
        <span style={{ flex: 1 }}>{label}</span>
        {n > 0 && <span className="nav-badge">{n}</span>}
      </Link>
    );
  }

  function PinButton({ href }: { href: string }) {
    const isPinned = pinnedSet.has(href);
    const full = !isPinned && pins.length >= MAX_PINS;
    return (
      <form action={toggleNavPin} className="pinform">
        <input type="hidden" name="href" value={href} />
        <input type="hidden" name="back" value={pathname} />
        <button
          type="submit"
          className={`pinbtn ${isPinned ? "on" : ""}`}
          disabled={full}
          title={full ? `Pinned row is full (${MAX_PINS} max)` : isPinned ? "Unpin" : "Pin to the top"}
          aria-label={`${isPinned ? "Unpin" : "Pin"} ${href}`}
        >
          {isPinned ? "★" : "☆"}
        </button>
      </form>
    );
  }

  const Row = ({ item }: { item: { href: string; label: string; icon: string } }) =>
    editing ? (
      <div className="navrow">
        <NavLink {...item} />
        <PinButton href={item.href} />
      </div>
    ) : (
      <NavLink {...item} />
    );

  return (
    <nav className="side">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div className="brand-name">Cohort</div>
      </div>
      <div className="schoolname">
        {schoolName}
        <br />
        {schoolState} &middot; {railLabel}
      </div>

      {pinned.length > 0 && (
        <div className="pinned">
          {pinned.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </div>
      )}

      {TEACHER_NAV.map((section) => {
        const isOpen = open === section.group;
        const holdsActive = section.group === activeGroup;
        return (
          <div key={section.group} className="navgroup-wrap">
            <button
              type="button"
              className={`navgroup-btn ${isOpen ? "open" : ""} ${holdsActive && !isOpen ? "holds" : ""}`}
              onClick={() => setOpen(isOpen ? null : section.group)}
              aria-expanded={isOpen}
            >
              <span className="caret" aria-hidden>
                {isOpen ? "▾" : "▸"}
              </span>
              <span style={{ flex: 1 }}>{section.group}</span>
              <span className="navcount">{section.items.length}</span>
            </button>
            {isOpen && (
              <div className="navgroup-items">
                {section.items.map((item) => (
                  <Row key={item.href} item={item} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="foot">
        <button type="button" className="customise" onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Customise"}
        </button>
        {editing && (
          <div className="small" style={{ margin: "6px 0 10px", opacity: 0.75, lineHeight: 1.5 }}>
            Star anything to keep it at the top. Up to {MAX_PINS}.
          </div>
        )}
        {userName}
        <br />
        {/* A form, not a link: signing out is destructive, so it must not be
            reachable by a prefetch, a preload, or a stray GET. */}
        <form method="post" action="/logout">
          <button type="submit" className="signout">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
