import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { generateMonsterV1 } from "../../packages/domain/src/generation/index.js";

const UINT64_MASK = (1n << 64n) - 1n;
const DNA_PAYLOAD_MASK = (1n << 248n) - 1n;
const ELEMENTS = ["FIRE", "WATER", "WIND"] as const;
const RARITIES = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;
const PROFILES = ["OFFENSIVE", "BALANCED", "DEFENSIVE"] as const;

function readIntegerArgument(name: string): number {
  const index = process.argv.indexOf(name);
  assert(index >= 0 && process.argv[index + 1], `missing ${name}`);
  const value = Number(process.argv[index + 1]);
  assert(Number.isSafeInteger(value), `invalid ${name}`);
  return value;
}

const count = readIntegerArgument("--count");
const seed = readIntegerArgument("--seed");
assert(count >= 100_000, "count must be at least 100000");
assert(seed >= 0, "seed must be non-negative");

let state = BigInt(seed) & UINT64_MASK;
function nextUint64(): bigint {
  state = (state + 0x9e3779b97f4a7c15n) & UINT64_MASK;
  let value = state;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
  return (value ^ (value >> 31n)) & UINT64_MASK;
}

function nextPayload(): bigint {
  return (
    ((nextUint64() << 192n) |
      (nextUint64() << 128n) |
      (nextUint64() << 64n) |
      nextUint64()) &
    DNA_PAYLOAD_MASK
  );
}

function dna(activityClass: number, payload: bigint) {
  return `0x${activityClass.toString(16).padStart(2, "0")}${payload
    .toString(16)
    .padStart(62, "0")}` as const;
}

function counter(names: readonly string[]): Record<string, number> {
  return Object.fromEntries(names.map((name) => [name, 0]));
}

const level = counter(["1", "2", "3", "4", "5", "6"]);
const band = counter(["NORMAL", "TRIBUTE"]);
const rarity = counter(RARITIES);
const element = counter(ELEMENTS);
const profile = counter(PROFILES);
const species = counter(
  Array.from({ length: 12 }, (_, index) => String(index + 1)),
);
const family = counter(Array.from({ length: 6 }, (_, index) => String(index)));
let atkMin = Number.POSITIVE_INFINITY;
let atkMax = Number.NEGATIVE_INFINITY;
let defMin = Number.POSITIVE_INFINITY;
let defMax = Number.NEGATIVE_INFINITY;
let generated = 0;

function observe(activityClass: number, payload: bigint) {
  const transactionDNA = dna(activityClass, payload);
  const monster = generateMonsterV1(transactionDNA);

  assert(activityClass >= 0 && activityClass <= 5);
  assert(monster.level >= 1 && monster.level <= 6);
  assert(monster.speciesId >= 1 && monster.speciesId <= 12);
  assert(monster.speciesId >= activityClass * 2 + 1);
  assert(monster.speciesId <= activityClass * 2 + 2);
  assert(monster.atk >= 800 && monster.atk <= 1560);
  assert(monster.def >= 800 && monster.def <= 1560);
  assert(ELEMENTS.includes(monster.element));
  assert(RARITIES.includes(monster.rarity));

  const powerBudget = monster.level <= 3 ? 2000 : 2600;
  assert.equal(monster.atk + monster.def, powerBudget);
  const inferredProfile =
    monster.atk * 10 === powerBudget * 6
      ? "OFFENSIVE"
      : monster.atk * 10 === powerBudget * 5
        ? "BALANCED"
        : "DEFENSIVE";
  assert.equal(
    monster.atk * 10,
    powerBudget *
      (inferredProfile === "OFFENSIVE"
        ? 6
        : inferredProfile === "BALANCED"
          ? 5
          : 4),
  );

  level[String(monster.level)] = (level[String(monster.level)] ?? 0) + 1;
  const monsterBand = monster.level <= 3 ? "NORMAL" : "TRIBUTE";
  band[monsterBand] = (band[monsterBand] ?? 0) + 1;
  rarity[monster.rarity] = (rarity[monster.rarity] ?? 0) + 1;
  element[monster.element] = (element[monster.element] ?? 0) + 1;
  profile[inferredProfile] = (profile[inferredProfile] ?? 0) + 1;
  species[String(monster.speciesId)] =
    (species[String(monster.speciesId)] ?? 0) + 1;
  family[String(activityClass)] = (family[String(activityClass)] ?? 0) + 1;
  atkMin = Math.min(atkMin, monster.atk);
  atkMax = Math.max(atkMax, monster.atk);
  defMin = Math.min(defMin, monster.def);
  defMax = Math.max(defMax, monster.def);
  generated++;
  return monster;
}

for (let group = 0; generated < count; group++) {
  const payload = nextPayload();
  const activityClass = group % 6;
  const first = observe(activityClass, payload);

  if (generated < count) {
    const repeated = observe(activityClass, payload);
    assert(
      isDeepStrictEqual(first, repeated),
      "same DNA was not deterministic",
    );
  }

  if (generated < count) {
    const otherActivity = (activityClass + 1) % 6;
    const isolated = observe(otherActivity, payload);
    assert.deepEqual(
      {
        level: isolated.level,
        atk: isolated.atk,
        def: isolated.def,
        element: isolated.element,
        rarity: isolated.rarity,
      },
      {
        level: first.level,
        atk: first.atk,
        def: first.def,
        element: first.element,
        rarity: first.rarity,
      },
      "activityClass changed a non-species generation field",
    );
  }
}

assert.equal(generated, count);
console.log(`GENERATION_POPULATION_COUNT=${generated}`);
console.log(`GENERATION_POPULATION_SEED=${seed}`);
console.log(`LEVEL_DISTRIBUTION=${JSON.stringify(level)}`);
console.log(`BAND_DISTRIBUTION=${JSON.stringify(band)}`);
console.log(`RARITY_DISTRIBUTION=${JSON.stringify(rarity)}`);
console.log(`ELEMENT_DISTRIBUTION=${JSON.stringify(element)}`);
console.log(`STAT_PROFILE_DISTRIBUTION=${JSON.stringify(profile)}`);
console.log(`SPECIES_DISTRIBUTION=${JSON.stringify(species)}`);
console.log(`ACTIVITY_FAMILY_DISTRIBUTION=${JSON.stringify(family)}`);
console.log(`ATK_RANGE=${atkMin}..${atkMax}`);
console.log(`DEF_RANGE=${defMin}..${defMax}`);
