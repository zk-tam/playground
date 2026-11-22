import { HeaderTools } from "@/components/header-tools";
import { Cinema } from "./cinema";
import { scenes } from "./scenes";

/** The Absolute Cinema page, opened on one of its scenes. */
export function CinemaPage({ start = 0 }: { start?: number }) {
  return (
    <main className="mx-auto w-full max-w-[720px] px-5 pt-8 pb-36 sm:pt-12">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-medium">Absolute Cinema</h1>
          <p className="text-muted">{scenes.length} scenes</p>
        </div>
        <HeaderTools />
      </header>

      <div className="mt-8">
        <Cinema start={start} />
      </div>
    </main>
  );
}
