export const BATTLE_REPLAY_INPUT_SCHEMA_V1 = Object.freeze({
  schemaVersion: 1,
  requiredInputFields: [
    "matchSeed",
    "humanInitialSnapshot",
    "botInitialSnapshot",
    "orderedActions",
    "botPolicyVersion",
  ],
  producerTaskIds: ["M10-T01", "M10-T05"],
});
