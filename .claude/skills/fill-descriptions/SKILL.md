---
name: fill-descriptions
description: Enrich Compass of Ice and Fire location data with concise, canonically-sourced, spoiler-free `description` text (English) and its Russian counterpart `description_ru`. Use whenever asked to write/fill in descriptions for locations in data/raw/locations.json or data/raw/the-wall.json (e.g. "fill in descriptions for the North", "do the Riverlands castles").
---

Your task is to add `description` and `description_ru` properties to location entries in this project's data files.

## Scope

- Process ONLY the subset of features requested (e.g. a given `kingdomId`, `continentId`, or `type` filter). Do not touch entries outside that scope.
- Skip entries where `name` is `null` (unnamed hash ids like `ruin-3f7d714a`) unless explicitly told to include them.
- For each entry, fill BOTH `description` and `description_ru` together as one unit of work — don't leave one language done and the other pending. If an entry already has `description` but `description_ru` is still `null`, just translate the existing English text (see "Russian translation" below) rather than re-researching.
- Modify ONLY the `description` and `description_ru` fields on each entry. Leave every other field (`id`, `name`, `name_ru`, `size`, `confirmed`, `type`, `type_ru`, `continentId`, `kingdomId`, `regionId`, `islandId`) untouched.
- Other tooling in this repo may reclassify entries between turns (e.g. `type` "Other" → "Town"/"Ruin"/"Castle", which changes the `id` prefix, or `size` bumps). Before editing, re-check the entry's current state rather than trusting what was read earlier in the conversation — if an edit fails because the file changed, re-read that entry and retry with its current id/fields.

## Where descriptions live — write to all FOUR places

Every entry's English description and Russian translation must each be written in two places, kept in sync:

1. The location's own record in `data/raw/locations.json` (or `data/raw/the-wall.json` for the Wall) — its `description` and `description_ru` fields.
2. Mirrored verbatim into two flat dictionaries: `data/descriptions.json` (`{ "id": "English description" }`) and `languages/ru/descriptions.json` (`{ "id": "Russian description" }`, same shape, same keys).

After a batch, sanity-check consistency, e.g.:

```
node -e "
const data = require('./data/raw/locations.json');
const desc = require('./data/descriptions.json');
const descRu = require('./languages/ru/descriptions.json');
const rawIds = new Set(data.map(d => d.id));
const descIds = new Set(Object.keys(desc));
const descRuIds = new Set(Object.keys(descRu));
const missing = [...rawIds].filter(id => data.find(d=>d.id===id).description && !descIds.has(id));
const missingRu = [...rawIds].filter(id => data.find(d=>d.id===id).description_ru && !descRuIds.has(id));
const stale = [...descIds].filter(id => !rawIds.has(id) && id !== 'the-wall');
const staleRu = [...descRuIds].filter(id => !rawIds.has(id) && id !== 'the-wall');
console.log('missing en:', missing.length, missing);
console.log('missing ru:', missingRu.length, missingRu);
console.log('stale en:', stale.length, stale);
console.log('stale ru:', staleRu.length, staleRu);
"
```

