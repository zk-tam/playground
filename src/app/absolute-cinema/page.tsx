import type { Metadata } from "next";
import { CinemaPage } from "@/modules/cinema/cinema-page";

const picture = { url: "/modules/absolute-cinema.png", width: 860, height: 705 };

export const metadata: Metadata = {
  title: "Absolute Cinema",
  description: "Be Opinionated.",
  openGraph: { title: "Absolute Cinema", description: "Be Opinionated.", images: [picture] },
  twitter: { card: "summary_large_image", images: [picture.url] },
};

export default function Page() {
  return <CinemaPage />;
}
