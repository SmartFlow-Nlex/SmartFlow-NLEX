import type { ElementType } from "react";

/**
 * A display title that blurs up letter by letter, once, when it mounts.
 *
 * The characters are split by React, never by touching innerHTML. The element
 * carries the whole title as its accessible name and the per-letter spans are
 * aria-hidden, so a screen reader hears one word, not a spelling. Words are
 * kept whole so a title wraps between words only. The motion itself is CSS
 * (`.tr-char`), cancelled under prefers-reduced-motion.
 */
export default function TitleReveal({
  text,
  as: Tag = "h1",
  className,
  id,
  delay = 0,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** Seconds before the first letter moves. */
  delay?: number;
}) {
  let index = 0;
  const words = text.split(" ");
  return (
    <Tag className={className ? `tr-title ${className}` : "tr-title"} aria-label={text} id={id}>
      {words.map((word, w) => (
        <span key={w} className="tr-word" aria-hidden="true">
          {Array.from(word).map((ch, c) => {
            const i = index++;
            return (
              <span key={c} className="tr-char" style={{ animationDelay: `${delay + i * 0.035}s` }}>
                {ch}
              </span>
            );
          })}
          {w < words.length - 1 ? <span className="tr-space"> </span> : null}
        </span>
      ))}
    </Tag>
  );
}
