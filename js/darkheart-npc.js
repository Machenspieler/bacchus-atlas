/* ============================================================
   Bacchus's Atlas — darkheart-npc.js
   The minimal, deterministic NPC generator behind the Scene Composer's NPC
   component (docs/data-contracts/scene-composer.md, PD-099). Same seed and
   inputs, same NPC. Plain tables, no runtime AI, no network, no portrait
   generation: the view draws the avatar from `avatar` (ancestry + palette).

   It makes exactly five things and no biography: a name, an ancestry, one
   memorable look, one line of dialogue that belongs to the situation, and one
   immediate need. Every text is { en, ru }. Given `situations` (what the place supports,
   DarkheartSuitability.npcSituations) the need is connected to the location; without them it is dealt as before.

   An NPC is new narrative material, never a stat block: `adversaryId` stays
   null here (it is only set when a Master locks a catalogue adversary to be
   the character), and nothing here touches the catalogues or campaign state.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DarkheartNpc = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var B = function (en, ru) { return { en: en, ru: ru }; };

  /* The role follows the Darkheart outcome. A neutral creature is offered a
   * character only on request (the Master may not want one). */
  var ROLE_FOR_OUTCOME = {
    'creature-success-fear': 'in-peril',
    'creature-success-hope': 'side-quest',
    'creature-fail-hope': 'neutral-creature',
  };

  var NAMES = [
    B('Aldric', 'Альдрик'), B('Brisa', 'Бриза'), B('Corwin', 'Корвин'), B('Dessa', 'Десса'), B('Edrik', 'Эдрик'), B('Fenna', 'Фенна'),
    B('Garrick', 'Гаррик'), B('Hesper', 'Хеспер'), B('Ilsa', 'Илса'), B('Joren', 'Йорен'), B('Kestrel', 'Кестрел'), B('Lowen', 'Ловен'),
    B('Marrow', 'Мэрроу'), B('Nessa', 'Несса'), B('Orrin', 'Оррин'), B('Pell', 'Пелл'), B('Quill', 'Квилл'), B('Rowan', 'Роуэн'),
    B('Sable', 'Сейбл'), B('Tamsin', 'Тамсин'), B('Ulric', 'Ульрик'), B('Vesna', 'Весна'), B('Wren', 'Рен'), B('Yara', 'Яра'),
  ];
  var SURNAMES = [
    B('Bracken', 'Папоротник'), B('Thistledown', 'Чертополох'), B('Hollow', 'Дупло'), B('Lantern', 'Фонарь'), B('Ashgrove', 'Ясенёва'),
    B('Mossfoot', 'Мшанка'), B('Cinder', 'Зола'), B('Fennick', 'Фенник'), B('Greywater', 'Серая Вода'), B('Larkspur', 'Живокость'),
    B('Nightshade', 'Паслён'), B('Underhill', 'Подхолмье'),
  ];

  /* `shape` tells the view which silhouette to draw (js/darkheart-view.js). */
  var ANCESTRIES = [
    { id: 'human', shape: 'round', name: B('Human', 'Человек') },
    { id: 'elf', shape: 'pointed', name: B('Elf', 'Эльф') },
    { id: 'dwarf', shape: 'beard', name: B('Dwarf', 'Дварф') },
    { id: 'halfling', shape: 'curls', name: B('Halfling', 'Полурослик') },
    { id: 'goblin', shape: 'bigears', name: B('Goblin', 'Гоблин') },
    { id: 'orc', shape: 'tusks', name: B('Orc', 'Орк') },
    { id: 'faun', shape: 'horns', name: B('Faun', 'Фавн') },
    { id: 'katari', shape: 'cat', name: B('Katari', 'Катари') },
    { id: 'faerie', shape: 'wings', name: B('Faerie', 'Фея') },
    { id: 'firbolg', shape: 'antlers', name: B('Firbolg', 'Фирболг') },
    { id: 'fungril', shape: 'cap', name: B('Fungril', 'Фунгрил') },
    { id: 'galapa', shape: 'shell', name: B('Galapa', 'Галапа') },
    { id: 'aetheris', shape: 'wings', name: B('Aetheris', 'Аэтерис') },
    { id: 'gnome', shape: 'pointed', name: B('Gnome', 'Гном') },
    { id: 'earthkin', shape: 'beard', name: B('Earthkin', 'Эрткин') },
    { id: 'emberkin', shape: 'round', name: B('Emberkin', 'Эмберкин') },
    { id: 'skykin', shape: 'pointed', name: B('Skykin', 'Скайкин') },
    { id: 'tidekin', shape: 'pointed', name: B('Tidekin', 'Тайдкин') },
  ];

  var LOOKS = [
    B('a moss-green cloak patched at both elbows', 'мшисто-зелёный плащ, залатанный на обоих локтях'),
    B('one eye clouded milk-white', 'один глаз затянут молочной пеленой'),
    B('a braid threaded with tiny bronze bells', 'коса, увитая крошечными бронзовыми бубенцами'),
    B('ink-stained fingers and a quill behind the ear', 'пальцы в чернилах и перо за ухом'),
    B('a hunting horn on a frayed cord', 'охотничий рог на истёртом шнуре'),
    B('a limp, and a walking stick cut with notches', 'хромота и посох с зарубками'),
    B('a lantern with no flame, held as if it still burned', 'фонарь без огня, который держат так, будто он горит'),
    B('bark-like scars across both forearms', 'шрамы, похожие на кору, по обоим предплечьям'),
    B('a scarf in the faded colours of a Wallwatcher’s tabard', 'шарф выцветших цветов табарда Стражей стены'),
    B('silver rings on every finger', 'серебряные кольца на каждом пальце'),
    B('mud to the knees and a broad, sleepless smile', 'грязь до колен и широкая бессонная улыбка'),
    B('a crow that never leaves the shoulder', 'ворона, не слетающая с плеча'),
    B('a patchwork coat of mismatched pelts', 'лоскутный тулуп из разномастных шкур'),
    B('a long scar through one eyebrow', 'длинный шрам, рассекающий бровь'),
    B('a necklace of antler splinters', 'ожерелье из осколков рогов'),
    B('boots wrapped in rags to muffle every step', 'сапоги, обмотанные тряпками, чтобы заглушить шаги'),
  ];

  /* The situation is what the dialogue and the need are about. */
  var SITUATIONS = {
    'in-peril': {
      roots: {
        lines: [B('The roots keep tightening. Cut me loose before they reach my chest!', 'Корни всё туже! Режьте, пока они не дошли до груди!'), B('Don’t pull, you’ll only wake them. Cut, cut!', 'Не тяните, только разбудите их. Режьте, режьте!')],
        need: B('To be cut free of the grasping roots before they drag them under.', 'Чтобы их высвободили из хватких корней, пока те не утащили под землю.'),
      },
      collapse: {
        lines: [B('The beams won’t hold much longer. Get me out from under this!', 'Балки долго не выдержат. Вытащите меня отсюда!'), B('Mind the ceiling. It groans every time I breathe!', 'Осторожно с потолком. Он стонет при каждом моём вдохе!')],
        need: B('To be pulled out from under a collapsing ruin before it comes down.', 'Чтобы их вытащили из-под рушащихся развалин, пока всё не обвалилось.'),
      },
      bog: {
        lines: [B('I’m sinking! Throw me something, anything!', 'Я тону! Бросьте что-нибудь, хоть что-нибудь!'), B('Every move pulls me deeper. Talk me through it, please!', 'Каждое движение тянет глубже. Говорите со мной, прошу!')],
        need: B('To be hauled out of the bog before it closes over them.', 'Чтобы их вытянули из трясины, пока она не сомкнулась над головой.'),
      },
      fire: {
        lines: [B('The fire is closing in. I can’t get through the smoke, lead me out!', 'Огонь смыкается. Я не вижу дороги в дыму — выведите меня!'), B('Don’t go back for my pack. Just get me clear of the flames!', 'Не возвращайтесь за моей сумкой. Только выведите меня из огня!')],
        need: B('To be led out of the blaze before the fire closes around them.', 'Чтобы их вывели из пожара, пока огонь не сомкнулся вокруг.'),
      },
      beast: {
        lines: [B('It’s circling. It knows I can’t run on this leg!', 'Оно кружит. Оно знает, что на этой ноге мне не убежать!'), B('Whatever you do, keep it looking at you, not at me!', 'Что бы вы ни делали — пусть смотрит на вас, а не на меня!')],
        need: B('To have the beast driven off or drawn away from them.', 'Чтобы зверя прогнали или отвлекли от них.'),
      },
      /* Situations a place's own character asks for (PD-104). They are offered only where the place suggests
       * them (`situations` in generateNpc), never in the unhinted default pool, so an NPC dealt without a place is unchanged. */
      snare: {
        hinted: true,
        lines: [B('Careful, the ground here is rigged. Cut the cord, don’t step on it!', 'Осторожно, земля здесь с подвохом. Режьте верёвку, не наступайте!'), B('Whoever set this will be back soon. Hurry!', 'Тот, кто это поставил, скоро вернётся. Скорее!')],
        need: B('To be freed from a snare before whoever set it returns.', 'Чтобы их освободили из ловушки, пока не вернулся тот, кто её поставил.'),
      },
      lost: {
        hinted: true,
        lines: [B('I have passed that same tree four times. Which way is out?', 'Я в четвёртый раз прохожу мимо этого дерева. Где выход?'), B('The light is going. Please, just walk me to a road.', 'Свет гаснет. Прошу, просто выведите меня на дорогу.')],
        need: B('To be led back to a path before dark falls.', 'Чтобы их вывели обратно на тропу до наступления темноты.'),
      },
      spirit: {
        hinted: true,
        lines: [B('I can’t leave. Something here will not let go of me.', 'Я не могу уйти. Что-то здесь не отпускает меня.'), B('It gets stronger when the light fades. Break it, or take me away from here.', 'Оно крепнет, когда меркнет свет. Разорвите это или заберите меня отсюда.')],
        need: B('To be released from something that holds them in place.', 'Чтобы их освободили от того, что держит их на месте.'),
      },
    },
    'side-quest': {
      'lost-item': {
        lines: [B('I dropped something precious back by the old stones. Would you fetch it?', 'У старых камней я обронил кое-что дорогое. Принесёте?'), B('A silver locket, half-buried. The forest keeps hiding it from me.', 'Серебряный медальон, наполовину зарытый. Лес всё время прячет его от меня.')],
        need: B('To recover a keepsake lost somewhere nearby.', 'Вернуть памятную вещь, потерянную где-то неподалёку.'),
      },
      'missing-person': {
        lines: [B('My brother went ahead and never came back. I only need to know he’s alive.', 'Мой брат ушёл вперёд и не вернулся. Мне нужно лишь знать, что он жив.'), B('He wore a Wallwatcher’s colours. Have you seen him?', 'На нём были цвета Стражей стены. Вы его не видели?')],
        need: B('To learn what happened to someone who went missing in the forest.', 'Узнать, что случилось с тем, кто пропал в лесу.'),
      },
      message: {
        lines: [B('This message must reach the Warden at Bastion. I won’t make it that far.', 'Это письмо должно дойти до Хранителя в Бастионе. Мне до него не добраться.'), B('Don’t read it. Just carry it. Please.', 'Не читайте. Просто донесите. Прошу.')],
        need: B('To have a sealed message carried to Bastion.', 'Чтобы запечатанное письмо донесли до Бастиона.'),
      },
      task: {
        lines: [B('You’ve been honoured with a seat. In return, there is a small matter only guests can settle.', 'Вас почтили местом за столом. Взамен есть одно дело, которое под силу лишь гостям.'), B('Do this for us and the doors of this place stay open to you.', 'Сделайте это для нас — и двери этого места останутся для вас открытыми.')],
        need: B('A favour from guests that the hosts cannot ask of their own.', 'Услугу от гостей, о которой хозяева не могут просить своих.'),
      },
      loop: {
        lines: [B('I’ve lived today more times than I can count. Help me break it and I’ll tell you every step.', 'Я прожил этот день бессчётное число раз. Помогите мне разорвать круг — и я расскажу вам каждый шаг.'), B('Ask me anything about this day. I already know the answer.', 'Спросите меня о чём угодно про этот день. Я уже знаю ответ.')],
        need: B('To be freed from a day that keeps repeating.', 'Освободиться от дня, который повторяется снова и снова.'),
      },
      wake: {
        lines: [B('You’ve the look of someone I knew. I want to wake up, and I can’t find the way.', 'Вы похожи на того, кого я знал. Я хочу проснуться и не могу найти путь.'), B('If you wake first, will you remember me?', 'Если вы проснётесь первыми — вы меня вспомните?')],
        need: B('A way out of a dream they cannot leave on their own.', 'Путь из сна, который они не могут покинуть сами.'),
      },
      errand: {
        lines: [B('Our guests arrive soon and nothing is ready. Could you spare an hour?', 'Скоро прибудут гости, а ничего не готово. Не найдётся ли у вас часа?'), B('It’s only a small thing, but it must be done before dusk.', 'Это пустяк, но его нужно сделать до темноты.')],
        need: B('Help with a task that has to be finished before important guests arrive.', 'Помощь с делом, которое надо закончить до приезда важных гостей.'),
      },
      curse: {
        lines: [B('Something followed me out of the thicket and it won’t leave me alone.', 'Что-то увязалось за мной из чащи и не отстаёт.'), B('You can’t see it, can you? I hear it breathing when it’s quiet.', 'Вы ведь его не видите? Я слышу, как оно дышит, когда тихо.')],
        need: B('To be rid of something that has been following them.', 'Избавиться от того, что идёт за ними по пятам.'),
      },
    },
    'neutral-creature': {
      hunting: {
        lines: [B('Keep your voices low. I’m hunting, and you’re frightening the quarry.', 'Тише. Я на охоте, а вы пугаете добычу.'), B('Stay behind me and you may even be useful.', 'Держитесь позади — глядишь, и от вас будет польза.')],
        need: B('To finish a hunt without being disturbed.', 'Закончить охоту, чтобы никто не мешал.'),
      },
      bargain: {
        lines: [B('You look like people who owe nobody anything. Let’s change that.', 'Вы похожи на тех, кто никому ничего не должен. Давайте это исправим.'), B('A small favour for safe passage. I’m fair, as these things go.', 'Небольшая услуга за безопасный проход. Я честен, как это здесь принято.')],
        need: B('A favour in return for letting the party pass.', 'Услугу в обмен на проход отряда.'),
      },
      guarding: {
        lines: [B('This is my ground. Cross it as guests and nothing will happen.', 'Это моя земля. Пройдите как гости — и ничего не случится.'), B('Say what you’re carrying, and where to.', 'Скажите, что несёте и куда.')],
        need: B('To have their ground respected, or paid for.', 'Чтобы их землю уважали — или платили за проход.'),
      },
      fleeing: {
        lines: [B('Something worse than you is behind me. Not a word.', 'За мной идёт кто-то пострашнее вас. Ни слова.'), B('Which way is out? Quickly, quickly.', 'Где здесь выход? Быстрее, быстрее.')],
        need: B('A way out before whatever is chasing them arrives.', 'Выход, пока не пришло то, что их преследует.'),
      },
    },
  };

  /* Scene hints: a scene that already says what the danger is names the
   * situation, so the NPC speaks about it. Anything else is picked by seed. */
  var SCENE_SITUATION = {
    'root-rush-rescue-race': 'roots',
    'gloaming-forest-wanderer': 'curse',
    'forest-wildfire-peril': 'fire',
    'court-of-cats-feast': 'task',
    'time-loop-trapped-npcs': 'loop',
    'dreamlands-familiar-face': 'wake',
    'the-village-of-hush-preparations': 'errand',
    'court-of-cats-queens-court': 'bargain',
    'throne-of-three-goddess': 'guarding',
  };

  var PALETTES = [
    ['#6b8f5e', '#2c3a28'], ['#a67c52', '#3a2a1c'], ['#7d8fa6', '#262f3a'], ['#b0705a', '#3a211b'],
    ['#8d7ab0', '#2b2338'], ['#c1a35a', '#3a301a'], ['#6fa89f', '#1f332f'], ['#a05a6a', '#35202a'],
  ];

  /* ---------------- deterministic randomness ---------------- */

  function rngFrom(seed) {
    var a = (typeof seed === 'number' ? seed : 0) >>> 0;
    a = (a ^ 0x9E3779B9) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(list, rng) { return list[Math.floor(rng() * list.length)]; }

  /* ---------------- generation ---------------- */

  /** Whether an outcome has an NPC role (and which). */
  function roleForOutcome(outcome) { return ROLE_FOR_OUTCOME[outcome] || null; }

  /**
   * generateNpc({ outcome | role, sceneId?, situation?, seed })
   * Returns the contract's value, or null when the outcome has no NPC role.
   */
  function generateNpc(input) {
    var inp = input || {};
    var role = inp.role || roleForOutcome(inp.outcome);
    if (!role || !SITUATIONS[role]) return null;
    var rng = rngFrom(Number.isInteger(inp.seed) ? inp.seed : 0);
    var situations = SITUATIONS[role];
    // The default pool is the original situations; the place-driven ones (`hinted: true`) join it only when a place suggests them.
    var keys = Object.keys(situations).filter(function (k) { return !situations[k].hinted; });
    var hinted = inp.situation || SCENE_SITUATION[inp.sceneId];
    // `situations` (PD-104): the situations the PLACE supports, in preference order; the seed picks among them.
    var offered = Array.isArray(inp.situations) ? inp.situations.filter(function (k) { return situations[k]; }) : [];
    var situation = hinted && situations[hinted] ? hinted : pick(offered.length ? offered : keys, rng);
    var s = situations[situation];
    var first = pick(NAMES, rng), last = pick(SURNAMES, rng);
    var ancestry = pick(ANCESTRIES, rng);
    return {
      role: role,
      situation: situation,
      seed: Number.isInteger(inp.seed) ? inp.seed : 0,
      name: B(first.en + ' ' + last.en, first.ru + ' ' + last.ru),
      ancestry: { id: ancestry.id, shape: ancestry.shape, en: ancestry.name.en, ru: ancestry.name.ru },
      look: pick(LOOKS, rng),
      line: pick(s.lines, rng),
      need: s.need,
      avatar: { ancestry: ancestry.id, shape: ancestry.shape, palette: Math.floor(rng() * PALETTES.length), colors: null },
      adversaryId: null,
      generated: true,
    };
  }

  /** Avatar colours for a palette index (the view paints with these). */
  function paletteColors(index) { var p = PALETTES[((index % PALETTES.length) + PALETTES.length) % PALETTES.length]; return { skin: p[0], shade: p[1] }; }

  return {
    ROLE_FOR_OUTCOME: ROLE_FOR_OUTCOME, ANCESTRIES: ANCESTRIES, SITUATIONS: SITUATIONS, SCENE_SITUATION: SCENE_SITUATION,
    LOOK_COUNT: LOOKS.length, NAME_COUNT: NAMES.length, PALETTE_COUNT: PALETTES.length,
    roleForOutcome: roleForOutcome, generateNpc: generateNpc, paletteColors: paletteColors,
  };
});
