import {
  createIcons,
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
} from "lucide";
import type { Item } from "./simulation/data";
export const icon = (name: string, cls = "") =>
  `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
export function icons() {
  createIcons({
    icons: {
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
    },
    attrs: { "stroke-width": 1.6 },
  });
}
export function itemArt(i: Item) {
  const c = i.color,
    a = i.accent;
  let body = "";
  switch (i.category) {
    case "dress":
      body = `<path d="M39 22l11 7 11-7 9 10-9 10 1 14 20 43Q50 111 18 99l20-43 1-14-9-10z" fill="${c}"/><path d="M39 22Q50 35 61 22L58 40H42zM38 60Q50 68 62 60l11 22Q50 94 27 82z" fill="${a}"/><path d="M38 56h24M19 98Q50 110 81 98" fill="none" stroke="#c5a66c" stroke-width="2"/><path d="M50 53l-12-5v12zM50 53l12-5v12z" fill="${a}"/><circle cx="50" cy="53" r="3" fill="#d1b06f"/>`;
      break;
    case "hair":
      body = `<path d="M25 54Q16 12 50 14Q85 12 77 59l8 36-23 4-8-34-8 34-28-4z" fill="${c}"/><ellipse cx="50" cy="52" rx="22" ry="28" fill="#ffe4d8"/><path d="M26 52Q18 14 50 15Q81 15 74 53L63 30 55 47 42 31 30 51" fill="${c}"/><path d="M30 24Q20 62 28 91M68 24Q79 62 72 91" fill="none" stroke="${a}" stroke-width="3"/>`;
      break;
    case "crown":
      body = `<path d="M17 40l18 15 15-28 15 28 18-15-8 42H25z" fill="${c}" stroke="#c9ac73" stroke-width="2"/><path d="M26 73h48" stroke="${a}" stroke-width="6"/><path d="M50 43l8 13-8 13-8-13z" fill="${a}"/><circle cx="18" cy="38" r="4" fill="#c9ac73"/><circle cx="50" cy="25" r="4" fill="#c9ac73"/><circle cx="83" cy="38" r="4" fill="#c9ac73"/>`;
      break;
    case "shoes":
      body = `<path d="M22 36h20l3 38 13 9q9 13-12 13H19l-1-16zM54 23h20l3 38 13 9q9 13-12 13H62l-10-13z" fill="${c}"/><path d="M22 43h19M56 31h16M22 82h27M63 71h19" stroke="${a}" stroke-width="5"/><path d="M33 49l-8 9 15 1zM65 39l-8 9 15 1z" fill="#d3b477"/>`;
      break;
    case "wings":
      body = `<path d="M50 60Q4 5 10 45q2 23 31 20Q5 72 24 98q15 10 26-35Q61 109 76 98q19-26-17-33 29-3 31-20Q96 5 50 60" fill="${c}" opacity=".85"/><path d="M50 64L19 35m31 29l31-29M50 64L28 89m22-25l22 25" stroke="${a}" stroke-width="2"/><ellipse cx="50" cy="62" rx="4" ry="13" fill="#cfaf72"/>`;
      break;
    case "wand":
      body = `<path d="M35 100l27-66" stroke="#d6b374" stroke-width="5"/><path d="M65 14l6 14 16 2-12 11 3 17-14-8-15 8 4-17-12-12 17-2z" fill="${c}" stroke="#c5a76a"/><path d="M53 59l-17-2 7 15 13-10 9 18 10-17z" fill="${a}"/>`;
  }
  return `<svg viewBox="0 0 100 120" aria-hidden="true" class="item-art"><defs><filter id="sh-${i.id}"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#897293" flood-opacity=".14"/></filter></defs><g filter="url(#sh-${i.id})">${body}</g></svg>`;
}
