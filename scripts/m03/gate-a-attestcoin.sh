#!/usr/bin/env bash
# Gate A offline evidence runner — Origin Duel M03-T03.
# Uses only committed repository state after the vendored pin exists.
# Requires no npm registry, GitHub, Sepolia, Creditcoin, or Proof Builder.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

LOCK='contracts/attestcoin.lock.json'
MANIFEST='contracts/attestcoin-sources.sha256'
VENDOR='contracts/lib/asc-contracts'
FROZEN_INTEGRITY='sha512-3/zVx8ElFewTB0Xy06xJ/uPYfvFI1usOe/ilxoM5SNT9Cf47ML/YW41Pq00NttxuOPLkh8HnRlPgD1n66ritLA=='
FROZEN_TARBALL_SHA256='b45fffaf30fe94a1b050800dfd8a67e6e5e9564afbb12ce0422f2c3cb4289dee'
FROZEN_MANIFEST_SHA256='6f6909620096498fdbca79fd69e85e6ab25728d699e63db281fb2c497c75ec15'
FROZEN_GIT_HEAD='7b9c3f11115ec6e680eb8ff18c68c2122e91a16d'

python3 - "$LOCK" "$MANIFEST" "$VENDOR" \
  "$FROZEN_INTEGRITY" "$FROZEN_TARBALL_SHA256" "$FROZEN_MANIFEST_SHA256" "$FROZEN_GIT_HEAD" <<'PY'
import hashlib, json, re, sys
from pathlib import Path

lock_path, manifest_path, vendor_root_s = (Path(sys.argv[i]) for i in range(1, 4))
frozen_integrity, frozen_tarball, frozen_manifest, frozen_git_head = sys.argv[4:8]

lock = json.loads(lock_path.read_text())

# Pin reproducibility: lock schema and frozen artifact identity.
required = {
    'schema', 'package', 'version', 'artifactRevision', 'sourceRevisionKind', 'npmIntegrity',
    'tarballSha256', 'repositoryUrlDeclared', 'gitHeadDeclared', 'gitProvenanceStatus',
    'vendorRoot', 'sourceManifest', 'sourceManifestSha256', 'interfaceSource', 'decoderSource',
}
missing = required - set(lock)
if missing:
    raise SystemExit(f'GATE_A_FAIL: lock fields missing {sorted(missing)}')
if lock['schema'] != 'OriginDuelAttestcoinPinV2':
    raise SystemExit('GATE_A_FAIL: lock schema')
if lock['package'] != '@gluwa/asc-contracts' or lock['version'] != '0.2.1':
    raise SystemExit('GATE_A_FAIL: package/version')
if lock['artifactRevision'] != 'npm:@gluwa/asc-contracts@0.2.1':
    raise SystemExit('GATE_A_FAIL: artifact revision')
if lock['sourceRevisionKind'] != 'NPM_ARTIFACT':
    raise SystemExit('GATE_A_FAIL: source revision kind')

# Artifact provenance: exact frozen npm integrity, tarball SHA-256, declared
# gitHead metadata, and the explicit not-independently-verified status.
if lock['npmIntegrity'] != frozen_integrity:
    raise SystemExit('GATE_A_FAIL: npm integrity drift')
if not re.fullmatch(r'[0-9a-f]{64}', lock['tarballSha256']) or lock['tarballSha256'] != frozen_tarball:
    raise SystemExit('GATE_A_FAIL: tarball sha256 drift')
if lock['gitHeadDeclared'] != frozen_git_head:
    raise SystemExit('GATE_A_FAIL: declared gitHead metadata drift')
if lock['gitProvenanceStatus'] != 'UPSTREAM_METADATA_ONLY_NOT_INDEPENDENTLY_VERIFIED':
    raise SystemExit('GATE_A_FAIL: git provenance status')

# Deterministic per-source manifest: complete coverage and byte identity.
manifest_bytes = manifest_path.read_bytes()
if hashlib.sha256(manifest_bytes).hexdigest() != lock['sourceManifestSha256']:
    raise SystemExit('GATE_A_FAIL: aggregate manifest hash')
