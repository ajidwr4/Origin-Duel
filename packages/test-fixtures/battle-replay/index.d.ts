export declare const BATTLE_REPLAY_INPUT_SCHEMA_V1: Readonly<{
  schemaVersion: 1;
  requiredInputFields: readonly [
    "matchSeed",
    "humanInitialSnapshot",
    "botInitialSnapshot",
    "orderedActions",
    "botPolicyVersion",
  ];
  producerTaskIds: readonly ["M10-T01", "M10-T05"];
}>;
