/**
 * Ordered-dither backdrops, all produced by the same CLI that made the Invaro
 * landing page's particle field:
 *
 *   node scripts/dither.mjs public/bg-birds.png     --color <tone> --max 0.85 --curve 3.4
 *   node scripts/dither.mjs public/assistant-bg.png --color <tone> --max 0.62 --curve 5.0
 *
 * Two source artworks (`birds`, the egrets over the river; `smoke`, the
 * marbled nebula) crossed with two tones: violet #6B5CE7 up top, jade #12866C
 * further down the page.
 *
 * Painted as a background at natural size and never scaled: resampling an 8×8
 * Bayer grid moirés into blotches. `placement` picks the mask that keeps the
 * field off whatever text sits on top of it.
 */

const ART = {
  birds: { violet: "/dither-birds-violet.png", jade: "/dither-birds-jade.png", size: "2000px 1125px" },
  smoke: { violet: "/dither-smoke-violet.png", jade: "/dither-smoke-jade.png", size: "1400px 850px" },
} as const;

const PLACEMENT = {
  /** Full-height hero: an ellipse cleared under the headline, dissolving down. */
  hero: {
    mask: "radial-gradient(56% 44% at 50% 48%, transparent 6%, #000 96%), linear-gradient(to bottom, #000 0%, #000 58%, transparent 97%)",
    position: "center 15%",
    opacity: "opacity-[0.4] sm:opacity-[0.6] dark:opacity-[0.24] dark:sm:opacity-[0.32]",
  },
  /** Rises from the bottom edge of a block. */
  band: {
    mask: "linear-gradient(to top, #000 10%, transparent 82%)",
    position: "center bottom",
    opacity: "opacity-[0.34] dark:opacity-[0.22]",
  },
  /** Falls from the top edge, pairing with `band` on the section above. */
  crown: {
    mask: "linear-gradient(to bottom, #000 4%, transparent 76%)",
    position: "center top",
    opacity: "opacity-[0.3] dark:opacity-[0.2]",
  },
  /** Hugs the left and right margins, leaving centered copy untouched. */
  margins: {
    mask: "radial-gradient(58% 78% at 50% 50%, transparent 30%, #000 90%)",
    position: "center",
    opacity: "opacity-[0.5] dark:opacity-[0.3]",
  },
} as const;

export function DitherField({
  art = "birds",
  tone = "violet",
  placement = "band",
  className = "",
}: {
  art?: keyof typeof ART;
  tone?: "violet" | "jade";
  placement?: keyof typeof PLACEMENT;
  className?: string;
}) {
  const a = ART[art];
  const p = PLACEMENT[placement];
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${p.opacity} ${className}`}
      style={{
        backgroundImage: `url(${a[tone]})`,
        backgroundSize: a.size,
        backgroundPosition: p.position,
        backgroundRepeat: "no-repeat",
        maskImage: p.mask,
        WebkitMaskImage: p.mask,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    />
  );
}