if lock['sourceManifestSha256'] != frozen_manifest:
    raise SystemExit('GATE_A_FAIL: manifest hash drift')
vendor_root = Path(lock['vendorRoot'])
if vendor_root_s != vendor_root:
    raise SystemExit('GATE_A_FAIL: vendor root mismatch')
listed = {}
for line in manifest_bytes.decode().splitlines():
    digest, rel = line.split('  ', 1)
    if not re.fullmatch(r'[0-9a-f]{64}', digest):
        raise SystemExit('GATE_A_FAIL: malformed source digest')
    if rel in listed:
        raise SystemExit(f'GATE_A_FAIL: duplicate manifest entry {rel}')
    listed[rel] = digest
actual = {p.relative_to(vendor_root).as_posix() for p in (vendor_root / 'contracts').rglob('*.sol') if p.is_file()}
if set(listed) != actual:
    raise SystemExit('GATE_A_FAIL: manifest coverage mismatch')
for rel, digest in listed.items():
    if hashlib.sha256((vendor_root / rel).read_bytes()).hexdigest() != digest:
        raise SystemExit(f'GATE_A_FAIL: vendored source hash mismatch {rel}')
if any(p.is_symlink() for p in vendor_root.rglob('*')):
    raise SystemExit('GATE_A_FAIL: symlink in vendor tree')
if not (vendor_root / lock['interfaceSource']).is_file():
    raise SystemExit('GATE_A_FAIL: verifier source missing')
if not (vendor_root / lock['decoderSource']).is_file():
    raise SystemExit('GATE_A_FAIL: decoder source missing')

print('GATE_A_PIN_REPRODUCIBLE=PASS')
print('GATE_A_ARTIFACT_PROVENANCE=PASS')
PY

# Build and run the committed Gate A probe under the frozen toolchain:
# solc 0.8.36, EVM Shanghai. This exercises verifier ABI compatibility, the
# exact V1 Type-2 decoder profile, the frozen Phase 4/M02 reconstruction
# fixture parity, and the application-side profile guard.
(
  cd contracts
  forge build
  forge test --match-path 'test/AttestcoinGateA.t.sol' >/dev/null
)
printf '%s\n' 'GATE_A_VERIFIER_ABI=PASS'
printf '%s\n' 'GATE_A_DECODER_PROFILE=PASS'
printf '%s\n' 'GATE_A_PHASE4_FIXTURE=PASS'

# Zero external decoder link references: the probe artifact (which directly
# exercises the vendored decoder library) must contain no unresolved external
# library link placeholder for the decoder.
if grep -rF '__$' contracts/out/AttestcoinGateA.t.sol/ >/dev/null 2>&1; then
  echo 'GATE_A_FAIL: external library link placeholder in probe artifact' >&2
  exit 1
fi
printf '%s\n' 'GATE_A_ZERO_DECODER_LINK_REFERENCES=PASS'

# No runtime decoder authority: the committed Gate A owned sources and the
# application contract sources must not contain any runtime decoder address,
# configuration setter, or forwarding-call boundary. The patterns are assembled
# from fragments so this runner does not match its own checks.
DECODER_ADDR_PATTERN='decoder''Address'
SET_DECODER_PATTERN='set''Decoder'
if grep -RInE "${DECODER_ADDR_PATTERN}|${SET_DECODER_PATTERN}|delegate""call" \
  contracts/src contracts/test/AttestcoinGateA.t.sol; then
  echo 'GATE_A_FAIL: runtime decoder authority pattern detected' >&2
  exit 1
fi
printf '%s\n' 'GATE_A_NO_RUNTIME_DECODER_AUTHORITY=PASS'

printf '%s\n' 'GATE_A_GIT_PROVENANCE_STATUS=UPSTREAM_METADATA_ONLY_NOT_INDEPENDENTLY_VERIFIED'
printf '%s\n' 'M03_T03_GATE_A_EVIDENCE=PASS'
