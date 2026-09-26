import {
  Baby, CalendarDays, Drama, Image, Moon, Music, PartyPopper, Presentation, Smile, Trophy, Wrench,
} from 'lucide-react';

// Visual identity per category, used for banner placeholders and category tiles.
const STYLES = {
  music: { icon: Music, gradient: 'from-violet-600 via-fuchsia-600 to-pink-500' },
  comedy: { icon: Smile, gradient: 'from-amber-500 via-orange-500 to-rose-500' },
  sports: { icon: Trophy, gradient: 'from-emerald-500 via-teal-500 to-cyan-600' },
  theatre: { icon: Drama, gradient: 'from-rose-700 via-red-600 to-orange-500' },
  workshops: { icon: Wrench, gradient: 'from-sky-600 via-cyan-500 to-teal-400' },
  conferences: { icon: Presentation, gradient: 'from-slate-800 via-indigo-800 to-blue-600' },
  festivals: { icon: PartyPopper, gradient: 'from-yellow-500 via-orange-500 to-pink-600' },
  exhibitions: { icon: Image, gradient: 'from-stone-700 via-amber-700 to-yellow-600' },
  nightlife: { icon: Moon, gradient: 'from-indigo-950 via-purple-800 to-fuchsia-600' },
  'kids-family': { icon: Baby, gradient: 'from-lime-500 via-green-500 to-emerald-600' },
};

const FALLBACK = { icon: CalendarDays, gradient: 'from-brand-700 via-brand-600 to-fuchsia-500' };

export default function categoryStyle(slug) {
  return STYLES[slug] ?? FALLBACK;
}
