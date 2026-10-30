# Daggerheart EN → RU translation glossary

Established terminology for translating Daggerheart-compatible content into
Russian for this project. This is the canonical, curated glossary —
consolidated from `data/i18n.json` (the interface strings actually shipped)
and cross-referenced against [daggerheart.su](https://daggerheart.su) (the
official RU-localized site, browsed with the site's own language toggle).
Full session-by-session translation history (proper nouns as they came up,
per-batch judgment calls, flagged uncertainties) lives in the assistant's
own memory, not here — this file holds only terms stable enough to reuse
without re-deriving them.

When a term isn't listed here, don't invent a rendering and move on
silently — translate by sense if there's no reasonable alternative, but
flag it to the project owner as unverified rather than presenting it as
settled.

## Hard rule: never translate dice notation

Keep dice notation in Latin form in Russian text too: `2d4`, `2d8+2`,
`1d12`, `Xd10+10`. Never render it as `2к4` — the site's dice-roll buttons
are produced by a Latin-only pattern in `js/app.js`, and a Cyrillic `к`
silently breaks the roll button.

## Core structure terms

| English | Russian |
| --- | --- |
| Tier | Ранг |
| Difficulty | Сложность |
| Impulses | Импульсы |
| Potential Adversaries | Потенциальные Противники |
| Soul Echo (Journey 2 map, PD-022) | Эхо Души (daggerheart.ru/frame/journey-to-horizon; plural «Эхо Душ» — used wherever several are meant («Убрать все Эхо Душ?»); singular contexts keep «Эхо Души» / «Эха Души»; the Locate tool is «Найти Эхо Душ» everywhere (rail «Найти Эхо», chip and panel title); short form «Эхо») |
| Destroyed sanctuary (Journey 2 map, PD-070) | уничтоженное убежище — menu group «Уничтоженные убежища», button «Создать 5 уничтоженных убежищ», legend «Уничтоженное убежище» |
| GM / Game Master (all Russian text, 2026-10-28) | Мастер — always capitalised, as daggerheart.su writes it («только для Мастера», «К виду Мастера», «Напоминание Мастеру», «Мастер получает Страх»); never «ведущий», «ГМ» or Latin «GM». One style across the interface, `data/journey.json` and environments. «Мастер Оружия», «Мастер-Убийца» and similar adversary names are unrelated |
| Party (Journey UI controls and hints, audit 05 L5-05) | отряд («где сейчас находится отряд», «Маркер отряда»). «Группа» may remain in official encounter / rumor narrative in `data/journey.json` |
| Compass points, 16-point rose (audit 05 L5-08) | Запад-юго-запад, Запад-северо-запад, Восток-северо-восток, Восток-юго-восток (not «западо-/востоко-…»); abbreviations ЗЮЗ / ЗСЗ / ВСВ / ВЮВ unchanged |
| Drive (sanctuary table, PD-023) | Движущая сила (daggerheart.ru/frame/journey-to-horizon; was «Стремление») |
| Horizon / Marrogate (the two printed destinations, PD-081) | Горизонт / Marrogate (the name stays Latin, as in «Marrogate и юго-запад»; Horizon follows «Путешествие к Горизонту») |
| Passive (feature type) | Пассивно |
| Action (feature type) | Действие |
| Reaction (feature type) | Реакция |

Environment types (`type` enum, see
[docs/data-contracts/environments.md](data-contracts/environments.md)):

| English | Russian |
| --- | --- |
| Traversal | Путешествие |
| Social | Социальный |
| Exploration | Исследование |
| Event | Событие |
| Time Loop | Временная петля (never «Петля времени») |

A non-numeric `difficulty` value must not start with the word
"Difficulty"/"Сложность" — the label is prepended automatically when
rendering, so a value starting with it stutters ("Сложность Сложность …").

## Resources and core rolls

| English | Russian |
| --- | --- |
| Fear (GM currency) | Страх |
| Hope (player currency) | Надежда |
| Stress | Стресс |
| Hit Points | Раны |
| Duality Dice | Кости Дуальности |
| Hope Die / Fear Die | Кость Надежды / Кость Страха |
| Action Roll | бросок действия |
| Reaction Roll | Бросок Реакции |
| Group Action Roll | Групповой бросок |
| Spellcast Roll | Бросок Заклинания |
| Attack Roll | Бросок атаки |
| Damage Roll | Бросок урона |
| Critical Success | Критический успех |
| Success/Failure with Hope/Fear | Успех/Неудача с Надеждой / со Страхом |
| Battle Points | Боевые очки |

## Item rarity tiers

Used by Prep's item-browser dice tooltips (`prep_dice_rarity_1..5`
in `data/i18n.json`) — no official RU rulebook is present in this repo, so
these are this project's own best-judgment renderings pending a
native-speaker/rulebook sanity check:

| English | Russian |
| --- | --- |
| Common | Обычный |
| Uncommon | Необычный |
| Rare | Редкий |
| Legendary | Легендарный |
| Death Move | Предсмертный ход |

## Adversary stat block terms (`data/adversaries.json`)

