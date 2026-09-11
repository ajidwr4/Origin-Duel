#!/usr/bin/env bash
# M05-T04 / IG-01 live Gate F operator entrypoint (HFT-M05 §11.6 A).
#
# Sensitive/live inputs are environment-provided only and never echoed:
#   SEPOLIA_RPC_URL
#   CREDITCOIN_RPC_URL
#   ATTESTCOIN_PROOF_BUILDER_URL
#   M05_IG01_SEPOLIA_TX_HASH
#   M05_INTEGRATION_DEPLOYER_PRIVATE_KEY
#   M05_INTEGRATION_ASSET_APPROVAL_SIGNER
#   M05_INTEGRATION_CAPTURE_GENESIS_BLOCK
#
# Modes:
#   --deploy-and-verify  one temporary integration deployment (if no valid
#                        manifest exists), then the complete IG-01 verification
#   --verify-existing    reuse the committed integration manifest; no broadcast
#
# Section 11.6-H temporary integration build-profile probe (approved Change
# Control): before any --deploy-and-verify broadcast, the selected candidate
# P3 (optimizer=true, optimizer_runs=200, viaIR=true) is built transiently
# into an evidence directory and its MonsterFactoryASC runtime bytecode is
# asserted <= EIP-170 24576 bytes. The probe never edits contracts/foundry.toml
# and never persists the selection as a release default; Gate B stays with
# M13-T02.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

MODE="${1:---verify-existing}"
if [ "$MODE" != "--deploy-and-verify" ] && [ "$MODE" != "--verify-existing" ]; then
  echo "usage: $0 [--deploy-and-verify|--verify-existing]" >&2
  exit 2
fi

missing=0
for name in \
  SEPOLIA_RPC_URL \
  CREDITCOIN_RPC_URL \
  ATTESTCOIN_PROOF_BUILDER_URL \
  M05_IG01_SEPOLIA_TX_HASH \
  M05_INTEGRATION_ASSET_APPROVAL_SIGNER \
  M05_INTEGRATION_CAPTURE_GENESIS_BLOCK
do
  if [ -z "${!name:-}" ]; then
    printf 'MISSING %s\n' "$name" >&2
    missing=1
  fi
done
# The deployer key is only required when broadcasting a deployment.
if [ "$MODE" = "--deploy-and-verify" ] && [ -z "${M05_INTEGRATION_DEPLOYER_PRIVATE_KEY:-}" ]; then
  printf 'MISSING %s\n' "M05_INTEGRATION_DEPLOYER_PRIVATE_KEY" >&2
  missing=1
fi
if [ "$missing" -ne 0 ]; then
  echo 'IG01_BLOCKED: required live/integration environment input missing' >&2
  exit 42
fi

# Section 11.6-H probe (deploy mode only): build P3 transiently and gate on the
# measured runtime bytecode size. P1/P2 fail to compile ("Stack too deep"
# without viaIR); P0 reference is 25901 bytes (over limit). P3 is the highest
# preference deployable candidate at 15648 bytes.
if [ "$MODE" = "--deploy-and-verify" ]; then
  PROBE_DIR="${M05_PROBE_ARTIFACT_DIR:-/tmp/origin-duel-m05-build-profile-probe/P3}"
  echo "===== M05 11.6-H TEMPORARY BUILD-PROFILE PROBE (P3) ====="
  mkdir -p "$PROBE_DIR"
  PROBE_OUT="$(cd "$PROBE_DIR" && pwd)"
  (
    cd contracts
    forge build --optimize --optimizer-runs 200 --via-ir --out "$PROBE_OUT"
  )
  python3 - "$PROBE_OUT" <<'PY'
import json, sys
d = json.load(open(f"{sys.argv[1]}/MonsterFactoryASC.sol/MonsterFactoryASC.json"))
size = (len(d["deployedBytecode"]["object"]) - 2) // 2
meta = json.loads(d["rawMetadata"])
settings = meta["settings"]
print(f"probe: optimizer={settings['optimizer']['enabled']} runs={settings['optimizer']['runs']} viaIR={settings['viaIR']} solc={meta['compiler']['version']} evm={settings['evmVersion']}")
print(f"probe: MonsterFactoryASC runtime bytecode = {size} bytes")
if size > 24576:
    raise SystemExit(f"probe: FAIL {size} > EIP-170 24576")
print("M05_IG01_TEMP_BUILD_PROFILE_PROBE=PASS")
PY
  export M05_PROBE_ARTIFACT_DIR="$PROBE_OUT"
fi

exec npx tsx scripts/m05/ig-01-live-attestcoin.ts "$MODE"
