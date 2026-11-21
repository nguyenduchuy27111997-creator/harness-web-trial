# 0033: MotionConfig inside each animating component, not the root layout

Date: 2026-11-22. Feature: F095.

## Context
Design M9 put `components/providers.tsx` (`MotionConfig reducedMotion="user"`) in `app/layout.tsx`. That put Motion's client chunk (about 9 KB gzipped) on every page. In CI, Lighthouse then measured `/styleguide` at an LCP of 2.6 to 3.1 s, against the 2.5 s budget in `lighthouserc.cjs`. `/styleguide` changed in no other way.

## Decision
Remove `components/providers.tsx` and its wrap in the root layout. `BookList`, `BookStatusForm` and `RatingForm` each render their own `<MotionConfig reducedMotion="user">`, which are the only components that use Motion.

## Consequences
Reduced motion behaves the same, because every motion element is under one of these configs. Pages that do not animate no longer load Motion. A new component that uses Motion must wrap itself the same way.