Range and damage-type enums, translated via `data/i18n.json`
(`range_*`/`damage_*` keys — see
[docs/architecture.md](architecture.md) "Localization"):

| English | Russian |
| --- | --- |
| Melee | Вплотную |
| Very Close | Близко |
| Close | Средне |
| Far | Далеко |
| Very Far | Очень Далеко |
| Physical (damage) | Физический |
| Magic (damage) | Магический |
| Solo (role) | Одиночка |

## Traits (six core traits)

| English | Russian |
| --- | --- |
| Agility | Проворность |
| Strength | Сила |
| Finesse | Искусность |
| Instinct | Инстинкт |
| Presence | Влияние |
| Knowledge | Знание |

## Conditions

| English | Russian |
| --- | --- |
| Restrained | Обездвижен(а) |
| Vulnerable | Уязвим(а) |
| Hidden | Скрыт(а) |

## Proper nouns — don't "correct" the source spelling

An unusual spelling in a source book (e.g. "Cauldera" rather than the
geological "caldera") is often deliberate wordplay, not a typo — leave the
English spelling as written and transliterate rather than "fixing" it in
Russian. Check the whole of `data/environments.json` for an existing
rendering of a recurring proper noun before choosing a new one.

## Unresolved / project judgment calls

These are established as *this project's* convention where daggerheart.su
doesn't cover the term (homebrew/indie source material) or where the site
itself is inconsistent page-to-page. Reuse them for consistency; don't
re-litigate without the project owner's input:

- A no-adversary environment uses the literal placeholder `["None"]` /
  `["Нет"]` for `potential_adversaries` — never an empty array or an
  invented creature.
- When a source provides no `impulses` field at all, synthesize 2–4 short
  gerund-phrase impulses from what the environment's features actually do
  — this is safe without asking, since it paraphrases content already in
  the text rather than inventing an external fact.
- A source's own bold/emphasis markup around "Spend a Fear" is stripped —
  the site auto-detects and bolds Fear-cost text regardless of source
  markup.
- Nested/multi-level bullet lists from a source are flattened to one level
  (the site's bullet renderer only supports one flat level).

For bestiary/adversary name translations beyond the enums above (a specific
creature's official or homebrew Russian name), there is no stable subset
worth duplicating here — the working list is large and grows with every
new source book. Check `data/adversaries.json` and existing environments'
`potential_adversaries` text for a name before translating one fresh, and
verify against daggerheart.su's `/adversary` pages when the creature is
core-book (not homebrew).

Environment text, settled by the 2026-10-27 proofreading pass:

- **Range in a sentence** takes «на» or «в пределах»: «на Средней
  дистанции», «в пределах Дальней дистанции»; never «в Средней дистанции».
  (The range enums above — «Средне», «Далеко» — are the card labels, not
  sentence wording.)
- **Items named in an environment** use the Russian name and property
  wording from `data/items.json` («Ботинки Хождения по Воде», «Камень
  Облика»), not a fresh translation — see
  [.claude/rules/data.md](../.claude/rules/data.md) "Items follow the
  catalogue".
- **Glider vs. "personal gliders":** the catalogue's Glider is the
  «Парашют» item; Fractus' "personal gliders" are a campaign-frame thing
  and stay un-translated-by-guess until the frame's text is at hand.
- **Settled 2026-10-28 (owner confirmed; daggerheart.su's
  [terms table](https://daggerheart.su/rule/terms-translation) is the
  source):** Countdown = «Отсчёт» (never «Счётчик»); Long Rest =
  «Продолжительный Отдых», Short Rest = «Короткий Отдых» (never «Долгий»);
  PC = «персонаж» (lowercase mid-sentence; «игрок» is only the real
  player at the table); Hit Points = «Раны», a slot is a «Ячейка Ран»
  (daggerheart.su's adversary pages: «Ячеек Ран»), so "marks their last
  HP" is «отмечает свою последнюю Рану» and "clears HP" is «снимает Раны»;
  never «очки здоровья»; the GM in environment text is «Мастер» (the
  participle «ведущий» — "leading" — and «Ведущий персонаж» are ordinary
  words and stay); Secret-Keeper = «Хранитель Тайн», not «Культист-Хранитель
  Тайн» (the name `prep.json` and the other environments use).
- **Downtime move (settled 2026-10-30, owner confirmed):** «Ход Отдыха»
  (plural «Ходы Отдыха», capitalised like the other rest terms) — never
  «ход/действие простоя», «действие отдыха» or lowercase «ход отдыха».
  "During downtime" is «во время отдыха»; a "downtime project" is «проект
  Хода Отдыха». Item and adversary text already follow this.
- **Still open:** how the book's group forms with no roster ("Vampires
  (all, including Lamia)", "Outer Realms (any)", "Spectral Forces") should
  expand — decided case by case, see PD-082.

Campaign frame: *Journey to Horizon* = «Путешествие к Горизонту» (per
daggerheart.ru/frame/journey-to-horizon). Used as the Journey page's visible
title (PD-056); the nav tab stays «Путешествие».
