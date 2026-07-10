---
name: apple-uxui-engineer
description: Apple's UI/UX design philosophy (clarity, deference, depth, and obsessive craft), drawn from the Human Interface Guidelines. Use this skill for ANY work that produces or changes what a user sees or touches; designing or reviewing screens, components, layouts, dashboards, forms, landing pages, empty/loading/error states, choosing typography, spacing, color, motion, dark mode, or accessibility behavior. Trigger whenever the user asks to design, build, restyle, polish, or critique UI, or says things like "make it clean", "make it feel premium", "Apple-like", "minimal", "HIG", or "this looks off", in any framework (React, SwiftUI, HTML/CSS, or mockups).
---

# Apple UX/UI Engineer

Apply these principles as the default standard for all interface work. They are deliberately general: when a project's recorded decision (a design spec or ADR) deviates from them, follow the recorded decision, but a deviation that isn't recorded is a gap, not a decision. Propose recording it when you need to deviate.

## The philosophy

Three ideas govern everything, in tension and in order:

1. **Clarity.** The user's content and task are legible at every size, in every state. Text is readable, icons are precise, functionality is obvious. When clarity fights any other value, clarity wins.
2. **Deference.** The interface serves the content; it never competes with it. Chrome recedes: the design budget goes into typography, spacing, and hierarchy rather than decoration. If an element doesn't help the user understand or act, it's noise; remove it.
3. **Depth.** Visual layers and realistic motion convey hierarchy and place. Users always know where they are, how they got there, and how to get back.

The test for every screen: *does it feel inevitable, as if it couldn't have been designed any other way?* Inevitability comes from restraint plus consistency, not from novelty. When in doubt, remove things until the design breaks, then add the last one back.

## Typography carries the interface

- **Build a fixed type scale and never freestyle sizes.** A working scale has 6–9 steps (e.g., 11/13/15/17/20/22/28/34); every text element maps to a step. Hierarchy comes from **weight and size together**: at most two weights per screen (typically regular + semibold); if you need a third, the hierarchy is confused, not underdressed.
- **Numbers that align vertically use tabular figures** (`font-variant-numeric: tabular-nums`), non-negotiable in tables, timers, and dashboards, where proportional figures make columns shimmer.
- **Tune tracking at the extremes:** slightly negative (≈ −0.02em) on large display text, slightly positive (≈ +0.01em) on small captions. Body line-height ≈ 1.5; tight (≈ 1.1–1.2) on big display numbers.
- **Respect the platform's text-size settings** (Dynamic Type / browser font scaling): layouts must survive ~130% text scale without truncation or overlap. Truncation of user content is a design failure; wrap or re-layout instead.

## Layout and spacing

- **Use a spacing scale, religiously.** Pick steps (e.g., 4/8/12/16/20/24/32/40/48/64) and use nothing between them. Whitespace *is* the information hierarchy: related items sit tightly together, groups separate generously. If you need borders and boxes to show grouping, the spacing has failed first.
- **Align to a grid and to each other.** Misalignment of even 1–2px reads as sloppiness before the user can articulate why. Optical alignment beats mathematical alignment where they conflict (icons and text baselines especially).
- **Touch targets ≥ 44×44pt**, always, even when the visible glyph is smaller; pad the hit area.
- **One primary action per screen.** It's visually unmistakable; everything else is subordinate. Screens with three competing accented buttons have decided nothing.

## Color is meaning, not decoration

- **Neutrals dominate; one accent.** A restrained near-monochrome base with a single accent color for interactive elements teaches users that "color = tappable/meaningful." Semantic colors (green = good, orange = caution, red = problem) are reserved exclusively for semantics, never used decoratively, and never the only channel (pair with text or iconography for color-blind users).
- **Design dark mode, don't invert it.** Dark surfaces are elevated grays (e.g., the #1C1C1E family), never pure-black cards on pure black; shadows give way to surface lightness as the elevation cue; colors re-derived for dark backgrounds (slightly desaturated, higher luminance). Both modes ship from day one or the second one will always feel bolted on.
- **Contrast is a floor, not a goal:** WCAG AA minimum (4.5:1 body, 3:1 large text) verified mechanically, not by eye.

## Motion has a job

- Animation exists to explain: where something came from, where it went, what just changed. If a transition doesn't communicate spatial or causal structure, cut it.
- **Springs, not linear eases** (`cubic-bezier(0.2, 0.8, 0.2, 1)` territory), 200–350ms. Detail views emerge from the element that summoned them and return there on dismissal; spatial continuity is how users build a mental map.
- Subtle feedback on interaction (press states ~0.97 scale, immediate highlight) makes the interface feel physical. Celebrate nothing: entrance flourishes run once, never on every data update; updates should feel instant, not theatrical.
- **`prefers-reduced-motion` is honored globally:** all movement collapses to quick fades (≤150ms). This is an accessibility contract, not a nice-to-have.

## Interaction principles

- **Direct manipulation and immediate feedback.** Every action produces a visible response within 100ms, even if it's just a pressed state while work continues. Nothing the user does should feel like shouting into a void.
- **Progressive disclosure.** Show the essential layer by default; put depth (settings, explanations, advanced fields) one deliberate step away. Experts get density through opt-in, not by making novices pay for it.
- **Forgiveness over confirmation.** Prefer undo to "Are you sure?" dialogs; confirmation prompts train users to click through them. Reserve type-to-confirm ceremony for genuinely destructive, irreversible acts.
- **Respect platform conventions.** Back gestures/buttons must close the topmost layer (sheet, modal) before leaving the screen; system behaviors (scroll physics, text selection, keyboard types: numeric keypads for numbers) work the way the platform trained users to expect. Fighting the platform always loses.
- **Never block on the network for local intent.** Autosave continuously and say so quietly ("Saved · just now"); a user should never lose work, ever.

## Every state is designed

A screen isn't designed until all of its states are: **empty** (the most-seen state for new users; it teaches and invites, never just "No items"), **loading** (skeletons over spinners; no layout shift when content lands), **error** (plain language, what happened, what to do next; never a raw code), **partial** (some data missing; degrade the affected element, not the screen), and **overflowing** (long names, large numbers, 4-digit badge counts). "We'll design the empty state later" is how craft dies.

## Accessibility is design quality

Full keyboard operability with focus rings designed as part of the aesthetic (never stripped); every image/icon/chart carries a text equivalent (charts get a data-table fallback); controls have labels that read sensibly aloud, composite rows get composite labels ("Apple, 2 alerts, updated yesterday"); focus moves into opened sheets and returns to the trigger on close. If it doesn't work eyes-free with a screen reader or hands-free with a keyboard, it isn't finished.

## Words are part of the interface

Write like a calm human: sentence case, plain verbs, no jargon, no exclamation marks. Buttons say what they do ("Save changes", not "OK"). Errors are honest and useful. Empty states invite. Cleverness ages badly; clarity doesn't. Toast queues and badge storms are where calm interfaces go to die. One quiet, well-placed message beats three noisy ones.
