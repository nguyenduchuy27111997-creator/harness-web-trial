"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

// Motion follows prefers-reduced-motion for everything under it (components/motion.ts).
export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
