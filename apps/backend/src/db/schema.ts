import type { Kysely } from "kysely";

/**
 * Manual hand-authored Kysely mirror types (packet §5.5 typing policy).
 * Canonical reviewed SQL migration DDL (migrations/0001_canonical_v1.ts,
 * Phase 10 §§59–66) is the authority; these types only mirror it and never
 * redefine schema semantics. Column names/types match the DDL exactly.
 *
 * Type mapping conventions (tech-stack §10.2):
 * - bytea (wallet/hash, exact octet_length) → Uint8Array
 * - uuid → string
 * - text + CHECK workflow enums → string literal unions
 * - numeric(78,0) EVM uint256 → string (lossless; never JavaScript number)
 * - timestamptz → Date
 * - closed/versioned JSONB objects → typed shapes (null when DDL allows)
 */

export type WorkflowStatus =
  | CaptureWorkflowStatus
  | AssetAttemptStatus
  | CaptureMintStatus
  | MatchStatus
  | MatchActionType
  | ReconciliationStatus;

export type CaptureWorkflowStatus =
  | "CHECKING_TRANSACTION"
  | "WAITING_FOR_ATTESTATION"
  | "GENERATING_PROOF"
  | "PREFLIGHTING"
  | "SOURCE_BOUND"
  | "FAILED_RETRYABLE"
  | "REJECTED";

export type AssetAttemptStatus =
  | "MONSTER_RESOLVED"
  | "IMAGE_UPLOADED"
  | "ASSET_READY"
  | "SUPERSEDED";

export type CaptureMintStatus =
  | "READY_TO_MINT"
  | "WAITING_FOR_WALLET"
  | "MINT_SUBMITTING"
  | "RESULT_UNKNOWN"
  | "CONFIRMED_FAILURE"
  | "MINTED";

export type MatchStatus =
  | "MATCH_CREATED"
  | "SETUP_SHUFFLE_DRAW"
  | "SETUP_MULLIGAN"
  | "MATCH_READY"
  | "MATCH_ACTIVE"
  | "MATCH_FINISHED"
  | "CANCELLED";

export type MatchActionType =
  | "MULLIGAN_ACCEPT"
  | "MULLIGAN_DECLINE"
  | "SUMMON"
  | "TRIBUTE_SUMMON"
  | "CHANGE_POSITION"
  | "END_MAIN"
  | "DECLARE_ATTACK"
  | "END_BATTLE"
  | "SURRENDER";

export type ReconciliationStatus =
  | "CONFIRMED_SUCCESS"
  | "CONFIRMED_FAILURE"
  | "RESULT_UNKNOWN"
  | "CONFIRMED_NON_INCLUDED_OR_REPLACED";

/** Closed JSONB battle/proof structures — validated by their owning engine
 * before persistence; DB stores, never interprets. */
export type JsonObject = Record<string, unknown>;

export interface AuthChallengesTable {
  challenge_id: string;
  wallet: Uint8Array;
  nonce: string;
  message: string;
  auth_domain: string;
  auth_origin: string;
  issued_at: Date;
  expires_at: Date;
  used_at: Date | null;
}

export interface AuthSessionsTable {
  session_id_hash: Uint8Array;
  wallet: Uint8Array;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface CaptureRequestsTable {
  capture_request_ref: string;
  claimant: Uint8Array;
  claimed_tx_hash: Uint8Array;
  workflow_status: CaptureWorkflowStatus;
  source_job_id: string | null;
  proof_payload: JsonObject | null;
  proof_generated_at: Date | null;
  last_error_code: string | null;
  retry_count: number;
  row_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface SourceJobsTable {
  source_job_id: string;
  source_tx: Uint8Array;
  claimant: Uint8Array;
  current_attempt_key: Uint8Array | null;
  current_capture_mint_id: string | null;
  row_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface AssetAttemptsTable {
  attempt_key: Uint8Array;
  source_job_id: string;
  status: AssetAttemptStatus;
  species_id: number;
  level: number;
  atk: number;
  def: number;
  element: number;
  rarity: number;
  transaction_dna: Uint8Array;
  monster_hash: Uint8Array;
  generation_spec_version: number;
  art_spec_version: number;
  metadata_spec_version: number;
  render_input_hash: Uint8Array | null;
  image_cid: string | null;
  image_uri: string | null;
  metadata_cid: string | null;
  token_uri: string | null;
  superseded_by_attempt_key: Uint8Array | null;
  last_error_code: string | null;
  render_lease_owner: string | null;
  render_lease_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CaptureMintsTable {
  capture_mint_id: string;
  source_job_id: string;
  attempt_key: Uint8Array;
  lineage_no: number;
  status: CaptureMintStatus;
  mint_tx_hash: Uint8Array | null;
  sender_nonce: string | null;
  reconciliation_status: ReconciliationStatus | null;
  replacement_tx_hash: Uint8Array | null;
  token_id: string | null;
  last_reconciled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DecksTable {
  deck_id: string;
  wallet: Uint8Array;
  deck_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface DeckCardsTable {
  deck_id: string;
  position: number;
  token_id: string;
}

export interface MatchesTable {
  match_id: string;
  human_wallet: Uint8Array;
  start_request_id: string;
  deck_version: number;
  status: MatchStatus;
  match_version: number;
  match_seed: Uint8Array;
  bot_policy_version: string;
  starting_player: number | null;
  human_initial_snapshot: JsonObject;
  bot_initial_snapshot: JsonObject;
  state_schema_version: number;
  current_state: JsonObject;
  winner_slot: number | null;
  loser_slot: number | null;
  result_reason: "LP_ZERO" | "DECK_OUT" | "SURRENDER" | null;
  cancellation_reason:
    | "SETUP_INVARIANT_FAILURE"
    | "BOT_INVALID_INTENT"
    | "STATE_CORRUPTION"
    | "INTERNAL_ENGINE_FAILURE"
    | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export interface MatchActionsTable {
  match_id: string;
  action_index: number;
  actor_slot: number;
  action_type: MatchActionType;
  action_schema_version: number;
  action_payload: JsonObject;
  before_version: number;
  after_version: number;
  created_at: Date;
}

export interface PlayerProfilesTable {
  wallet: Uint8Array;
  total_wins: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProgressionSettlementsTable {
  match_id: string;
  wallet: Uint8Array;
  win_increment: number;
  total_wins_after: number;
  settled_at: Date;
}

/**
 * Exactly the 12 canonical V1 application tables (Phase 10 §58). Kysely
 * migration bookkeeping tables are infrastructure and are not mirrored.
 * player_level is deliberately absent: it is always derived from total_wins.
 */
export interface OriginDuelDatabase {
  auth_challenges: AuthChallengesTable;
  auth_sessions: AuthSessionsTable;
  capture_requests: CaptureRequestsTable;
  source_jobs: SourceJobsTable;
  asset_attempts: AssetAttemptsTable;
  capture_mints: CaptureMintsTable;
  decks: DecksTable;
  deck_cards: DeckCardsTable;
  matches: MatchesTable;
  match_actions: MatchActionsTable;
  player_profiles: PlayerProfilesTable;
  progression_settlements: ProgressionSettlementsTable;
}

export type OriginDuelDb = Kysely<OriginDuelDatabase>;
