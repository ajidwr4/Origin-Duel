#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

npm test -- packages/domain/src/transaction/transaction.parity.test.ts
(
  cd contracts
  forge test --match-path 'test/lib/DeterministicParity.t.sol'
)
npm test -- packages/domain/src/generation/generation.parity.test.ts
npx tsx scripts/m02/generation-population.ts --count 100000 --seed 20260901
npm run typecheck
npm run lint
npm test
(
  cd contracts
  forge fmt --check
  forge build
  forge test
)

printf '%s\n' 'TX-01=PASS'
printf '%s\n' 'GEN-01=PASS'
printf '%s\n' 'GEN-02=PASS'
printf '%s\n' 'M02_T04_EVIDENCE=PASS'
