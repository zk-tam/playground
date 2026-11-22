import type { Metadata } from "next";
import Link from "next/link";
import { HeaderTools } from "@/components/header-tools";
import { AsciiFrame } from "@/kit/ascii-frame";
import { modules } from "@/modules/registry";

// What a link to the site itself shows when it is shared. The picture is made
// by scripts/make-og.mjs.
const picture = { url: "/og/home.png", width: 1200, height: 630, alt: "Be Opinionated." };

export const metadata: Metadata = {
  openGraph: {
    title: "Playground",
    description: "Be Opinionated.",
    url: "/",
    siteName: "Playground",
    type: "website",
    images: [picture],
  },
  twitter: {
    card: "summary_large_image",
    title: "Playground",
    description: "Be Opinionated.",
    images: [picture.url],
  },
};

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-[640px] px-5 pt-8 pb-36 sm:pt-12">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-medium">Playground</h1>
          <p className="text-muted">Be Opinionated.</p>
        </div>
        <HeaderTools />
      </header>

      <ul className="mt-10 grid gap-3">
        {modules.map((module) => (
          <li key={module.slug}>
            {/* Not a card: the picture is printed on the page itself, in the
                theme's ink, with its name under it like a caption. */}
            <Link
              href={`/${module.slug}`}
              className="group block rounded-[24px] transition-[scale] duration-500 ease-spring-soft active:scale-[0.99]"
            >
              <div style={{ aspectRatio: module.ratio }}>
                <AsciiFrame ink src={module.cover} alt="" className="size-full" />
              </div>
              <p className="mt-2 text-center font-medium">{module.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
