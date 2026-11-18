/* ============================================================
   Bacchus's Atlas — darkheart-guidance.js
   The scene's GM Guidance (PD-104): a few short, optional suggestions that tie the
   rolled outcome and its participants to the PLACE. Authored templates with
   metadata, chosen deterministically from the place's character tags and one of
   its own source features; no runtime AI, no network, no state.

   Every line is { en, ru } and is a suggestion, never a fact: the Master decides.
   Only guidance relevant to the current outcome is returned, and a variant is
   picked by a hash of (environment, outcome, slot), so two different places
   rarely read the same.

   Variables: {env} the environment's name, {feat} the name of one of its source
   features (the places the party can interact with), {npc} the generated NPC's
   name. They are put in «guillemets», so the Russian never needs a case ending.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DarkheartGuidance = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var B = function (en, ru) { return { en: en, ru: ru }; };
  /** A variant: shown when the place carries any of `tags` (none = the generic fallback). */
  var V = function (tags, en, ru) { return { tags: tags, en: en, ru: ru }; };

  var INTRO = B('Optional suggestions: take, change or ignore them. You decide what is true.', 'Необязательные подсказки: берите, меняйте или отбрасывайте. Что правда, решаете вы.');

  /* ---------------- the banks ---------------- */

  /* A slot is one short suggestion; its `label` names it for the Master. */
  var BANK = {
    'creature-fail-fear': [
      { id: 'why', label: B('Why they are here', 'Почему они здесь'), v: [
        V(['wild'], 'The wild ground of {env} is their territory. The party has walked in on a kill, a den or a trail near {feat}.', 'Дикие земли «{env}» — их территория. Отряд наткнулся на добычу, логово или тропу у «{feat}».'),
        V(['outlaw'], 'They hold the road through {env}: a toll, an ambush at {feat}, or a camp the party was never meant to find.', 'Они держат дорогу через «{env}»: плата за проход, засада у «{feat}» или лагерь, который отряд не должен был найти.'),
        V(['haunted'], 'Something that cannot rest wants the party to stay. They rise from the ground around {feat}.', 'Нечто неупокоенное не хочет отпускать отряд. Они поднимаются из земли у «{feat}».'),
        V(['lair'], 'This is a lair and the party is inside it. They defend it, and they know {feat} better than the party does.', 'Это логово, и отряд внутри него. Они защищают его и знают «{feat}» лучше отряда.'),
        V(['deadly'], 'The place has already worn the party down; the opposition arrives when they are weakest, near {feat}.', 'Место уже измотало отряд; противник появляется, когда силы на исходе, у «{feat}».'),
        V([], 'Hostile opposition has noticed the party in {env}. Decide whether they hunted the party or were simply here first.', 'Враждебный противник заметил отряд в «{env}». Решите: они охотились на отряд или просто были здесь раньше.'),
      ] },
      { id: 'ground', label: B('Use the ground', 'Используйте местность'), v: [
        V(['bog'], 'Fight on bad footing: deep water and sucking mud. Moving costs more than striking.', 'Бой на плохой опоре: глубокая вода и вязкая грязь. Передвигаться труднее, чем бить.'),
        V(['haunted', 'dark'], 'Fight in poor light; a lantern is a resource, and sound carries wrongly.', 'Бой в плохом свете: фонарь — ресурс, а звуки разносятся неверно.'),
        V(['ruin'], 'Broken walls give both sides cover, and a failing section can split the fight in two.', 'Обломки стен дают укрытие обеим сторонам, а рушащийся участок может разорвать бой надвое.'),
        V(['hard'], 'Cover and tangle favour the defenders near {feat}; the party must break their line or go around.', 'Укрытия и заросли у «{feat}» на стороне защитников; отряду нужно прорвать строй или обойти.'),
        V(['fire'], 'Let smoke and flame take the choice away: some squares are worth holding, some are not.', 'Пусть дым и пламя отнимут выбор: одни клетки стоит удерживать, другие нет.'),
        V([], 'Give the ground one edge for the defenders and one the party can find at {feat}.', 'Дайте местности одно преимущество для защитников и одно — для отряда, у «{feat}».'),
      ] },
      { id: 'end', label: B('How it ends', 'Чем кончится'), v: [
        V([], 'Decide beforehand what makes them break off: a fallen leader, fire, or the party reaching {feat}.', 'Заранее решите, что заставит их отступить: павший предводитель, огонь или выход отряда к «{feat}».'),
      ] },
    ],
    'creature-fail-hope': [
      { id: 'why', label: B('Why they are here', 'Почему они здесь'), v: [
        V(['folk'], 'A trade party, patrol or group of travellers rests at {feat} in {env}. They are not looking for a fight and can end one quickly.', 'Торговый отряд, дозор или путники отдыхают у «{feat}» в «{env}». Драки они не ищут, но закончить её умеют быстро.'),
        V(['fey'], 'The fey hold {env} and its courtesies. The party are guests until they are not.', 'Феи хозяйничают в «{env}» и следят за его приличиями. Отряд — гости, пока не станет иначе.'),
        V(['outlaw'], 'They keep a toll at {feat}: formidable, orderly and open to a bargain.', 'Они держат пост у «{feat}»: грозные, дисциплинированные и готовые торговаться.'),
        V(['ruin'], 'They have settled in the ruin at {feat} and ask who comes uninvited.', 'Они обосновались в руинах у «{feat}» и спрашивают, кто пришёл без приглашения.'),
        V(['wild'], 'They share {env} with its beasts and keep to their own side. The party is the unexpected thing.', 'Они делят «{env}» с местным зверьём и держатся своей стороны. Неожиданностью стал отряд.'),
        V(['refuge', 'serene'], 'They are resting at {feat} and watching the road, wary but not hostile.', 'Они отдыхают у «{feat}» и следят за дорогой: настороженно, но без враждебности.'),
        V([], 'A group with its own business crosses the party’s path in {env}. They are strong, and they would rather not spend it.', 'Группа со своими делами пересекает путь отряда в «{env}». Они сильны и предпочли бы не тратить эту силу.'),
      ] },
      { id: 'manner', label: B('How to play them', 'Как их играть'), v: [
        V(['fey'], 'Courtesies and bargains: every favour has a price, named out loud and kept.', 'Приличия и сделки: у каждой услуги своя цена, названная вслух и соблюдённая.'),
        V(['folk', 'outlaw'], 'Questions, news and a price for the road. They want something small: passage, a name, a favour.', 'Вопросы, новости и цена за дорогу. Они хотят малого: прохода, имени, услуги.'),
        V([], 'Let them speak first. They want something small and will weigh what the party offers.', 'Пусть заговорят первыми. Они хотят малого и взвесят то, что предложит отряд.'),
      ] },
      { id: 'turn', label: B('If it turns', 'Если всё обернётся плохо'), v: [
        V([], 'This is a meeting, not a fight. The adversaries below stay on hand only if someone gives them cause.', 'Это встреча, а не бой. Противники ниже остаются наготове, только если кто-то даст повод.'),
      ] },
    ],
    'creature-success-fear': [
      { id: 'where', label: B('Where they are caught', 'Где они в беде'), bySituation: {
        roots: [B('{npc} is caught in the roots near {feat}; every pull tightens them.', '{npc} в корнях у «{feat}»: каждый рывок затягивает их туже.'), B('{npc} hangs half-buried in roots at {feat}, and the ground is closing.', '{npc} увязает в корнях у «{feat}», а земля смыкается.')],
        collapse: [B('{npc} is pinned under fallen stone near {feat}, and more is shifting.', 'Под упавшим камнем у «{feat}» — {npc}, и там ещё что-то сдвигается.'), B('{npc} is trapped beneath the broken beams at {feat}; the ceiling groans.', 'Под обломками балок у «{feat}» — {npc}; перекрытие стонет.')],
        bog: [B('{npc} is sinking into the mire near {feat}, and a wrong move pulls them deeper.', '{npc} тонет в трясине у «{feat}», и неверное движение утянет глубже.'), B('{npc} clings to a rotten log at {feat} while the water rises.', '{npc} цепляется за гнилое бревно у «{feat}», пока поднимается вода.')],
        fire: [B('{npc} is cut off by flames near {feat}; the smoke hides every way out.', 'Огонь отрезал {npc} у «{feat}»; дым скрывает все пути.'), B('{npc} shelters in a hollow at {feat} while the fire closes in.', '{npc} прячется в ложбине у «{feat}», пока огонь подбирается ближе.')],
        beast: [B('{npc} is treed or cornered near {feat}, and something is circling.', 'Зверь загнал {npc} на дерево или в угол у «{feat}», и кто-то кружит рядом.'), B('{npc} is hurt and cannot run from what is stalking them at {feat}.', 'У {npc} нет сил убежать от того, кто выслеживает их у «{feat}».')],
        snare: [B('{npc} is held in a snare or pit at {feat}, and whoever set it will be back.', '{npc} в ловушке или яме у «{feat}», и поставивший её скоро вернётся.'), B('{npc} is bound at {feat} as bait for someone else.', 'У «{feat}» привязали {npc} как приманку для кого-то другого.')],
        lost: [B('{npc} has wandered off the path at {feat} and cannot find it again; the dark is coming.', '{npc} сбивается с тропы у «{feat}» и не может найти её; близится тьма.'), B('{npc} is lost near {feat}, going in circles, and growing frightened.', '{npc} ходит кругами у «{feat}» и всё сильнее боится.')],
        spirit: [B('{npc} cannot leave {feat}; something there holds them in place and grows stronger as night comes on.', '{npc} не может уйти от «{feat}»: что-то держит их на месте и крепнет с наступлением ночи.'), B('{npc} is being drawn toward {feat} by a presence they cannot resist.', 'Неведомая сила тянет {npc} к «{feat}», и сопротивляться ей трудно.')],
      }, v: [] },
      { id: 'rescue', label: B('The rescue', 'Спасение'), v: [
        V([], 'Reaching them is the scene: let {feat} be the obstacle, and let how the party helps shape what the NPC offers afterwards.', 'Сама дорога к ним и есть сцена: пусть препятствием станет «{feat}», а то, как отряд поможет, определит, что предложит NPC потом.'),
      ] },
      { id: 'threat', label: B('Optional threat', 'Необязательная угроза'), v: [
        V(['wild', 'haunted', 'outlaw', 'lair'], 'If you want a fight, thematic adversaries are listed below; otherwise the peril is the place itself.', 'Если нужен бой, подходящие противники перечислены ниже; иначе опасность — само место.'),
        V([], 'The peril can be purely the place. Adversaries below are an option, not an obligation.', 'Опасность может быть просто в самом месте. Противники ниже — вариант, не обязанность.'),
      ] },
    ],
    'creature-success-hope': [
      { id: 'hook', label: B('The request', 'Просьба'), bySituation: {
        'lost-item': [B('{npc} lost something dear in {env}, probably near {feat}, and asks the party to look.', 'У {npc} пропало что-то дорогое в «{env}», вероятно у «{feat}», и они просят отряд поискать.'), B('{npc} describes a keepsake they dropped by {feat}; they cannot go back for it.', 'У {npc} осталась у «{feat}» памятная вещь, а вернуться за ней нельзя.')],
        'missing-person': [B('Someone {npc} loves went into {env} and has not returned; the last sign was near {feat}.', 'Тот, кто дорог {npc}, ушёл в «{env}» и не вернулся; последний след был у «{feat}».'), B('{npc} asks the party to find a missing companion; the trail starts at {feat}.', '{npc} просит отряд найти пропавшего спутника; след начинается у «{feat}».')],
        message: [B('{npc} needs a message carried onward and cannot leave {env} themselves.', '{npc} нужно передать весть дальше, а уйти из «{env}» им самим нельзя.'), B('{npc} presses a sealed note on the party; it must pass {feat} to reach its reader.', '{npc} вручает отряду запечатанную записку; чтобы дойти до адресата, ей нужно миновать «{feat}».')],
        task: [B('{npc} offers shelter in {env} in return for one small favour only guests can do.', '{npc} предлагает приют в «{env}» за одну небольшую услугу, которую могут оказать только гости.')],
        curse: [B('Something has followed {npc} out of {env}. They ask the party to see it gone from {feat}.', 'Что-то последовало за {npc} из «{env}»; избавиться от него нужно у «{feat}».'), B('{npc} feels watched since passing {feat} and begs the party to find out why.', 'После «{feat}» {npc} ощущает чужой взгляд и умоляет отряд выяснить причину.')],
        errand: [B('{npc} needs a hand with a task that must be done before dusk in {env}.', '{npc} нужна помощь с делом, которое надо закончить в «{env}» до темноты.')],
        loop: [B('{npc} is stuck in a day that will not end, and asks the party to help break it.', '{npc} живёт в дне, который не кончается, и просит отряд помочь разорвать круг.')],
        wake: [B('{npc} cannot wake and asks the party to help them find the way out.', '{npc} не может проснуться и просит отряд помочь найти выход.')],
      }, v: [] },
      { id: 'where', label: B('Where it leads', 'Куда это ведёт'), v: [
        V([], 'Let the lead point back into the place: {feat} is where the item, trail or answer waits.', 'Пусть зацепка ведёт обратно в место: у «{feat}» ждёт вещь, след или ответ.'),
      ] },
      { id: 'return', label: B('What the NPC offers', 'Что предложит NPC'), v: [
        V([], 'In return they can offer news of the next hex, shelter, or a favour owed. You decide; the app tracks none of it.', 'Взамен они могут дать вести о следующем гексе, приют или услугу в долг. Решаете вы; приложение ничего из этого не отслеживает.'),
      ] },
    ],
    'landmark-fail-fear': [
      { id: 'omens', label: B('Omen motifs (pick one, or none)', 'Мотивы знамения (выберите или отбросьте)'), v: [
        V(['haunted'], 'A cold spot that follows the party; names whispered from {feat}; a lantern lit by no one.', 'Холод, идущий за отрядом; шёпот имён со стороны «{feat}»; фонарь, зажжённый никем.'),
        V(['bog'], 'Bubbles rising in a line toward the party; a handprint in the mire; a light that moves away when watched.', 'Пузыри, идущие цепочкой к отряду; отпечаток руки в трясине; огонёк, что уходит, стоит на него посмотреть.'),
        V(['fey'], 'Laughter with no source; a ring of flowers that was not there; paths that rearrange at {feat}.', 'Смех без источника; кольцо цветов, которого не было; тропы, перестраивающиеся у «{feat}».'),
        V(['wild'], 'Tracks that circle the camp; every animal gone quiet; bones set in a pattern at the edge of {env}.', 'Следы, обходящие лагерь по кругу; всё зверьё замолкло; кости, выложенные узором на краю «{env}».'),
        V(['deadly', 'hard'], 'Branches that close behind the party; a path that ends at {feat}; trees leaning inward.', 'Ветви, смыкающиеся за отрядом; тропа, обрывающаяся у «{feat}»; деревья, склонённые внутрь.'),
        V([], 'A sound that stops whenever it is listened for; a mark newly cut at {feat}; light failing too early.', 'Звук, обрывающийся, стоит прислушаться; свежая зарубка у «{feat}»; свет, гаснущий слишком рано.'),
      ] },
      { id: 'meaning', label: B('What it means', 'Что это значит'), v: [
        V([], 'Leave its meaning open until it matters: an omen can point to a hex, an enemy or a cost. There is no rest here; let the omen be why.', 'Оставьте смысл открытым, пока он не понадобится: знамение может указывать на гекс, врага или цену. Отдыха здесь нет; пусть причиной станет знамение.'),
      ] },
    ],
    'landmark-fail-hope': [
      { id: 'happened', label: B('What happened here (pick one)', 'Что здесь случилось (выберите одно)'), v: [
        V(['fire'], 'A burning: scorched earth, and an unfinished story at {feat}.', 'Пожар: выжженная земля и неоконченная история у «{feat}».'),
        V(['haunted'], 'A death that was never answered. The dead keep to {feat}, waiting for someone to say what was done.', 'Смерть, на которую никто не ответил. Мёртвые держатся у «{feat}» и ждут, что кто-то скажет, что было сделано.'),
        V(['ruin'], 'A place people left in a hurry: work unfinished at {feat}, a door still open, belongings not taken.', 'Место, которое люди покинули в спешке: недоделанная работа у «{feat}», незапертая дверь, брошенные вещи.'),
        V(['bog'], 'A crossing that took people; markers left in the mire, and no one came back for them.', 'Переправа, забравшая людей; вехи в трясине, и никто не вернулся за ними.'),
        V(['fey'], 'A bargain broken. The place keeps its side of it; no one else has kept theirs.', 'Нарушенная сделка. Место держит своё слово; больше никто своего не сдержал.'),
        V(['wild'], 'A camp or caravan that never arrived; what took it left signs around {feat}.', 'Лагерь или обоз, что так и не дошёл; то, что его забрало, оставило следы у «{feat}».'),
        V(['tragic'], 'A loss the land remembers: someone mourned here, and the mourning never ended.', 'Утрата, которую помнит земля: здесь кого-то оплакивали, и плач так и не кончился.'),
        V([], 'Something was lost here and never recovered; {feat} holds the clearest sign of it.', 'Здесь что-то потеряли и не вернули; яснее всего об этом говорит «{feat}».'),
      ] },
      { id: 'clue', label: B('What the party can learn', 'Что может узнать отряд'), v: [
        V([], 'One clear detail at {feat} is enough. No tragedy needs a full backstory; let the party fill in the rest.', 'Одной ясной детали у «{feat}» довольно. Трагедии не нужна полная предыстория; остальное пусть додумает отряд.'),
      ] },
    ],
    'landmark-success-fear': [
      { id: 'warning', label: B('Warning signs', 'Знаки опасности'), v: [
        V(['wild'], 'Fresh tracks bound for the party’s route; carrion hung in the branches; a den far larger than it should be.', 'Свежие следы, ведущие к маршруту отряда; падаль на ветвях; логово куда больше, чем должно быть.'),
        V(['outlaw'], 'A camp abandoned in a hurry; a snapped tripwire; marks cut into the trees along {feat}.', 'Спешно брошенный лагерь; оборванная растяжка; зарубки на деревьях вдоль «{feat}».'),
        V(['haunted'], 'A grave newly disturbed at {feat}; mist where the air was warm.', 'Свежеразрытая могила у «{feat}»; туман там, где было тепло.'),
        V(['bog'], 'Water risen overnight; dead fish on the bank; a wide trail through the reeds.', 'Вода, поднявшаяся за ночь; дохлая рыба на берегу; широкая просека в камышах.'),
        V(['fey'], 'Gifts left at {feat} that no one will explain; a sudden hush in the music of the place.', 'Дары у «{feat}», которых никто не объяснит; внезапная тишина в музыке места.'),
        V(['fire', 'crisis'], 'Ash on the wind; every animal fleeing the same way.', 'Пепел на ветру; всё зверьё бежит в одну сторону.'),
        V(['deadly', 'hard'], 'Fresh falls across the path ahead of {feat}; something large has come this way and left.', 'Свежие завалы на тропе перед «{feat}»; что-то крупное прошло здесь и ушло.'),
        V([], 'Smoke on the horizon; a torn banner; a message nailed to a tree at {feat}.', 'Дым на горизонте; рваный стяг; послание, прибитое к дереву у «{feat}».'),
      ] },
      { id: 'noattack', label: B('Nothing attacks yet', 'Нападения ещё нет'), v: [
        V([], 'Nothing attacks. Give the party one clear sign and let them speculate; the danger can wait for a later hex.', 'Никто не нападает. Дайте отряду один ясный знак и пусть гадает; опасность может ждать в следующем гексе.'),
      ] },
    ],
    'landmark-success-hope': [
      { id: 'campfire', label: B('The Traveler’s campfire', 'Костёр Путника'), v: [
        V(['wild'], 'In a hollow among roots near {feat}, ringed by stones no one remembers placing: a smokeless, magical fire.', 'В ложбине среди корней у «{feat}», в кольце камней, которые никто не помнит выкладывавшим: магический костёр без дыма.'),
        V(['ruin'], 'Inside the shelter of the old walls at {feat}: a fire no one lit and no wind can move.', 'В укрытии старых стен у «{feat}»: огонь, который никто не разжигал и который не гнёт ветер.'),
        V(['bog'], 'On the one dry rise in {env}: its light lies on the water without a glare.', 'На единственном сухом пригорке в «{env}»: его свет лежит на воде без бликов.'),
        V(['fey'], 'Where the glade is thinnest: the fire’s colours shift the way fey moods do.', 'Там, где поляна тоньше всего: цвета огня переливаются, как настроение фей.'),
        V(['folk', 'refuge'], 'At a clearing everyone uses near {feat}: the Traveler is simply there, as if they always were.', 'На поляне у «{feat}», которой пользуются все: Путник просто здесь, будто был всегда.'),
        V(['serene'], 'In a quiet nook at {feat}: the first truly warm place in a long while.', 'В тихом уголке у «{feat}»: первое по-настоящему тёплое место за долгое время.'),
        V([], 'At the edge of {env}, near {feat}: a small fire in a ring of stones, burning with no fuel.', 'На краю «{env}», у «{feat}»: небольшой костёр в кольце камней, горящий без топлива.'),
      ] },
      { id: 'rule', label: B('No source campfire needed', 'Костёр в источнике не нужен'), v: [
        V([], 'The place does not have to mention a campfire; this one is Darkheart’s. Describe it and the Traveler as much or as little as you like, and the rest is safe.', 'Месту не нужно упоминать костёр: этот — из Darkheart. Опишите его и Путника как угодно подробно; отдых здесь безопасен.'),
      ] },
    ],
    'hazard-fail-fear': [
      { id: 'threat', label: B('The threat', 'Угроза'), v: [
        V(['bog'], 'The mire itself: footing gives way and the water pulls under; {feat} is the worst stretch.', 'Сама трясина: опора уходит из-под ног, вода затягивает; хуже всего участок у «{feat}».'),
        V(['fire'], 'A fire front: smoke blinds, and the wind swings at {feat}.', 'Фронт огня: дым слепит, а ветер меняется у «{feat}».'),
        V(['water'], 'A crossing that sweeps people off their feet: current, cold and nothing to hold.', 'Переправа, сбивающая с ног: течение, холод и не за что ухватиться.'),
        V(['uncanny'], 'The place’s own strangeness turned violent: surges, skips or shifts that strike at {feat}.', 'Странность самого места обернулась насилием: выбросы, сбои и сдвиги бьют у «{feat}».'),
        V(['deadly', 'hard'], 'The ground itself: falling timber, a failing slope and a path that closes at {feat}.', 'Сама земля: падающие стволы, оседающий склон и тропа, смыкающаяся у «{feat}».'),
        V([], 'A severe natural danger at {feat}; it can maim or kill if the party blunders in.', 'Серьёзная природная опасность у «{feat}»; она может покалечить или убить, если отряд сунется вслепую.'),
      ] },
      { id: 'ways', label: B('Ways through', 'Как пройти'), v: [
        V(['bog'], 'Throw a line, find the firm path, or let one hero anchor the others.', 'Бросить верёвку, найти твёрдую тропу или дать одному герою стать опорой для остальных.'),
        V(['fire'], 'Backburn a line, use wet cloth, or run for the stream.', 'Пустить встречный огонь, закрыться мокрой тканью или бежать к ручью.'),
        V(['water'], 'Rope the crossing, hunt for a ford, or fell a tree for a bridge.', 'Натянуть верёвку, поискать брод или свалить дерево на мост.'),
        V(['hard', 'deadly'], 'Cut a line through, climb over, or follow an animal path the locals know.', 'Прорубить проход, перелезть поверху или пойти звериной тропой, известной местным.'),
        V([], 'A careful scout, a clever use of a resource, or everyone at once.', 'Осторожная разведка, умное использование припасов или общее усилие.'),
      ] },
      { id: 'clock', label: B('The countdown', 'Отсчёт'), v: [
        V([], 'The countdown is yours to set: use the outcome’s number or resize it to the scene. If the place already has its own, keep, resize or ignore it.', 'Отсчёт ставите вы: возьмите число исхода или подгоните под сцену. Если у места есть свой отсчёт, сохраните его, измените или проигнорируйте.'),
      ] },
    ],
    'hazard-fail-hope': [
      { id: 'obstacle', label: B('The obstacle', 'Препятствие'), v: [
        V(['hard'], 'Thick growth and fallen trunks across the way at {feat}: slow and tiring, not deadly.', 'Густая поросль и упавшие стволы на пути у «{feat}»: медленно и утомительно, но не смертельно.'),
        V(['bog'], 'A stretch of sucking mud or a flooded dip at {feat}: wet and slow.', 'Полоса вязкой грязи или залитая ложбина у «{feat}»: мокро и медленно.'),
        V(['water'], 'A stream too wide to hop, cold and awkward to cross.', 'Ручей слишком широк, чтобы перепрыгнуть, холодный и неудобный для переправы.'),
        V(['fire'], 'A smouldering patch and drifting ash across the way.', 'Тлеющий участок и летящий пепел поперёк пути.'),
        V(['uncanny'], 'A patch where the way shifts and fogs; the party loses time, not safety.', 'Участок, где путь меняется и тонет в тумане: отряд теряет время, но не безопасность.'),
        V(['wild'], 'A thorn thicket or a warren that riddles the path near {feat}.', 'Колючий кустарник или нора, изрывшая тропу у «{feat}».'),
        V([], 'Something in the place’s own terrain blocks the way at {feat}: an inconvenience, not a threat.', 'Что-то в рельефе самого места перегораживает путь у «{feat}»: неудобство, а не угроза.'),
      ] },
      { id: 'around', label: B('Possible ways around', 'Пути в обход'), v: [
        V(['hard', 'wild'], 'Hack through, go under, or find the animal path; each costs time or a little effort.', 'Прорубиться, подлезть или найти звериную тропу; каждый путь стоит времени или немного сил.'),
        V(['bog', 'water'], 'Wade, build a crossing, or go around the long way; each costs something small.', 'Перейти вброд, сделать переправу или обойти долгим путём; каждый вариант стоит чего-то небольшого.'),
        V([], 'Go over, under or around; trade time for safety; or spend a resource to skip it.', 'Перелезть, подлезть или обойти; обменять время на безопасность; или потратить припас, чтобы пропустить.'),
      ] },
      { id: 'scale', label: B('Keep it small', 'Не раздувайте'), v: [
        V([], 'This is not a deadly hazard: the party is delayed or inconvenienced, not threatened with death.', 'Это не смертельная опасность: отряд задержан или раздосадован, но смерть ему не грозит.'),
      ] },
    ],
    'resource-success-fear': [
      { id: 'where', label: B('Where it lies', 'Где оно лежит'), v: PLACEMENT(),  },
      { id: 'guardA', label: B('Guard A: creatures', 'Охрана А: существа'), v: [
        V(['wild'], 'A territorial animal, a mother or a pack defends it; the den lies beside {feat}.', 'Её защищает территориальный зверь, мать с детёнышами или стая; логово рядом с «{feat}».'),
        V(['haunted'], 'The dead stand guard at {feat}: bones, or a restless soul.', 'Мёртвые стоят на страже у «{feat}»: кости или неупокоенная душа.'),
        V(['outlaw', 'lair'], 'Whoever hid it left lookouts, and they watch {feat}.', 'Тот, кто её спрятал, оставил дозорных, и они следят за «{feat}».'),
        V(['fey'], 'Sylvan guardians or sprites protect it as a matter of courtesy; they test before they strike.', 'Лесные стражи или духи защищают её из приличия; сперва испытывают, потом бьют.'),
        V(['ruin'], 'The ruin’s old inhabitants, vermin or the dead, still hold {feat}.', 'Прежние обитатели руин, паразиты или мёртвые, всё ещё держат «{feat}».'),
        V([], 'A creature that has made {feat} its own; the encounter below lists thematic options.', 'Существо, сделавшее «{feat}» своим; подходящие варианты перечислены в разделе встречи ниже.'),
      ] },
      { id: 'guardB', label: B('Guard B: hazard', 'Охрана Б: опасность'), v: [
        V(['hard'], 'Snapping vines, or a deadfall of timber and rope at {feat}.', 'Хлещущие лозы или ловушка из брёвен и верёвок у «{feat}».'),
        V(['bog'], 'The cache sits in sucking mud or a flooded hollow; the last step is the dangerous one.', 'Тайник лежит в вязкой грязи или залитой ложбине; опасен именно последний шаг.'),
        V(['ruin'], 'A rotted floor and loose masonry around {feat}.', 'Прогнивший пол и шаткая кладка вокруг «{feat}».'),
        V(['uncanny', 'fey'], 'The place fights back: paths turn, or a ward flares as the party reaches {feat}.', 'Место сопротивляется: тропы поворачивают, или оберег вспыхивает, когда отряд подходит к «{feat}».'),
        V(['haunted', 'dark'], 'Foul air or a creeping chill gathers around {feat}; it saps those who linger.', 'Дурной воздух или ползущий холод собирается у «{feat}»; он вытягивает силы у тех, кто задерживается.'),
        V([], 'A trap or an unstable spot makes the final reach for {feat} the dangerous part.', 'Ловушка или шаткое место делают опасным последний рывок к «{feat}».'),
      ] },
      { id: 'pick', label: B('One guard is enough', 'Хватит одной охраны'), v: [
        V([], 'Pick creatures or the hazard, not both. A guard is not combat until the party provokes it, and the countdown is your call.', 'Выберите существ или опасность, но не оба. Охрана — ещё не бой, пока отряд её не потревожит, а отсчёт ставите вы.'),
      ] },
      { id: 'reward', label: B('The reward', 'Награда'), v: REWARD() },
      { id: 'clue', label: B('A quest clue instead', 'Зацепка вместо награды'), v: CLUE() },
    ],
    'resource-success-hope': [
      { id: 'where', label: B('Where it lies', 'Где оно лежит'), v: PLACEMENT() },
      { id: 'reward', label: B('The reward', 'Награда'), v: REWARD() },
      { id: 'clue', label: B('A quest clue instead', 'Зацепка вместо награды'), v: CLUE() },
    ],
  };

  /* Shared resource slots (hoisted: used above). */
  function PLACEMENT() {
    return [
      V(['ruin'], 'A chest half-sunk in rubble, or a pack under a fallen beam near {feat}.', 'Сундук, наполовину ушедший в обломки, или поклажа под упавшей балкой у «{feat}».'),
      V(['haunted'], 'A traveller’s pack beside old bones at {feat}; its owner never left.', 'Рюкзак путника рядом со старыми костями у «{feat}»; хозяин так и не ушёл.'),
      V(['wild'], 'A hollow-tree cache, or a den’s old hoard tucked among the roots by {feat}.', 'Тайник в дупле или старый запас зверя среди корней у «{feat}».'),
      V(['outlaw', 'lair'], 'A stash buried under a marked stone near {feat}.', 'Схрон, закопанный под меченым камнем у «{feat}».'),
      V(['bog'], 'A waterlogged chest or backpack caught in the roots at {feat}.', 'Размокший сундук или рюкзак, застрявший в корнях у «{feat}».'),
      V(['fey'], 'A gift left in a ring of mushrooms, or a basket set on a stump at {feat}.', 'Дар в кольце грибов или корзина на пне у «{feat}».'),
      V(['serene', 'folk', 'refuge'], 'A satchel left at {feat}, as if someone meant it to be found.', 'Сумка, оставленная у «{feat}», словно кто-то хотел, чтобы её нашли.'),
      V(['hard'], 'A backpack snagged in the undergrowth at {feat}.', 'Рюкзак, зацепившийся за подлесок у «{feat}».'),
      V([], 'A chest, a backpack, a hollow-tree cache or a buried stash at {feat}.', 'Сундук, рюкзак, тайник в дупле или закопанный схрон у «{feat}».'),
    ];
  }
  function REWARD() {
    return [V([], 'Roll on your own loot tables, or offer a boon instead. The app does not roll a reward for you.', 'Бросайте по своим таблицам добычи или предложите дар. Приложение само награду не определяет.')];
  }
  function CLUE() {
    return [V([], 'Players may take a quest clue in place of a material reward. Tie it to the party’s current quest; you know it, and this page does not track it.', 'Игроки могут взять зацепку для задания вместо материальной награды. Свяжите её с текущим заданием отряда; оно вам известно, а эта страница заданий не отслеживает.')];
  }

  /* ---------------- selection ---------------- */

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }

  /* English templates leave {env}/{feat} bare and get «guillemets» here; Russian templates already carry them
   * around the placeholder, so the name is dropped in as it is and never needs a case ending. */
  function fill(text, vars, quote) {
    var q = function (s) { return quote ? '«' + s + '»' : s; };
    return text.split('{env}').join(q(vars.env)).split('{feat}').join(q(vars.feat)).split('{npc}').join(vars.npc);
  }
  function filled(b, vars) { return { en: fill(b.en, vars.en, true), ru: fill(b.ru, vars.ru, false) }; }

  /** The Master-facing text of a variant for both languages. */
  function render(b, env, feat, npcName) {
    var name = function (n, lang) { return (n && (n[lang] || n.en)) || ''; };
    return filled(b, {
      en: { env: name(env.name, 'en'), feat: name(feat && feat.name, 'en') || name(env.name, 'en'), npc: (npcName && npcName.en) || 'The NPC' },
      ru: { env: name(env.name, 'ru'), feat: name(feat && feat.name, 'ru') || name(env.name, 'ru'), npc: (npcName && npcName.ru) || 'NPC' },
    });
  }

  function pickFeature(features, seedKey) {
    features = (features || []).filter(function (f) { return f && f.name && f.name.en; });
    if (!features.length) return null;
    return features[hash('feat|' + seedKey) % features.length];
  }

  /* A profile lists its tags most characteristic first (data/darkheart-suitability.json). The variants of the first two tags
   * that have any form the pool, so a bog reads as a bog before it reads as anything else, and a place with two strong
   * characters can still read either way; the hash then picks within the pool. */
  function pickVariant(slot, tags, seedKey) {
    var pool = [], used = 0;
    for (var i = 0; i < tags.length && used < 2; i++) {
      var forTag = slot.v.filter(function (v) { return v.tags.indexOf(tags[i]) !== -1 && pool.indexOf(v) === -1; });
      if (forTag.length) { pool = pool.concat(forTag); used += 1; }
    }
    if (!pool.length) pool = slot.v.filter(function (v) { return !v.tags.length; });
    if (!pool.length) pool = slot.v;
    return pool[hash(seedKey) % pool.length];
  }

  /**
   * guidanceFor({ outcome, env, profile, npc? })
   * Returns { outcome, intro: {en,ru}, items: [{ id, label: {en,ru}, text: {en,ru} }] }.
   * `npc` is the generated NPC (name, situation) for the two NPC outcomes; `features` the source features the scene shows
   * (default: all of the environment's). Deterministic: same input, same text.
   */
  function guidanceFor(input) {
    var outcome = input.outcome, env = input.env;
    var slots = BANK[outcome];
    if (!slots || !env) return null;
    var tags = (input.profile && input.profile.tags) || [];
    var base = env.id + '|' + outcome;
    // Only features the scene actually shows are pointed at (a fragment never leans on a feature it left out).
    var shown = input.features || env.features || [];
    var feature = pickFeature(shown, base);
    var npcName = input.npc && input.npc.name ? input.npc.name : null;
    var items = [];
    slots.forEach(function (slot) {
      var chosen = null;
      if (slot.bySituation) {
        var key = input.npc && input.npc.situation;
        var list = key && slot.bySituation[key] ? slot.bySituation[key] : null;
        if (!list) {
          // No NPC yet: the slot waits for it (the view renders guidance again once the NPC exists).
          return;
        }
        chosen = list[hash(base + '|' + slot.id + '|' + (input.npc.seed || 0)) % list.length];
      } else {
        chosen = pickVariant(slot, tags, base + '|' + slot.id);
      }
      // A slot may use a different feature, so one line never leans on the same name as the next.
      var f = shown.length > 1 ? pickFeature(shown, base + '|' + slot.id) : feature;
      items.push({ id: slot.id, label: slot.label, text: render(chosen, env, f, npcName) });
    });
    return { outcome: outcome, intro: INTRO, items: items };
  }

  return { BANK: BANK, INTRO: INTRO, guidanceFor: guidanceFor, hash: hash };
});
