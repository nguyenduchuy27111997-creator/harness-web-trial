// The app's motion, in one place (docs/ui-guide.md): short springs like Apple's, for the Motion library
// (`import { motion } from "motion/react"`). Animate opacity and transform only, to show what changed or where
// something came from; never to decorate. Motion follows prefers-reduced-motion through <MotionConfig
// reducedMotion="user"> in a client provider around the app; CSS transitions follow it through app/ui-base.css.

// Most state changes: a row appearing, a panel opening, a badge changing. No bounce, like Apple's .smooth.
export const spring = { type: "spring", visualDuration: 0.35, bounce: 0 } as const;
// Small direct feedback: a press, a toggle, a checkmark.
export const quick = { type: "spring", visualDuration: 0.25, bounce: 0.15 } as const;
// Large surfaces: a sheet or dialog sliding in, a page-level layout change. Never bounce these.
export const gentle = { type: "spring", visualDuration: 0.45, bounce: 0 } as const;

// A list item entering or leaving (inside <AnimatePresence>): <motion.li {...appear}>.
export const appear = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: spring,
} as const;
