"use client";

/**
 * A script that must run before the page paints, such as the one that applies
 * the saved theme. The browser runs it while reading the server's HTML. When
 * React later draws the same tag on the client it is marked as plain text, so
 * it is not run twice and React does not warn about it.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
