# Landing Hero Redesign

**Date:** 2026-08-20
**Status:** Approved

## Problem

The app currently lands on the Fit Check tab, which makes it read as a recruiter-only tool. Trace and Eval tabs expose implementation internals to all visitors. The status strip broadcasts technical metrics that mean nothing to non-technical users.

## Goals

- Neutral, multipurpose landing that invites both casual visitors and recruiters
- Hide retrieval/eval internals behind an Advanced tab
- Remove post-boot technical noise from the status strip

## Design

### 1. Hero section

Replace the current header with a richer hero. All existing elements stay (name, tagline, photo, tag strip) but are joined by:

- Two lines of pitch text below the tagline explaining what the app is ("I answer questions about Elroy's experience, projects, and what he's looking for — grounded in what he wrote about himself.")
- Two side-by-side CTA buttons: **"Chat with me"** and **"Check job fit"**

The hero is persistent — it stays visible at all times above the tab bar. It is not a splash that disappears.

### 2. Initial state

On load, no tab panel is shown. The tab bar is visible but nothing is selected. The input tray is hidden. Clicking a CTA button or a tab directly activates that panel. This makes the hero the functional entry point, not decoration above already-visible content.

### 3. Status strip

During boot: shown as today (loading messages).
After `dismissOverlay()` fires: hidden entirely (`display:none`). No "ready" indicator. The input becoming enabled is sufficient signal.

### 4. Tab bar restructure

**Before:** Chat | Fit check | Trace | Eval
**After:** Chat | Fit check | Advanced

The Advanced tab contains two sub-tabs: **Trace** and **Evaluation**. Evaluation keeps its existing Retrieval suite / Generation quality sub-tabs unchanged. The tab hint text for Advanced reads: "retrieval internals · eval suite".

## Files touched

| File | Change |
|---|---|
| `src/head.html` | Hero HTML and CSS; status strip hidden-after-boot class; tab bar reduced to 4 buttons (3 main + Advanced) |
| `src/ui.js` | `showTab()` updated for new tab names and null/no-panel state; `boot()` calls `showTab(null)`; `showTab("trace")` activates the Advanced tab and selects the Trace sub-tab (the "Open the full trace →" button in chat messages must continue to work); status strip hidden on boot complete; CTA button wiring |

## Out of scope

- Mobile layout adjustments beyond what the existing media query handles
- Any changes to corpus, retrieval, or generation logic
- Animated hero collapse on CTA click
