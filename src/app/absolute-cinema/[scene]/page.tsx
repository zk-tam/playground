import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CinemaPage } from "@/modules/cinema/cinema-page";
import { hasFrame, pathOf, previewOf, scenes } from "@/modules/cinema/scenes";

// One page per scene, at an address made from its title. Its own title,
// description and picture are what show when the link is shared.
export function generateStaticParams() {
  return scenes.map((scene) => ({ scene: scene.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/absolute-cinema/[scene]">): Promise<Metadata> {
  const { scene: slug } = await params;
  const scene = scenes.find((s) => s.slug === slug);
  if (!scene) return {};
  // Our own previews are cut to 1200x630; a borrowed thumbnail is whatever
  // size YouTube made it, so no size is claimed for it.
  const picture = {
    url: previewOf(scene),
    alt: scene.title,
    ...(hasFrame(scene) ? { width: 1200, height: 630 } : {}),
  };
  return {
    title: scene.title,
    description: scene.description,
    openGraph: {
      title: scene.title,
      description: scene.description,
      url: pathOf(scene),
      siteName: "Absolute Cinema",
      type: "video.other",
      images: [picture],
    },
    twitter: {
      card: "summary_large_image",
      title: scene.title,
      description: scene.description,
      images: [picture.url],
    },
  };
}

export default async function Page({ params }: PageProps<"/absolute-cinema/[scene]">) {
  const { scene: slug } = await params;
  const index = scenes.findIndex((s) => s.slug === slug);
  if (index < 0) notFound();
  return <CinemaPage start={index} />;
}
