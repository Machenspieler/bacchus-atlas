# Darkheart suitability (PD-104): coverage and composed scenes

| Outcome | Before: eligible | Before: authored | Before: fallback | After: eligible | After: authored | After: fallback-only |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| creature-fail-fear | 5 | 0 | 0 | 54 | 2 | 48 |
| creature-fail-hope | 3 | 0 | 0 | 61 | 0 | 58 |
| creature-success-fear | 3 | 0 | 0 | 60 | 0 | 57 |
| creature-success-hope | 5 | 1 | 0 | 62 | 1 | 57 |
| landmark-fail-fear | 4 | 2 | 0 | 34 | 2 | 30 |
| landmark-fail-hope | 4 | 2 | 0 | 31 | 2 | 27 |
| landmark-success-fear | 3 | 1 | 0 | 82 | 1 | 79 |
| landmark-success-hope | 6 | 3 | 0 | 34 | 3 | 28 |
| hazard-fail-fear | 6 | 0 | 0 | 45 | 0 | 39 |
| hazard-fail-hope | 10 | 5 | 0 | 56 | 6 | 46 |
| resource-success-fear | 4 | 1 | 0 | 50 | 1 | 46 |
| resource-success-hope | 6 | 3 | 0 | 65 | 3 | 59 |

Distinct environments across all twelve outcomes: before 34, after 82 (of 408).

Remaining exclusions: 82 profiled, 21 explicitly excluded (1 home-base, 2 war-scale, 2 not-a-place, 4 urban, 3 planar, 2 interior, 7 terrain).
- 121 not considered: terrain (no forest, wetland, rolling or grassland biome)
- 170 not considered: settlement or universal framework (city, interior, space, planar, encounter template)
- 14 not considered: other terrain mix not adapted
Per outcome, profiled environments its rule leaves out: creature-fail-fear 29, creature-fail-hope 21, creature-success-fear 22, creature-success-hope 20, landmark-fail-fear 48, landmark-fail-hope 52, landmark-success-fear 0, landmark-success-hope 48, hazard-fail-fear 37, hazard-fail-hope 27, resource-success-fear 33, resource-success-hope 18.

## Composed scenes (Tier 2, 4 heroes)

### creature-fail-fear — Unsettling Forest — hostile ground
Environment `unsettling-forest` (tags: dark, haunted, lair, hard) · eligible via rule
Encounter (recommended, Tier 2, 4 heroes): 2× Demonic Hound Pack, 1× Chaos Skull, 1× Spectral Captain, 1× Brawny Zombie — 13/15 BP
Adapted source features: Spirits of the Damned
GM Guidance:
- **Why they are here.** This is a lair and the party is inside it. They defend it, and they know «Disturbing Totems» better than the party does.
- **Use the ground.** Fight in poor light; a lantern is a resource, and sound carries wrongly.
- **How it ends.** Decide beforehand what makes them break off: a fallen leader, fire, or the party reaching «Navigate the Woods».

### creature-fail-hope — Bandit Hideout — a formidable meeting
Environment `bandit-hideout` (tags: outlaw, lair, folk, hard) · eligible via rule
Encounter (prepared, Tier 2, 4 heroes): 1× Jagged Knife Kneebreaker, 1× Jagged Knife Lieutenant — 7/15 BP
GM Guidance:
- **Why they are here.** A trade party, patrol or group of travellers rests at «Alarm» in «Bandit Hideout». They are not looking for a fight and can end one quickly.
- **How to play them.** Questions, news and a price for the road. They want something small: passage, a name, a favour.
- **If it turns.** This is a meeting, not a fight. The adversaries below stay on hand only if someone gives them cause.

### creature-success-fear — Forest Basin — someone in peril
Environment `forest-basin` (tags: bog, hard, deadly, wild, water) · eligible via rule
Encounter (optional, Tier 2, 4 heroes): 1× Dire Pangolati, 1× Fungispunj Sporophore, 1× Darkweave Queen — 12/15 BP
NPC: Yara Larkspur, Faerie — need: To be hauled out of the bog before it closes over them. (situation: bog)
GM Guidance:
- **Where they are caught.** Yara Larkspur is sinking into the mire near «Unsafe Waters», and a wrong move pulls them deeper.
- **The rescue.** Reaching them is the scene: let «Lurking Hunger» be the obstacle, and let how the party helps shape what the NPC offers afterwards.
- **Optional threat.** If you want a fight, thematic adversaries are listed below; otherwise the peril is the place itself.

### creature-success-hope — Abandoned Grove — a stranger with a request
Environment `abandoned-grove` (tags: ruin, tragic, wild, hard) · eligible via rule
Encounter (none, Tier 2, 4 heroes): none generated
NPC: Yara Larkspur, Faerie — need: To recover a keepsake lost somewhere nearby. (situation: lost-item)
Adapted source features: You Are Not Welcome Here, Defiler
GM Guidance:
- **The request.** Yara Larkspur describes a keepsake they dropped by «Overgrown Battlefield»; they cannot go back for it.
- **Where it leads.** Let the lead point back into the place: «Overgrown Battlefield» is where the item, trail or answer waits.
- **What the NPC offers.** In return they can offer news of the next hex, shelter, or a favour owed. You decide; the app tracks none of it.

