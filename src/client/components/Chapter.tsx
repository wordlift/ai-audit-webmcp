import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * One step of the report's journey. Chapters enter in reading order with a small staggered
 * reveal — pure CSS, disabled under prefers-reduced-motion — so the map unfolds instead of
 * landing all at once.
 */
export function Chapter({
  id,
  step,
  title,
  lede,
  children,
}: {
  id: string;
  step: number;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="chapter"
      style={{ "--chapter-delay": `${(step - 1) * 140}ms` } as CSSProperties}
      aria-labelledby={`${id}-title`}
    >
      <header className="chapter-head">
        <span className="chapter-step" aria-hidden="true">{step}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {lede && <p>{lede}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export interface ChapterSpec {
  id: string;
  label: string;
}

/** The journey at a glance: five steps, the current one highlighted, each a jump target. */
export function JourneyRail({ chapters }: { chapters: ChapterSpec[] }) {
  const [active, setActive] = useState(chapters[0]?.id ?? "");
  const key = chapters.map((chapter) => chapter.id).join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    for (const chapter of chapters) {
      const node = document.getElementById(chapter.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <nav className="journey-rail" aria-label="Report journey">
      {chapters.map((chapter, index) => (
        <button
          key={chapter.id}
          type="button"
          className={active === chapter.id ? "active" : ""}
          aria-current={active === chapter.id ? "true" : undefined}
          onClick={() => document.getElementById(chapter.id)?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
        >
          <i aria-hidden="true">{index + 1}</i>
          <span>{chapter.label}</span>
        </button>
      ))}
    </nav>
  );
}