(`the-wall` is expected to be "stale" against `locations.json` since it lives in the separate `the-wall.json` file — that's fine.)

## Researching content

- Research via web search restricted to `awoiaf.westeros.org` (A Wiki of Ice and Fire) — pass it as an `allowed_domains` filter rather than searching the open web.
- Write in English, using only canonical information from the books. Do not use TV-only details unless they're also present in the books.
- Do not invent or speculate. If a location has very little reliable information, write a short, plain factual sentence instead of padding it out.
- Do not copy wiki text verbatim — write an original summary.
- Keep descriptions concise: usually 2–4 sentences, rarely more than 5.
- The first sentence should explain what the place is (type, location, ruling house/affiliation). Later sentences should cover why it's notable, historically important, or relevant in the books.
- Keep the tone neutral and encyclopedic.
- If the wiki itself hedges a claim ("possibly", "said to be", "believed to"), preserve that hedge — don't state it as settled fact.

Examples:

Winterfell:
"The ancestral seat of House Stark and the largest castle in the North. Built around natural hot springs, it has served as the political and cultural center of the region for thousands of years."

The Twins:
"A pair of fortified castles belonging to House Frey, connected by a bridge spanning the Green Fork of the Trident. The crossing is one of the most strategically important river crossings in Westeros and has shaped the influence of House Frey."

If a feature is extremely minor with almost no canonical information, give a one-sentence description instead of fabricating details.

## Depth scales with `size` — tier 1 (`size: 5`) locations go much deeper

The 2–4 sentence guideline above is the default, and applies to most entries regardless of tier. Tier 1 locations — entries with `"size": 5` — are the exception: they call for substantially more depth, on par with the kingdom-level entries in `data/raw/kingdoms.json` (see that file for the target register/length). Aim for roughly 5–8 sentences per language, more for major cities with several landmarks worth naming. This is more research-intensive than a typical entry — expect to pull from several wiki pages (the location's own page, plus pages for the houses/events/buildings it mentions), not just one.

For every tier 1 entry, cover all of the following that apply:

- **Ruling house or affiliation, if any** — who currently holds the seat, and its formal title where one exists (Warden, Lord Paramount, Prince, etc.). Omit this point entirely for entries with no ruling house (a free city with another government, a natural feature, a ruin).
- **What the place physically looks like and its defining structural or geographic feature** — go beyond "a castle in the North" to the specific thing that makes it distinctive, defensible, or memorable. For example:
  - Riverrun: its position at the joining of the Tumblestone and the Red Fork lets its garrison flood the surrounding ditches during a siege, turning the castle into a de facto island.
  - Winterfell: built over natural hot springs whose water is channeled through the walls and glass gardens to heat them.
- **If it's a city or other major settlement, name its landmark sites** — the specific buildings or institutions that define it, not a vague "notable buildings." For example:
  - King's Landing: the Red Keep, the Great Sept of Baelor, the Dragonpit.
  - Oldtown: the Citadel, seat of the maesters.
  - Braavos: the Titan, the Iron Bank, the House of Black and White.
- **Key historical events tied specifically to that location** — not the kingdom's general history repeated, but what actually happened *there*: a founding, a siege, a battle, a fire, a notable death or wedding (subject to the no-spoilers rule below).

All the style rules elsewhere in this document — no name repetition, no calque, capitalization, no spoilers, proper-noun verification — apply identically at this greater length. More sentences means more surface area for calque and gender-agreement bugs, so re-check each sentence in `description_ru`, not just the opening one.

## No spoilers

Avoid narrating War of the Five Kings-era plot twists as if summarizing the story — specific character deaths, betrayals, forced marriages, resurrections, or other current-book reveals (e.g. don't describe Ramsay Snow's marriage to and murder of Donella Hornwood, Bronn marrying Lollys Stokeworth, the Red Wedding, Beric Dondarrion's resurrections, Euron Greyjoy's Golden Company campaign taking Griffin's Roost/Rain House/Crow's Nest, Stannis capturing Mance Rayder, etc.).

Distant, settled history reads as encyclopedic background, not spoilers, and is fine to include: the Age of Heroes, the Andal invasion, Aegon's Conquest, the Dance of the Dragons, Robert's Rebellion (outcomes only, not blow-by-blow), the Dornish Wars, the Faith Militant uprising, the Doom of Valyria, the Century of Blood, etc.

Also avoid dwelling on gratuitous graphic/violent detail even for historical atrocities — soften specifics into a general statement (e.g. "committed one of the conflict's most infamous atrocities" rather than spelling out castration, rape, or slavery in detail).

## Style: capitalize region names

This project's style capitalizes proper regional names consistently, even where the books themselves sometimes lowercase them: **Crownlands, Riverlands, Westerlands, Stormlands, Kingsroad, the North, Ironborn**. (The Reach, the Vale, Dorne, the Neck, the Iron Islands, and the Wall are already conventionally capitalized and need no special handling.) If you're unsure whether existing text already follows this, grep for the lowercase form before a big batch:

```
grep -c '\briverlands\b\|\bcrownlands\b\|\bwesterlands\b\|\bstormlands\b\|\bkingsroad\b\|\bironborn\b\|\bthe north\b' data/descriptions.json data/raw/locations.json
```

## Style: don't repeat the name

The card already displays the location's name, so don't open the description by restating it — in either language.

- Drop the leading "[Name] is/are ..." (English) or "[Имя] — ..." (Russian) and start directly with the predicate, capitalizing the new first word:
  - "Winterfell is the ancestral seat of House Stark..." → "The ancestral seat of House Stark..."
  - "The Twins are a pair of fortified castles..." → "A pair of fortified castles..."
  - "Винтерфелл — родовой замок Дома Старк..." → "Родовой замок Дома Старк..."
  - The result is a noun-phrase-led fragment rather than a strict subject–verb sentence — that's the intended style, not an error to fix.
- If the opening uses a different verb than "is"/"are" (e.g. "stands", "lies"), apply the same principle anyway and let the verb lead: "The Weeping Tower stands in..." → "Stands in..."
- **Current alternative name/epithet — keep it, drop the primary name**: if the primary name is followed by a still-current nickname in apposition ("Astapor, the Red City, is...", "Qarth, called the Queen of Cities, is...", "Vaes Dothrak, the City of Riders, lies..."), drop the primary name but promote the epithet to the new subject, dropping connector words like "called"/"also called":
  - "Astapor, the Red City, is the southernmost..." → "The Red City is the southernmost..."
- **Former name — keep the current name, don't swap it in**: if the apposition is a name the place used to go by but no longer does ("once called X", "formerly known as X", "once known as X"), do NOT promote the former name to subject — leave the current name in place as normal. Renaming context like this often feeds a later clause (e.g. "its name commemorating a battle..."), which only makes sense if the *current* name stays the subject.
  - "Bitterbridge, once called Stonebridge, is the seat of House Caswell..., its name commemorating a battle..." → leave untouched. (Swapping in "Stonebridge is the seat of... its name commemorating..." would make "its name" wrongly refer to the old name.)
  - The tell: "called"/"also called"/"known as" alone → current epithet, trim the primary name out. "once"/"formerly"/"previously" + "called"/"known as" → former name, leave the primary name alone.
- Apply all of the above identically to `description_ru` — the same logic, just in Russian.

## Style: don't calque English syntax in `description_ru`

Beyond wrong terminology, literal English sentence structure forced into Russian is its own class of bug — grammatically parseable but reads like a translation, not something a native speaker would write. It's easy to miss because the sentence still "reads fine" in isolation; that's exactly how these shipped undetected across two separate audit passes.

**Most important, and the single most common cause: check gender/number agreement after trimming the name (see "don't repeat the name" above).** Removing the leading "[Name] is..." can orphan every pronoun/participle later in the sentence that was implicitly agreeing with the *removed* name's gender rather than whatever noun is actually left in the text. Confirmed real bugs of this exact shape:
- `the-wall`: trimmed to open with "Массивное **укрепление**..." (neuter), but a later "**она** стоит" (feminine) silently assumed the removed "Стена" — fixed to "**оно** стоит" to agree with "укрепление", the noun actually present.
- `ruin-ghoyan-drohe`: "...место каналов и фонтанов, прежде чем **был сожжён**..." — masculine participle with no masculine noun anywhere nearby (silently assuming an unstated "город"). Fixed by switching to active voice: "...пока во время Ройнарских войн его не сожгли валирийские драконы."
- Same pattern also hit `castle-shadow-tower`, `castle-sunspear`, `castle-flints-finger`, `castle-casterly-rock`, `castle-the-bloody-gate`, `castle-castle-black`, `ruin-oros`, `ruin-tyria` — a leading participle or a pronoun several clauses later agreeing with a noun that isn't actually the one stated (often because the entry's generic-type noun switches gender between sentences, e.g. "Резиденция" (f) in sentence one vs. pronouns later written for an implied "замок" (m) that's never actually named).
- **The check**: whenever you write or touch a `description_ru`, trace every он/она/оно/который/-ая/-ое and every passive participle back to the specific noun it's agreeing with *in the text as written* — not what you meant to refer to. If the nearest antecedent is the wrong gender/number, either fix the pronoun/participle or restructure with an explicit noun (sometimes the cleanest fix is switching a leading participial clause to a finite active-voice clause, as in the Ghoyan Drohe example).

Other confirmed calque patterns:
- **Passive-agent placement**: don't shove the instrumental agent to the end of the clause after other adverbials, mimicking English "was X-ed ... [by Y]" word order — Russian naturally puts the agent right after the verb. E.g. "были оттеснены на юг, в Речные земли, Королями Зимы" → "были оттеснены Королями Зимы на юг, в Речные земли."
- **"через + noun" causal calque**: English "through/by X" (marriage, a pact, intermarriage) rendered as "через X" is a calque — use "в результате X" / "благодаря X" / "из-за X" instead ("через брак" → "в результате брака"; "через смешанные браки" → "в результате смешанных браков"; "через соглашение" → "в результате соглашения").
- **"чтобы быть X-ан" (passive purpose infinitive)**: calques English "close enough to have been devastated" — use a modal instead: "мог быть уничтожен", not "чтобы быть уничтоженным".
- **"среди + institution name"**: calques English "known among the Night's Watch" — use "в X" ("в Ночном Дозоре", not "среди Ночного Дозора").
- **Split fixed collocations**: don't wedge a word into the middle of a set phrase to mimic English order (e.g. "держать в заложниках" shouldn't become "держать в городе в заложниках" — keep the collocation intact and place the other modifier elsewhere).
- **Case-government errors**: check that a noun following a governing word/participle is in the case that word actually requires (e.g. "права [кого?]" needs genitive — "права Рейниры", not dative "права Рейнире").
- **Watch for knock-on breakage when fixing one of the above.** Confirmed case: fixing `town-kayce`'s agent-placement calque by moving the agent earlier in the sentence accidentally left a later "который" (relative pronoun, meant to refer to the agent) adjacent to a *different* noun instead — creating a new, worse ambiguity than the one being fixed. Before finalizing any word-order change, re-read the rest of the sentence for pronouns or relative clauses whose correct attachment depends on the original order.

## Proper nouns in `description_ru` — verify, don't calque

Every specific in-universe name mentioned in the prose — not just the location itself, but dragons, named weapons/artifacts, characters' surnames/epithets, peoples, institutions, titles, and historical events referenced in passing — has an established Russian ASOIAF fandom rendering. Translating it literally/by calque instead of using that established term is a real error, not a style choice, and it's easy to introduce without noticing since the mistranslation still "reads fine" in isolation — that's exactly how the errors below shipped undetected.

- Verify the same way `localize-names` does: search `"<term>" 7kingdoms.ru` or `site:7kingdoms.ru/wiki "<candidate>"`, confirm the actual wiki page title/text, and use exactly that — don't guess from English etymology or translate it fresh.
- This applies to anything with a specific in-universe identity: dragon names, character surnames/epithets, named weapons/artifacts, peoples/ethnicities, religious or military institutions, titles, and named historical wars/events/uprisings — not just the location card's own name (which already has its `name_ru` glossary from `localize-names`).
- Confirmed past mistakes, so you don't reintroduce them:
  - "Valyrian Freehold" → **Фригольд** (not "Вольный удел"/"Вольное государство")
  - dragon **Мераксес** (not "Мераксис"); dragon **Мелеис** (not "Мелис")
  - Durran **Богоборец** (not "Богоненавистник"); **Давос Сиворт** (not "Сиворот")
  - sword **Губитель Сердец**/Heartsbane (not "Разящее Сердце"); sword **Покинутая**/Lady Forlorn (not "Скорбный Клинок")
  - **Восстание Святого Воинства**/Faith Militant uprising (not "Воинствующей Веры")
  - **Принцев перевал**/Prince's Pass (not "Перевал Принца")
  - **война Нимерии**/Nymeria's War (not "поход Нимерии" — also watch verb gender agreement, "война" is feminine)
  - crannogmen → **озёрные жители (кранножане)** (not "болотные жители"); their raised platform is a **кранног** (not "крангон")
  - **Кварлон Великий**/Qarlon the Great (not "Карлон Великий")
  - **Наказание Лората**/Scouring of Lorath (not "Разорение Лората")
  - greyscale → **серая хворь** (not "каменная чешуйка")
  - **Первая Черепашья война**/First Turtle War (not "Первая Война Черепах")
  - the people **гискарцы**/Ghiscari as a noun (not "гискарийцы" — the adjective "гискарский" is fine as-is)
  - a **kingsmoot** is **вече**, not a generic "королевский совет"
  - **Дорнийские Марки** (not "Дорнийские Марши"), and their lords are **марочные**, not "маршевые"
  - the knightly title **"Ser"** → **сир** (not "сер") — decline it normally ("сира", "сиру", "сиром"); this one's a title, not a named entity, so it's worth a dedicated grep across a batch rather than checking case-by-case
- When you can't verify a term (search comes up empty or ambiguous), don't guess a literal translation and move on silently — flag it rather than inventing a calque, the same way an unverifiable location name gets flagged instead of guessed in `localize-names`.
- This check applies retroactively too: if you're touching an entry for any other reason and notice a proper noun in its `description_ru` that reads like an untranslated-sounding literal calque, it's worth a quick verification pass even if it's outside today's task.

## Data-quality mismatches (kingdomId / continentId)

Sometimes wiki research reveals that an entry's `kingdomId` (or `continentId`) contradicts canon — e.g. an entry tagged `"kingdomId": "riverlands"` whose wiki page places it in the crownlands. When this happens, trust the wiki, not the data field — the mismatch means the data is wrong, not that the geography is ambiguous:

- Do NOT silently change the field.
- Write the `description` the way canon actually states it — name the correct kingdom/region plainly, even though it contradicts the entry's own `kingdomId`/`continentId`. Do not invent geography-neutral phrasing (describing it only relative to rivers/borders/landmarks) to dodge the contradiction — that fabricates a hedge canon doesn't have.
- Log the discrepancy in `.claude/data-issues.md`: the entry id, what the data says, what canon says, and that it's unresolved — so the field itself can be corrected later as a batch data-quality fix.

Past examples of this pattern: Sow's Horn, Antlers, Brindlewood, Saltpans, Wayfarer's Rest, Fawnton, Uplands, Eastwatch-by-the-Sea (resolved), Tall Trees Town (continentId, not kingdomId). Note: these were written under the old (geography-neutral) version of this rule — worth revisiting to state the canonical kingdom plainly next time one of them is touched.