import {
  Crown,
  Shirt,
  Compass,
  Sparkles,
  WandSparkles,
  BookOpen,
  Gift,
  Coins,
  Gem,
  ChevronRight,
  ChevronLeft,
  Check,
  Lock,
  Camera,
  Smile,
  RotateCcw,
  Volume2,
  VolumeX,
  Settings,
  X,
  Flower2,
  Heart,
  Waves,
  Snowflake,
  Castle,
  Scissors,
  Footprints,
  Feather,
  Star,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Download,
  Upload,
  Bookmark,
  Play,
  MapPin,
  Diamond,
  Palette,
  RefreshCw,
  Info,
  CheckCheck,
  type IconNode,
} from "lucide";
import type { Item } from "./simulation/data";
import { wardrobeArt } from "./wardrobe-art";
const ICONS: Record<string, IconNode> = {
  Crown,
  Shirt,
  Compass,
  Sparkles,
  WandSparkles,
  BookOpen,
  Gift,
  Coins,
  Gem,
  ChevronRight,
  ChevronLeft,
  Check,
  Lock,
  Camera,
  Smile,
  RotateCcw,
  Volume2,
  VolumeX,
  Settings,
  X,
  Flower2,
  Heart,
  Waves,
  Snowflake,
  Castle,
  Scissors,
  Footprints,
  Feather,
  Star,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Download,
  Upload,
  Bookmark,
  Play,
  MapPin,
  Diamond,
  Palette,
  RefreshCw,
  Info,
  CheckCheck,
};
const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-z])([0-9])/g, "$1-$2")
    .toLowerCase();
const markup = new Map<string, string>();
for (const [name, [, , children = []]] of Object.entries(ICONS))
  markup.set(
    kebab(name),
    children
      .map(
        ([tag, attrs]) =>
          `<${tag} ${Object.entries(attrs)
            .map(([k, v]) => `${k}="${v}"`)
            .join(" ")}/>`,
      )
      .join(""),
  );
/** Inline SVG markup, so re-rendered templates never need a DOM scan. */
export const icon = (name: string, cls = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}${cls ? ` ${cls}` : ""}" aria-hidden="true">${markup.get(name) ?? ""}</svg>`;
export function itemArt(item: Item) {
  return wardrobeArt(item);
}
