import { Newsletter } from "@/kit/reactions";
import { ThemePicker } from "./theme-picker";

/** The top right corner of every page: the newsletter bell, then the theme. */
export function HeaderTools() {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Newsletter />
      <ThemePicker />
    </div>
  );
}
