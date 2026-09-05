export const ASSET_APPROVAL_INPUT_SCHEMA_V1 = Object.freeze({
  schemaVersion: 1,
  requiredInputFields: [
    "factoryAddress",
    "chainId",
    "approval",
    "privateTestKey",
  ],
  producerTaskIds: ["M03-T05", "M07-T05"],
});
