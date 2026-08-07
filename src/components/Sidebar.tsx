"use client";

// The sidebar, for all three roles.
//
// One component, three appearances. The teacher's is a dark rail — the single
// strongest role signal in the redesign — over 31 items in seven collapsible
// groups; the family rails are light and flat. What differs is entirely token
// values and whether there is more than one group, so there is one
// implementation rather than three that drift.
//
// TEACHER: 31 links is too many to scan, so the groups collapse and only one
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
//
// FAMILIES: ten items and eight items respectively, flat. Grouping them would
// add a click to reach things a parent opens weekly, and the accordion only
// earns its complexity at the teacher's scale.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { isActive, groupForPath, pinnedItems, MAX_PINS, type NavGroup } from "@/lib/nav";
import { toggleNavPin } from "@/app/(teacher)/actions";

export function Sidebar({
  nav,
  schoolName,
  subline,
  logoSrc,
  userName,
  pins = [],
  pinnable = false,
  messagesUnread = 0,
  notificationsUnread = 0,
  messagesHref = "/messages",
  notificationsHref = "/notifications",
}: {
  nav: NavGroup[];
  schoolName: string;
  /** Second line under the wordmark — "Cedar Grove · AZ ESA" for a teacher. */
  subline: string;
  /** data: URI for the school's logo, or null. */
  logoSrc?: string | null;
  userName: string;
  pins?: string[];
  /** Pinning is a teacher affordance; the family navs are short enough not to
   *  need it, and User.pinnedNav validates against the teacher registry. */
  pinnable?: boolean;
  messagesUnread?: number;
  notificationsUnread?: number;
  messagesHref?: string;
  notificationsHref?: string;
}) {
  const pathname = usePathname();
  const grouped = nav.length > 1;
  const activeGroup = grouped ? groupForPath(pathname, nav) : null;
  // Only the current group starts open. A route that isn't in the nav (an
  // invoice detail, say) resolves to null, and then nothing is forced open
  // rather than everything being slammed shut.
  const [open, setOpen] = useState<string | null>(activeGroup);
  const [editing, setEditing] = useState(false);

  const pinned = pinnable ? pinnedItems(pins, nav) : [];
  const pinnedSet = new Set(pins);
  const badge = (href: string) =>
    href === messagesHref ? messagesUnread : href === notificationsHref ? notificationsUnread : 0;

  function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
    const n = badge(href);
    const on = isActive(href, pathname);
    return (
      <Link href={href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
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
    <nav className="side" aria-label="Main">
      {/* The mark carries the school's logo when one is uploaded, and falls back
          to Cohort's "C". The wordmark stays Cohort with the school beneath —
          the printed packet is the artifact that leads with the school (8.5);
          in the app the person already knows whose school it is. */}
      <div className="brand">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="brand-logo" src={logoSrc} alt="" />
        ) : (
          <div className="brand-mark">C</div>
        )}
        <div>
          <div className="brand-name">Cohort</div>
          <div className="brand-sub">{subline || schoolName}</div>
        </div>
      </div>

      <div className="navscroll">
        {pinned.length > 0 && (
        <div className="pinned">
          {pinned.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </div>
        )}

        {grouped ? (
        nav.map((section) => {
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
        })
      ) : (
        <div className="navflat">
          {nav[0]?.items.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </div>
      )}
      </div>

      <div className="foot">
        {pinnable && (
          <>
            <button type="button" className="customise" onClick={() => setEditing((v) => !v)}>
              {editing ? "Done" : "Customise"}
            </button>
            {editing && (
              <div className="small" style={{ margin: "6px 0 10px", opacity: 0.75, lineHeight: 1.5 }}>
                Star anything to keep it at the top. Up to {MAX_PINS}.
              </div>
            )}
          </>
        )}
        <div className="footname">{userName}</div>
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
