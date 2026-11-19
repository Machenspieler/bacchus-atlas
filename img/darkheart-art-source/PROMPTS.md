# Darkheart artwork — image prompts

Prompts for the ten remaining outcome banners and eleven remaining ancestry portraits
(PD-105). Paste one prompt per chat message into ChatGPT's image generation; each prompt is
self-contained. This folder is excluded from `dist/`, so nothing here ships to the site.

Already done (pilot, keep as the style reference): `outcome-landmark-success-hope.png`
(Traveler's campfire), `outcome-hazard-fail-fear.png` (flood), `ancestry-firbolg.png`,
`ancestry-aetheris.png`. If ChatGPT drifts in style, attach one of these as a reference image
and add "match the style of the attached image".

## How to hand the pictures back

1. Save each master into this folder under the exact file name given in its heading
   (`outcome-<id>.png`, `ancestry-<id>.png`). PNG, the size ChatGPT gives is fine:
   banners about 1672×941 (16:9), portraits about 1254×1254 (1:1).
2. Tell Claude which files are in. It adds one entry per picture to `js/darkheart-art.js`
   (banner focal point / portrait crop), runs `node scripts/generate-darkheart-art.js`,
   and checks each picture in the real page.

## Rules for every picture

- No text, letters, runes that read as words, logos, watermarks, frames or borders.
- No official game artwork or logo imitation; an original painting.
- Banners: the 16:9 frame is cut to a very wide, shallow strip (about 180 px tall on the page),
  so the subject must sit in the middle horizontal band; top and bottom will be cropped.
- Banners show a place, not a hero: no player characters, no close faces.
- Portraits: one head-and-shoulders bust, face in the centre and upper-middle, looking near
  the viewer, room around the head so a circle crop keeps hair and ears.

---

## Outcome banners (16:9)

### `outcome-creature-fail-fear.png` — Hostile adversary

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting, dark ancient forest at dusk. A hostile, deadly presence lurks in the trees: several
> pairs of glowing amber eyes and the half-hidden silhouettes of large predators among gnarled
> roots and thick fog, a broken spear and a torn cloak on the path in the foreground. Cold blue
> shadows, one thin shaft of sickly green light. Tension and danger, nothing in open view. All
> important detail in the middle horizontal band of the frame. No people, no text, no logo, no
> border.

### `outcome-creature-fail-hope.png` — Neutral but formidable adversary

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. A misty forest crossing where a formidable but not hostile group waits: a huge
> antlered forest guardian beast standing calmly beside a mossy standing stone, or tall armoured
> wardens at rest by a small fire, seen at a distance, watchful, weapons lowered. Soft grey-green
> morning light, cool and wary mood, neither threat nor welcome. All important detail in the
> middle horizontal band of the frame. No close faces, no text, no logo, no border.

### `outcome-creature-success-fear.png` — An NPC in peril

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. A dark forest ravine at twilight: a lone small traveller, seen from a distance and
> from behind, is trapped among tightening black roots at the edge of a sinking bog, a dropped
> lantern still glowing on the ground, something large and shadowy circling between the trees.
> Urgent, dramatic contrast of warm lantern light and cold blue dusk. All important detail in
> the middle horizontal band of the frame. No visible face, no text, no logo, no border.

### `outcome-creature-success-hope.png` — An NPC with a side quest

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. A warm forest clearing in late afternoon: a small hermit's hut made of roots and
> stone with a lit window, a wooden signpost, a hanging lantern, a basket and a rolled map left
> on a bench as if waiting for visitors, a narrow path leading deeper into the woods. Golden
> light through tall trees, inviting and curious mood. All important detail in the middle
> horizontal band of the frame. No people, no text on the sign, no logo, no border.

### `outcome-landmark-fail-fear.png` — A dark omen

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. A forest glade under a bruised violet sky: a dead white tree with crows on every
> branch, a ring of black mushrooms around it, bones laid in a pattern on the ground, a cold mist
> crawling in, the last daylight failing too early. Ominous and uncanny, quiet dread rather than
> gore. All important detail in the middle horizontal band of the frame. No people, no readable
> symbols, no text, no logo, no border.

### `outcome-landmark-fail-hope.png` — A tragic place

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. The overgrown remains of a forest camp or small hamlet where something tragic
> happened long ago: a burnt-out wagon, a collapsed cottage swallowed by moss and ivy, a child's
> wooden toy and a wilted wreath on a stone, soft grey rain. Melancholy and mournful, muted
> desaturated colours with one pale ray of light. All important detail in the middle horizontal
> band of the frame. No people, no text, no logo, no border.

### `outcome-landmark-success-fear.png` — Danger foreshadowed

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. A quiet resting spot on a forest ridge, a cold campfire ring and a fallen log to sit
> on, but warning signs everywhere: enormous fresh claw marks on a tree trunk, a snapped
> tripwire, a torn banner caught in branches, smoke rising far away on the horizon. Calm
> foreground, threatening distance, amber dusk turning to blue. All important detail in the
> middle horizontal band of the frame. No people, no text, no logo, no border.

### `outcome-hazard-fail-hope.png` — An obstacle

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. A forest path blocked by an inconvenient but not deadly obstacle: a tangle of fallen
> mossy trunks and thorny brambles across a shallow muddy stream, the path visible again on the
> far side. Overcast soft daylight, damp and tiresome rather than dangerous. All important
> detail in the middle horizontal band of the frame. No people, no text, no logo, no border.

### `outcome-resource-success-fear.png` — A guarded resource

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. In a dark hollow under the roots of a giant tree, an iron-bound chest glints with a
> little gold; coiled around the roots is a sleeping beast, or a deadfall trap of logs and rope
> hangs above it, half hidden. Treasure lit by a narrow beam of warm light, everything around it
> in deep green shadow. Tempting and dangerous. All important detail in the middle horizontal
> band of the frame. No people, no text, no logo, no border.

### `outcome-resource-success-hope.png` — A useful resource

> Wide cinematic 16:9 fantasy landscape painting, painterly and highly detailed, realistic
> lighting. A sunlit forest glade with a gift waiting to be found: an old leather backpack and a
> small wooden chest on a mossy stump inside a ring of glowing mushrooms, a folded map tied with
> twine, herbs and a stoppered potion bottle beside them, motes of golden light in the air.
> Hopeful, gentle and magical. All important detail in the middle horizontal band of the frame.
> No people, no text, no logo, no border.

---

## Ancestry portraits (1:1)

Every portrait prompt shares this ending, already included below: *Square 1:1 head-and-shoulders
portrait, painterly realistic fantasy, warm golden rim light, blurred dark mossy forest
background, face centred in the upper-middle of the frame with space around the head, looking
near the viewer. No text, no logo, no border.*

### `ancestry-human.png` — Human

> A weathered human forest guide in their forties, short dark hair streaked with grey, a trimmed
> beard, a scar across one cheek, a hooded green wool cloak with a bronze clasp, calm and
> watchful eyes. Square 1:1 head-and-shoulders portrait, painterly realistic fantasy, warm golden
> rim light, blurred dark mossy forest background, face centred in the upper-middle of the frame
> with space around the head, looking near the viewer. No text, no logo, no border.

### `ancestry-elf.png` — Elf

> An elf with long pointed ears, silver-blond hair in thin braids woven with tiny leaves, sharp
> elegant features, pale green eyes, a high-collared leaf-patterned leather coat, serene and
> ageless expression. Square 1:1 head-and-shoulders portrait, painterly realistic fantasy, warm
> golden rim light, blurred dark mossy forest background, face centred in the upper-middle of the
> frame with space around the head (keep both ear tips in frame), looking near the viewer. No
> text, no logo, no border.

### `ancestry-dwarf.png` — Dwarf

> A stout dwarf woman with a broad face, braided copper-red hair and braided sideburns bound with
> iron rings, freckles, a fur-lined leather hood over a chainmail collar, a confident half-smile.
> Square 1:1 head-and-shoulders portrait, painterly realistic fantasy, warm golden rim light,
> blurred dark mossy forest background, face centred in the upper-middle of the frame with space
> around the head, looking near the viewer. No text, no logo, no border.

### `ancestry-halfling.png` — Halfling

> A young halfling with a round friendly face, curly chestnut hair, rosy cheeks, bright brown eyes,
> slightly pointed ears, a patched mustard-yellow scarf and a travelling cloak, a mischievous
> grin. Square 1:1 head-and-shoulders portrait, painterly realistic fantasy, warm golden rim
> light, blurred dark mossy forest background, face centred in the upper-middle of the frame with
> space around the head, looking near the viewer. No text, no logo, no border.

### `ancestry-goblin.png` — Goblin

> A clever goblin with green-grey skin, very large pointed ears with small brass rings, big
> amber eyes, a narrow face and a sly smile, a hood of patched leather with a feather, a necklace
> of small bones and buttons. Square 1:1 head-and-shoulders portrait, painterly realistic fantasy,
> warm golden rim light, blurred dark mossy forest background, face centred in the upper-middle of
> the frame with space around the head (keep both large ears in frame), looking near the viewer.
> No text, no logo, no border.

### `ancestry-orc.png` — Orc

> A dignified orc with grey-green skin, strong jaw and small tusks, black hair in a topknot with
> shaved sides, ritual white face paint, a fur mantle over leather armour, wise and steady eyes.
> Square 1:1 head-and-shoulders portrait, painterly realistic fantasy, warm golden rim light,
> blurred dark mossy forest background, face centred in the upper-middle of the frame with space
> around the head, looking near the viewer. No text, no logo, no border.

### `ancestry-faun.png` — Faun

> A faun with curling ram horns rising from a mop of dark curly hair, small goat ears, warm brown
> skin, a wreath of ivy and berries, a simple linen shirt and a reed pipe on a cord around the
> neck, a playful gentle smile. Square 1:1 head-and-shoulders portrait, painterly realistic
> fantasy, warm golden rim light, blurred dark mossy forest background, face centred in the
> upper-middle of the frame with space around the head (keep the horns in frame), looking near
> the viewer. No text, no logo, no border.

### `ancestry-katari.png` — Katari

> A katari, a feline humanoid with a lynx-like face, tufted ears, soft spotted tawny fur, long
> whiskers and golden slit-pupil eyes, a dark green hooded cloak and a leather collar with a
> silver clasp, alert and proud expression. Square 1:1 head-and-shoulders portrait, painterly
> realistic fantasy, warm golden rim light, blurred dark mossy forest background, face centred in
> the upper-middle of the frame with space around the head (keep the ear tufts in frame), looking
> near the viewer. No text, no logo, no border.

### `ancestry-faerie.png` — Faerie

> A faerie with delicate translucent dragonfly-like wings visible behind the shoulders, slightly
> iridescent skin, large dark eyes, short tousled hair the colour of moss, tiny flowers and
> dewdrops in the hair, a tunic of layered leaves, curious and otherworldly expression. Square
> 1:1 head-and-shoulders portrait, painterly realistic fantasy, warm golden rim light, blurred
> dark mossy forest background, face centred in the upper-middle of the frame with space around
> the head, looking near the viewer. No text, no logo, no border.

### `ancestry-fungril.png` — Fungril

> A fungril, a mushroom humanoid with a broad red-brown mushroom cap in place of hair, pale
> gills under the cap's rim, smooth earthy skin with faint mycelium patterns, small glowing
> spores drifting around, kind dark eyes, a cloak of woven moss. Square 1:1 head-and-shoulders
> portrait, painterly realistic fantasy, warm golden rim light, blurred dark mossy forest
> background, face centred in the upper-middle of the frame with space around the head (keep the
> whole cap in frame), looking near the viewer. No text, no logo, no border.

### `ancestry-galapa.png` — Galapa

> A galapa, a turtle-like humanoid with an old, wise beaked face, wrinkled olive-green scaled
> skin, the rim of a domed carved shell visible over the shoulders, small polished beads hanging
> from the shell, calm patient eyes. Square 1:1 head-and-shoulders portrait, painterly realistic
> fantasy, warm golden rim light, blurred dark mossy forest background, face centred in the
> upper-middle of the frame with space around the head, looking near the viewer. No text, no
> logo, no border.
