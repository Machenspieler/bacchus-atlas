/* ============================================================
   Artwork Lab V3 — context-review.js  (DEV-ONLY, lab-only data; never read by the app)
   A provisional visual review of every registered picture in the two frames the lab compares:
   the 95x249 Catalog strip and the 48x48 Prep tile. One reviewer (Claude), judged from rendered
   strips and tiles at DPR 1 and 2 on 2026-11-02 — to be confirmed by an art director. It is keyed
   by PICTURE and frame, not by environment: it says whether a picture survives the frame, not
   whether an environment deserves it (that is ARCHETYPE_FIT's job and is never loosened here).

   rating   good      survives the frame; Strategy C uses it for any authorised fit.
            marginal  recognisable but weak; Strategy C uses it only for a 'strong' fit
                      (a painting or an explicit override always counts as strong).
            poor      fails the frame; Strategy C keeps the production biome.
   crop     Strategy C's starting object-position x/y/zoom for that frame, chosen where the
            picture's subject sits (a 16:9 master in the strip shows about a fifth of its width).
   Not in this file: any picture, any ARCHETYPE_FIT entry, any production decision.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ArtworkLabReview = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
  "meta": {
    "reviewer": "Claude (visual pass from lab renders at DPR 1 and 2)",
    "date": "2026-11-02",
    "status": "provisional: not an art-director sign-off; one reviewer, per picture and frame, not per environment"
  },
  "images": {
    "archetype:arcane-sanctums": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 65,
          "y": 50,
          "zoom": 1
        },
        "note": "Spire and orbiting rings fill the strip."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 77,
          "y": 50,
          "zoom": 1
        },
        "note": "Glowing tower reads as a wizard's seat."
      }
    },
    "archetype:archives-and-libraries": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 15,
          "y": 50,
          "zoom": 1
        },
        "note": "Shelves and the ladder survive at x15; the window and desk are lost."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 45,
          "y": 50,
          "zoom": 1
        },
        "note": "Warm shelving and a reading desk; reads as a library."
      }
    },
    "archetype:arenas-and-duels": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 25,
          "y": 50,
          "zoom": 1
        },
        "note": "Banners, portcullis and sand floor: unmistakably an arena."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 40,
          "y": 50,
          "zoom": 1
        },
        "note": "Arched stands and sand read as an arena even at 48 px."
      }
    },
    "archetype:blighted-mires": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 80,
          "y": 50,
          "zoom": 1
        },
        "note": "Dead trees and ruins on still water; generic swamp at this width."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Grey-pink swamp; hard to tell from the wetland biome tile."
      }
    },
    "archetype:chase-and-ambush": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 48,
          "y": 50,
          "zoom": 1
        },
        "note": "Stone bridge and track survive, but the \"dropped gear\" story is lost."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 39,
          "y": 50,
          "zoom": 1
        },
        "note": "A dark forest path; reads as woods, not an ambush."
      }
    },
    "archetype:crypts-and-tombs": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 32,
          "y": 50,
          "zoom": 1
        },
        "note": "Sarcophagus, steps and candles in one strip: burial architecture."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 23,
          "y": 50,
          "zoom": 1
        },
        "note": "Sarcophagus with candles survives at 48 px."
      }
    },
    "archetype:cursed-and-blighted-lands": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Spiked ridges under a bruised sky; abstract in a strip."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Dark and busy; close to the badlands/wetland tiles."
      }
    },
    "archetype:drowned-depths": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 55,
          "y": 50,
          "zoom": 1
        },
        "note": "Light shafts and sunken arches: clearly underwater."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Cyan underwater ruins; the most distinctive tile in the set."
      }
    },
    "archetype:dungeon-delves": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 10,
          "y": 50,
          "zoom": 1
        },
        "note": "Barred gate and lantern at x10, but very dark."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 15,
          "y": 50,
          "zoom": 1
        },
        "note": "Dark; gate and lantern survive only on a bright screen."
      }
    },
    "archetype:feasts-and-revelry": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 43,
          "y": 50,
          "zoom": 1
        },
        "note": "Candles, chandeliers and a laden table."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Warm gold; reads as a banquet hall."
      }
    },
    "archetype:fey-and-enchanted": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 69,
          "y": 50,
          "zoom": 1
        },
        "note": "Waterfall, bridge and blossom: luminous and specific."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 61,
          "y": 50,
          "zoom": 1
        },
        "note": "Bright green-gold glade; clearly not the forest biome."
      }
    },
    "archetype:forgotten-ruins": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 78,
          "y": 50,
          "zoom": 1
        },
        "note": "Overgrown arch and pillars."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 73,
          "y": 50,
          "zoom": 1
        },
        "note": "Ruined arch reads at 48 px."
      }
    },
    "archetype:haunted-and-deathly": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 56,
          "y": 50,
          "zoom": 1
        },
        "note": "Gothic manor and graves, but nearly black in a strip."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 65,
          "y": 50,
          "zoom": 1
        },
        "note": "Very dark; the manor silhouette is barely there on a dark row."
      }
    },
    "archetype:infernal-and-profane": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 56,
          "y": 50,
          "zoom": 1
        },
        "note": "Red citadel: instantly Hell."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 61,
          "y": 50,
          "zoom": 1
        },
        "note": "Red-orange fortress; unmistakable colour and shape."
      }
    },
    "archetype:intrigue-and-underworld": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 60,
          "y": 50,
          "zoom": 1
        },
        "note": "Arch, lanterns and a cloaked figure; dark."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 65,
          "y": 50,
          "zoom": 1
        },
        "note": "Dark alley; reads as night street, not intrigue."
      }
    },
    "archetype:monster-lairs": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 25,
          "y": 50,
          "zoom": 1
        },
        "note": "Rib-like bones and cave mouth; reads as a generic cave."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 20,
          "y": 50,
          "zoom": 1
        },
        "note": "Generic cave; the bones are lost."
      }
    },
    "archetype:perilous-passages": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 40,
          "y": 50,
          "zoom": 1
        },
        "note": "Misty cliffs; the path and lantern need x18."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 39,
          "y": 50,
          "zoom": 1
        },
        "note": "Misty mountains; close to the mountain biome tile."
      }
    },
    "archetype:planar-rifts": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 53,
          "y": 50,
          "zoom": 1
        },
        "note": "Purple tear with floating fragments: very striking in a strip."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 55,
          "y": 50,
          "zoom": 1
        },
        "note": "A purple storm of colour; the ruptured-reality idea turns into an abstract shape at 48 px."
      }
    },
    "archetype:sacred-sanctuaries": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 29,
          "y": 50,
          "zoom": 1
        },
        "note": "Golden statue and candles."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 20,
          "y": 50,
          "zoom": 1
        },
        "note": "Statue and candlelight; reads as a shrine."
      }
    },
    "archetype:seafaring": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 15,
          "y": 50,
          "zoom": 1
        },
        "note": "Sail, rigging and lantern at x15 say \"ship\"; the open sea needs x75 (but then no ship)."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 15,
          "y": 50,
          "zoom": 1
        },
        "note": "Rigging and sea; reads as a ship at sea."
      }
    },
    "archetype:sinister-woods": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 37,
          "y": 50,
          "zoom": 1
        },
        "note": "Twisted trunks and mist."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Misty dark-green forest; close to but darker than the forest biome tile."
      }
    },
    "archetype:sky-realms": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 56,
          "y": 50,
          "zoom": 1
        },
        "note": "Floating island and cloud sea survive in the strip."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 58,
          "y": 50,
          "zoom": 1
        },
        "note": "Island and clouds read as floating islands, not generic mountains."
      }
    },
    "archetype:starfaring": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 85,
          "y": 50,
          "zoom": 1
        },
        "note": "Ships and the ringed planet: science fiction at a glance."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 85,
          "y": 50,
          "zoom": 1
        },
        "note": "Ship and planet visible; reads as sci-fi."
      }
    },
    "archetype:storms-and-calamity": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 95,
          "y": 50,
          "zoom": 1
        },
        "note": "Tornado and lightning only at x95 (the registry crop x55 shows no storm)."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 100,
          "y": 50,
          "zoom": 1
        },
        "note": "Tornado and lightning only at the far right."
      }
    },
    "archetype:streets-and-towns": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 65,
          "y": 50,
          "zoom": 1
        },
        "note": "Clock tower and timbered market street."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 55,
          "y": 50,
          "zoom": 1
        },
        "note": "Timber houses and a market; reads as a town."
      }
    },
    "archetype:strongholds-and-sieges": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 71,
          "y": 50,
          "zoom": 1
        },
        "note": "Castle and smoke; the siege is small in a strip."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 85,
          "y": 50,
          "zoom": 1
        },
        "note": "Castle in smoke; busy and small."
      }
    },
    "archetype:taverns-and-inns": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 52,
          "y": 50,
          "zoom": 1
        },
        "note": "Stag tapestry, shelves and lanterns: tavern."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 40,
          "y": 50,
          "zoom": 1
        },
        "note": "Table, mugs and candle; reads as a tavern."
      }
    },
    "archetype:time-and-dream": {
      "catalog": {
        "rating": "poor",
        "crop": {
          "x": 56,
          "y": 50,
          "zoom": 1
        },
        "note": "A strip can show only one season: it reads as an autumn village, losing the three-seasons premise."
      },
      "prep": {
        "rating": "marginal",
        "crop": {
          "x": 23,
          "y": 50,
          "zoom": 1
        },
        "note": "Two of the three seasons fit at x23, but it reads as a village by a pond."
      }
    },
    "env:cauldera-valley": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Own painting; always wins its place."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Own painting; always wins its place."
      }
    },
    "env:field-of-dreams": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Own painting; always wins its place."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Own painting; always wins its place."
      }
    },
    "env:ouroborean-pass": {
      "catalog": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Own painting; always wins its place."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Own painting; always wins its place."
      }
    },
    "biome:settlement": {
      "catalog": {
        "rating": "marginal",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Sunset harbour: right for port-city / raiding-party only."
      },
      "prep": {
        "rating": "good",
        "crop": {
          "x": 50,
          "y": 50,
          "zoom": 1
        },
        "note": "Sunset harbour reads at tile size."
      }
    }
  },
  "questions": {},
  "summary": {
    "catalog": {
      "A": "Reviewed: calm, consistent 1:3 biome strips; geography only, so a tavern and a tomb in the same biome look alike.",
      "B": "Reviewed: 18 of 28 pictures read clearly in a strip; 9 are dark or generic and 1 (time & dream) fails.",
      "C": "Reviewed: keeps the clear pictures and the strong-fit marginal ones; time & dream falls back to biome."
    },
    "prep": {
      "A": "Reviewed: crisp pre-cut tiles, instantly readable but identical across a biome.",
      "B": "Reviewed: 17 of 28 read at 48 px; the other 11 (planar rifts, haunted, monster lairs, time & dream among them) become generic, dark or abstract.",
      "C": "Reviewed: drops acceptable-fit pictures from the marginal set; the rest are as B."
    }
  }
};
});
