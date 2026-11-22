import type { Metadata } from "next";
import { CinemaPage } from "@/modules/cinema/cinema-page";

// The picture is the module's own, set on the dark at link-preview size and
// drawn in characters by scripts/make-og.mjs.
const picture = { url: "/og/absolute-cinema.png", width: 1200, height: 630, alt: "Absolute Cinema" };

const description = "Artifacts of nostalgia";

export const metadata: Metadata = {
  title: "Absolute Cinema",
  description,
  openGraph: {
    title: "Absolute Cinema",
    description,
    url: "/absolute-cinema",
    siteName: "Playground",
    type: "website",
    images: [picture],
  },
  twitter: {
    card: "summary_large_image",
    title: "Absolute Cinema",
    description,
    images: [picture.url],
  },
};

export default function Page() {
  return <CinemaPage />;
}
