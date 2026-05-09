# ADR-0003 — Factual-only PPTX (strip editorial language)

**Status**: Accepted
**Date**: 2026-05-08

## Context

The legacy Python tool (`.reference/build_pptx.py`) produces a 22-slide deck where
roughly 30 % of the slides carry editorial framing rather than data:

- Slide 1 ("Vos serveurs ronronnent.") — hero with a value-laden tagline.
- Slide 2 ("Le constat : sizing en vCPU ≠ consommation réelle") — vCPU vs GHz argument.
- Closing slide ("Du sizing vCPU au sizing GHz") — four prescriptive recommendations.
- Per-cluster slides include a "💡 RESIZE EN GHZ — POTENTIEL" panel and a "Ce
  cluster ronronne à X %" line.

Even the overview slide labels its rightmost column "Marge libérable" — a phrase
that pre-judges what a customer should do with the headroom.

This works when the speaker is the author and can defend the framing live. It fails
when the deck is shared with a partner, an Account Exec who didn't write it, or a
customer who reads it without the speaker present.

## Decision

The vsizer-generated PPTX is **factual only**. The reproduction strips:

- The hero slide. Replace with a neutral title slide: app name, date, source filename.
- The "vCPU vs GHz" argument slide. Removed entirely.
- The closing recommendations slide. Removed entirely.
- The "💡 RESIZE EN GHZ — POTENTIEL" panel and "Ce cluster ronronne à X %"
  line on cluster slides. The bottom banner becomes a neutral 4-tile data strip:
  `vCPU alloués · Capacité réservée · GHz consommés · GHz disponibles`.
- The "Marge libérable" overview column. Same number stays, label becomes
  "GHz disponibles".

The math is **identical** to the Python reference. The numbers don't change. Only
the language and the conclusions disappear.

## Consequences

**Positive**

- The deck is safe to hand to a partner or AE who didn't write it. No one is
  put in a position of defending a framing they don't own.
- Customers reading the deck without the speaker present see facts, not a sales
  argument. That builds trust faster than the editorial version did.
- The dashboard and the PPTX are now structurally identical — what you see on the
  screen is what shows up in the file. That removes a class of "the dashboard
  said one thing but the deck said another" surprises.

**Negative**

- A speaker who *liked* the editorial framing has to deliver it orally. That's a
  feature for partners, a regression for the original author. We accept that:
  vsizer is for the partner case; the author still has the Python script.
- Stripping the closing slide removes a built-in prompt for next steps. The
  speaker has to remember to talk about them. We surface this in the README so
  no one is surprised when the deck ends abruptly on the last cluster.

## Alternatives considered

- **Keep the editorial slides, add a toggle**: rejected. A toggle invites the
  user to publish the editorial version "by accident". Easier to make the
  factual deck the only output.
- **Custom branding / logos / footer text**: out of scope V1 (PRD §4.2). Adding
  a "customer name" field would re-open the door to partial editorialism.

## Related

- PRD §5.4 (PPTX export — factual mode)
- `.reference/build_pptx.py` — the source of the deck layout being ported
- `.reference/slide-*.jpg` — visual reference for the kept slides
