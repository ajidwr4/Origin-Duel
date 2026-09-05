export const BIGINT_BOUNDARY_V1 = Object.freeze({
  validUint256Decimal: [
    "0",
    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
  ],
  invalidUint256Decimal: [
    "115792089237316195423570985008687907853269984665640564039457584007913129639936",
    "00",
    "01",
    "-1",
  ],
  lexicalOrderingTrap: ["10", "2"],
  canonicalAddress: "0x1111111111111111111111111111111111111111",
  canonicalBytes32:
    "0xe8a1a631557a4b63768f2ea5dd7714f825ab39416d3e753c848e50e39dd24bab",
  enumParity: {
    activityClass: [0, 1, 2, 3, 4, 5],
    element: [0, 1, 2],
    rarity: [0, 1, 2, 3],
  },
  versionParity: {
    generationSpecVersion: 1,
    artSpecVersion: 1,
    metadataSpecVersion: 1,
    battleStateSchemaVersion: 1,
    battleActionSchemaVersion: 1,
  },
});
