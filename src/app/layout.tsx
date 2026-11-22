import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Backdrop } from "@/components/backdrop";
import { Dock } from "@/components/dock";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  display: "swap",
});

// Link previews need full addresses for their pictures. Set
// NEXT_PUBLIC_SITE_URL to the site's real address when it goes live.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Playground", template: "%s · Playground" },
  description: "Be Opinionated.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Runs before first paint so the stored theme never flashes.
const themeScript = `try{var t=localStorage.getItem("theme");if(["light","dark","blueprint"].indexOf(t)<0)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

// This site registers no service worker. If one is found, it was left on this
// address by some other project, and it will keep serving old copies of our
// files. Remove it, say so, and reload once so the page starts clean.
const cleanupScript = `try{if("serviceWorker"in navigator)navigator.serviceWorker.getRegistrations().then(function(r){if(!r.length)return;Promise.all(r.map(function(x){return x.unregister()})).then(function(){if(self.caches)caches.keys().then(function(k){k.forEach(function(n){caches.delete(n)})});console.warn("[playground] removed "+r.length+" leftover service worker(s) from this address");if(!sessionStorage.getItem("sw-cleared")){sessionStorage.setItem("sw-cleared","1");location.reload()}})})}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${plex.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={themeScript} />
        <InlineScript html={cleanupScript} />
      </head>
      <body className="min-h-dvh font-sans text-[14px] leading-[22px]">
        <Backdrop />
        {children}
        <Dock />
        {/* Page views, counted by Vercel once the site is hosted there. It
            sends nothing while developing. */}
        <Analytics />
      </body>
    </html>
  );
}