### landmark-fail-fear — Death Butterfly Grove — an ominous place
Environment `death-butterfly-grove` (tags: dark, wild, hard, uncanny) · eligible via rule
Encounter (none, Tier 2, 4 heroes): none generated
GM Guidance:
- **Omen motifs (pick one, or none).** Branches that close behind the party; a path that ends at «Swarm Tactics»; trees leaning inward.
- **What it means.** Leave its meaning open until it matters: an omen can point to a hex, an enemy or a cost. There is no rest here; let the omen be why.

### landmark-fail-hope — Swamp Ruins — a place of loss
Environment `swamp-ruins` (tags: bog, ruin, tragic, uncanny) · eligible via rule
Encounter (none, Tier 2, 4 heroes): none generated
GM Guidance:
- **What happened here (pick one).** A crossing that took people; markers left in the mire, and no one came back for them.
- **What the party can learn.** One clear detail at «Glimpse of the Past» is enough. No tragedy needs a full backstory; let the party fill in the rest.

### landmark-success-fear — Briar Thicket — a warning ahead
Environment `briar-thicket` (tags: hard, wild) · eligible via rule
Encounter (none, Tier 2, 4 heroes): none generated
GM Guidance:
- **Warning signs.** Fresh tracks bound for the party’s route; carrion hung in the branches; a den far larger than it should be.
- **Nothing attacks yet.** Nothing attacks. Give the party one clear sign and let them speculate; the danger can wait for a later hex.

### landmark-success-hope — Wishmaker Glade — the Traveler’s campfire
Environment `wishmaker-glade` (tags: serene, fey, folk, refuge) · eligible via rule
Encounter (none, Tier 2, 4 heroes): none generated
GM Guidance:
- **The Traveler’s campfire.** In a quiet nook at «Drawn to Hope»: the first truly warm place in a long while.
- **No source campfire needed.** The place does not have to mention a campfire; this one is Darkheart’s. Describe it and the Traveler as much or as little as you like, and the rest is safe.

### hazard-fail-fear — Dread Mire — a deadly passage
Environment `dread-mire` (tags: bog, dark, deadly, wild) · eligible via rule
Encounter (optional, Tier 2, 4 heroes): 1× Elephant, 1× Darkweave Queen — 9/15 BP
GM Guidance:
- **The threat.** The ground itself: falling timber, a failing slope and a path that closes at «You Belong to the Mire».
- **Ways through.** Cut a line through, climb over, or follow an animal path the locals know.
- **The countdown.** The countdown is yours to set: use the outcome’s number or resize it to the scene. If the place already has its own, keep, resize or ignore it.

### hazard-fail-hope — Briar Thicket — an obstacle in the way
Environment `briar-thicket` (tags: hard, wild) · eligible via rule
Encounter (optional, Tier 2, 4 heroes): 1× Elephant, 1× Fungispunj Sporophore — 7/14 BP
GM Guidance:
- **The obstacle.** A thorn thicket or a warren that riddles the path near «Disorienting Canopy».
- **Possible ways around.** Hack through, go under, or find the animal path; each costs time or a little effort.
- **Keep it small.** This is not a deadly hazard: the party is delayed or inconvenienced, not threatened with death.

### resource-success-fear — Hunter, or Hunted? — a guarded find
Environment `hunter-or-hunted` (tags: wild, lair, hard) · eligible via rule
Encounter (optional, Tier 2, 4 heroes): 1× Fungispunj Sporophore, 1× Dire Pangolati, 2× Giant Eagle — 11/14 BP
Adapted source features: Mom’s Home!
GM Guidance:
- **Where it lies.** A hollow-tree cache, or a den’s old hoard tucked among the roots by «You’re Being Watched».
- **Guard A: creatures.** Whoever hid it left lookouts, and they watch «Clever Girl!».
- **Guard B: hazard.** Snapping vines, or a deadfall of timber and rope at «You’re Being Watched».
- **One guard is enough.** Pick creatures or the hazard, not both. A guard is not combat until the party provokes it, and the countdown is your call.
- **The reward.** Roll on your own loot tables, or offer a boon instead. The app does not roll a reward for you.
- **A quest clue instead.** Players may take a quest clue in place of a material reward. Tie it to the party’s current quest; you know it, and this page does not track it.

### resource-success-hope — Mystic Ring — a useful discovery
Environment `mystic-ring` (tags: ruin, serene, uncanny) · eligible via rule
Encounter (none, Tier 2, 4 heroes): none generated
GM Guidance:
- **Where it lies.** A satchel left at «Company», as if someone meant it to be found.
- **The reward.** Roll on your own loot tables, or offer a boon instead. The app does not roll a reward for you.
- **A quest clue instead.** Players may take a quest clue in place of a material reward. Tie it to the party’s current quest; you know it, and this page does not track it.

