/**
 * A line of text that arrives a word at a time, each out of a blur. Give it a
 * `key` that changes with the text and it plays again.
 */
export function Words({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  /** Seconds before the first word. */
  delay?: number;
}) {
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span
          key={i}
          aria-hidden
          style={{ animationDelay: `${delay + i * 0.07}s` }}
          className="inline-block animate-word-in whitespace-pre"
        >
          {word}{" "}
        </span>
      ))}
    </span>
  );
}
