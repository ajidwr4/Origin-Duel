import { type Kysely, sql } from "kysely";

/**
 * Canonical Origin Duel PostgreSQL V1 schema.
 *
 * The DDL below is copied exactly from Phase 10 §§59–66 (Data & Interface
 * Specification) — the canonical authority. Do not "improve" it here: wallet
 * bytea octet_length CHECKs, text+CHECK workflow enums (never PG enum types),
 * numeric(78,0) for EVM uint256, and the same-source composite FK assertions
 * are protocol invariants. Down drops constraints before tables, in reverse
 * dependency order, without CASCADE shortcuts.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // §59 — auth + capture + source
  await sql`CREATE TABLE auth_challenges (
    challenge_id        uuid PRIMARY KEY,
    wallet              bytea NOT NULL CHECK (octet_length(wallet) = 20),
    nonce               text NOT NULL UNIQUE CHECK (nonce ~ '^[0-9a-f]{32}$'),
    message             text NOT NULL,
    auth_domain         text NOT NULL,
    auth_origin         text NOT NULL,
    issued_at           timestamptz NOT NULL,
    expires_at          timestamptz NOT NULL,
    used_at             timestamptz NULL,
    CHECK (expires_at > issued_at)
  )`.execute(db);

  await sql`CREATE INDEX auth_challenges_wallet_expires_idx
    ON auth_challenges (wallet, expires_at DESC)`.execute(db);

  await sql`CREATE TABLE auth_sessions (
    session_id_hash     bytea PRIMARY KEY CHECK (octet_length(session_id_hash) = 32),
    wallet              bytea NOT NULL CHECK (octet_length(wallet) = 20),
    created_at          timestamptz NOT NULL,
    expires_at          timestamptz NOT NULL,
    revoked_at          timestamptz NULL,
    CHECK (expires_at > created_at)
  )`.execute(db);

  await sql`CREATE INDEX auth_sessions_wallet_active_idx
    ON auth_sessions (wallet, expires_at DESC)
    WHERE revoked_at IS NULL`.execute(db);

  await sql`CREATE TABLE capture_requests (
    capture_request_ref uuid PRIMARY KEY,
    claimant            bytea NOT NULL CHECK (octet_length(claimant) = 20),
    claimed_tx_hash     bytea NOT NULL CHECK (octet_length(claimed_tx_hash) = 32),
    workflow_status     text NOT NULL CHECK (workflow_status IN (
        'CHECKING_TRANSACTION',
        'WAITING_FOR_ATTESTATION',
        'GENERATING_PROOF',
        'PREFLIGHTING',
        'SOURCE_BOUND',
        'FAILED_RETRYABLE',
        'REJECTED'
    )),
    source_job_id       uuid NULL,
    proof_payload       jsonb NULL,
    proof_generated_at  timestamptz NULL,
    last_error_code     text NULL,
    retry_count         integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    row_version         integer NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at          timestamptz NOT NULL,
    updated_at          timestamptz NOT NULL,
    UNIQUE (claimant, claimed_tx_hash),
    CHECK (proof_payload IS NULL OR jsonb_typeof(proof_payload) = 'object')
  )`.execute(db);

  await sql`CREATE TABLE source_jobs (
    source_job_id             uuid PRIMARY KEY,
    source_tx                 bytea NOT NULL UNIQUE CHECK (octet_length(source_tx) = 32),
    claimant                  bytea NOT NULL CHECK (octet_length(claimant) = 20),
    current_attempt_key       bytea NULL CHECK (
        current_attempt_key IS NULL OR octet_length(current_attempt_key) = 32
    ),
    current_capture_mint_id   uuid NULL,
    row_version               integer NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at                timestamptz NOT NULL,
    updated_at                timestamptz NOT NULL
  )`.execute(db);

  await sql`ALTER TABLE capture_requests
    ADD CONSTRAINT capture_requests_source_job_fk
    FOREIGN KEY (source_job_id) REFERENCES source_jobs(source_job_id)`.execute(
    db,
  );

  await sql`CREATE INDEX capture_requests_claimant_updated_idx
    ON capture_requests (claimant, updated_at DESC)`.execute(db);

  await sql`CREATE INDEX source_jobs_claimant_updated_idx
    ON source_jobs (claimant, updated_at DESC)`.execute(db);

  // §60 — asset attempts
  await sql`CREATE TABLE asset_attempts (
    attempt_key              bytea PRIMARY KEY CHECK (octet_length(attempt_key) = 32),
    source_job_id            uuid NOT NULL REFERENCES source_jobs(source_job_id),
    status                   text NOT NULL CHECK (status IN (
        'MONSTER_RESOLVED',
        'IMAGE_UPLOADED',
        'ASSET_READY',
        'SUPERSEDED'
    )),
    species_id               smallint NOT NULL CHECK (species_id BETWEEN 1 AND 12),
    level                    smallint NOT NULL CHECK (level BETWEEN 1 AND 6),
    atk                      smallint NOT NULL CHECK (atk BETWEEN 800 AND 1560),
    def                      smallint NOT NULL CHECK (def BETWEEN 800 AND 1560),
    element                  smallint NOT NULL CHECK (element BETWEEN 0 AND 2),
    rarity                   smallint NOT NULL CHECK (rarity BETWEEN 0 AND 3),
    transaction_dna          bytea NOT NULL CHECK (octet_length(transaction_dna) = 32),
    monster_hash             bytea NOT NULL CHECK (octet_length(monster_hash) = 32),
    generation_spec_version smallint NOT NULL CHECK (generation_spec_version = 1),
    art_spec_version        smallint NOT NULL CHECK (art_spec_version = 1),
    metadata_spec_version   smallint NOT NULL CHECK (metadata_spec_version = 1),
    render_input_hash        bytea NULL CHECK (
        render_input_hash IS NULL OR octet_length(render_input_hash) = 32
    ),
    image_cid                text NULL,
    image_uri                text NULL,
    metadata_cid             text NULL,
    token_uri                text NULL,
    superseded_by_attempt_key bytea NULL CHECK (
        superseded_by_attempt_key IS NULL OR octet_length(superseded_by_attempt_key) = 32
    ),
    last_error_code          text NULL,
    render_lease_owner       text NULL,
    render_lease_until       timestamptz NULL,
    created_at               timestamptz NOT NULL,
    updated_at               timestamptz NOT NULL,
    UNIQUE (attempt_key, source_job_id),
    CHECK (
      (level BETWEEN 1 AND 3 AND atk + def = 2000)
      OR
      (level BETWEEN 4 AND 6 AND atk + def = 2600)
    ),
    CHECK (
      (status = 'MONSTER_RESOLVED')
      OR
      (status = 'IMAGE_UPLOADED' AND render_input_hash IS NOT NULL AND image_cid IS NOT NULL AND image_uri IS NOT NULL)
      OR
      (status = 'ASSET_READY' AND render_input_hash IS NOT NULL AND image_cid IS NOT NULL AND image_uri IS NOT NULL
          AND metadata_cid IS NOT NULL AND token_uri IS NOT NULL)
      OR
      (status = 'SUPERSEDED')
    )
  )`.execute(db);

  await sql`ALTER TABLE asset_attempts
    ADD CONSTRAINT asset_attempts_superseded_fk
    FOREIGN KEY (superseded_by_attempt_key) REFERENCES asset_attempts(attempt_key)`.execute(
    db,
  );

  // GS10-06: the composite UNIQUE(attempt_key, source_job_id) above must exist
  // before this composite FK so the same-source binding is enforceable.
  await sql`ALTER TABLE source_jobs
    ADD CONSTRAINT source_jobs_current_attempt_fk
    FOREIGN KEY (current_attempt_key, source_job_id)
    REFERENCES asset_attempts(attempt_key, source_job_id)`.execute(db);

  await sql`CREATE INDEX asset_attempts_source_job_created_idx
    ON asset_attempts (source_job_id, created_at DESC)`.execute(db);

  await sql`CREATE INDEX asset_attempts_claimable_renderer_idx
    ON asset_attempts (status, render_lease_until)
    WHERE status IN ('MONSTER_RESOLVED', 'IMAGE_UPLOADED')`.execute(db);

  // §61 — capture mint lineage
  await sql`CREATE TABLE capture_mints (
    capture_mint_id       uuid PRIMARY KEY,
    source_job_id         uuid NOT NULL REFERENCES source_jobs(source_job_id),
    attempt_key           bytea NOT NULL REFERENCES asset_attempts(attempt_key)
                          CHECK (octet_length(attempt_key) = 32),
    lineage_no            integer NOT NULL CHECK (lineage_no >= 1),
    status                text NOT NULL CHECK (status IN (
        'READY_TO_MINT',
        'WAITING_FOR_WALLET',
        'MINT_SUBMITTING',
        'RESULT_UNKNOWN',
        'CONFIRMED_FAILURE',
        'MINTED'
    )),
    mint_tx_hash          bytea NULL UNIQUE CHECK (
        mint_tx_hash IS NULL OR octet_length(mint_tx_hash) = 32
    ),
    sender_nonce          numeric(78,0) NULL CHECK (sender_nonce IS NULL OR sender_nonce >= 0),
    reconciliation_status text NULL CHECK (reconciliation_status IS NULL OR reconciliation_status IN (
        'CONFIRMED_SUCCESS',
        'CONFIRMED_FAILURE',
        'RESULT_UNKNOWN',
        'CONFIRMED_NON_INCLUDED_OR_REPLACED'
    )),
    replacement_tx_hash   bytea NULL CHECK (
        replacement_tx_hash IS NULL OR octet_length(replacement_tx_hash) = 32
    ),
    token_id              numeric(78,0) NULL CHECK (token_id IS NULL OR token_id >= 0),
    last_reconciled_at    timestamptz NULL,
    created_at            timestamptz NOT NULL,
    updated_at            timestamptz NOT NULL,
    UNIQUE (source_job_id, lineage_no),
    UNIQUE (capture_mint_id, source_job_id),
    CHECK (status <> 'MINTED' OR token_id IS NOT NULL),
    CHECK (status NOT IN ('MINT_SUBMITTING', 'RESULT_UNKNOWN') OR mint_tx_hash IS NOT NULL)
  )`.execute(db);

  await sql`ALTER TABLE capture_mints
    ADD CONSTRAINT capture_mints_attempt_source_fk
    FOREIGN KEY (attempt_key, source_job_id)
    REFERENCES asset_attempts(attempt_key, source_job_id)`.execute(db);

  await sql`ALTER TABLE source_jobs
    ADD CONSTRAINT source_jobs_current_capture_mint_fk
    FOREIGN KEY (current_capture_mint_id, source_job_id)
    REFERENCES capture_mints(capture_mint_id, source_job_id)`.execute(db);

  await sql`CREATE INDEX capture_mints_source_lineage_idx
    ON capture_mints (source_job_id, lineage_no DESC)`.execute(db);

  // §62 — decks
  await sql`CREATE TABLE decks (
    deck_id         uuid PRIMARY KEY,
    wallet          bytea NOT NULL UNIQUE CHECK (octet_length(wallet) = 20),
    deck_version    integer NOT NULL CHECK (deck_version >= 1),
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL
  )`.execute(db);

  await sql`CREATE TABLE deck_cards (
    deck_id         uuid NOT NULL REFERENCES decks(deck_id) ON DELETE CASCADE,
    position        smallint NOT NULL CHECK (position BETWEEN 0 AND 14),
    token_id        numeric(78,0) NOT NULL CHECK (token_id >= 0),
    PRIMARY KEY (deck_id, position),
    UNIQUE (deck_id, token_id)
  )`.execute(db);

  await sql`CREATE INDEX deck_cards_token_idx ON deck_cards (token_id)`.execute(
    db,
  );

  // §63 — matches
  await sql`CREATE TABLE matches (
    match_id                uuid PRIMARY KEY,
    human_wallet            bytea NOT NULL CHECK (octet_length(human_wallet) = 20),
    start_request_id        uuid NOT NULL,
    deck_version            integer NOT NULL CHECK (deck_version >= 1),
    status                  text NOT NULL CHECK (status IN (
        'MATCH_CREATED',
        'SETUP_SHUFFLE_DRAW',
        'SETUP_MULLIGAN',
        'MATCH_READY',
        'MATCH_ACTIVE',
        'MATCH_FINISHED',
        'CANCELLED'
    )),
    match_version           integer NOT NULL DEFAULT 0 CHECK (match_version >= 0),
    match_seed              bytea NOT NULL CHECK (octet_length(match_seed) = 32),
    bot_policy_version      text NOT NULL CHECK (bot_policy_version = 'MVP_V1'),
    starting_player         smallint NULL CHECK (starting_player IN (0,1)),
    human_initial_snapshot  jsonb NOT NULL CHECK (jsonb_typeof(human_initial_snapshot) = 'object'),
    bot_initial_snapshot    jsonb NOT NULL CHECK (jsonb_typeof(bot_initial_snapshot) = 'object'),
    state_schema_version    smallint NOT NULL DEFAULT 1 CHECK (state_schema_version = 1),
    current_state           jsonb NOT NULL CHECK (jsonb_typeof(current_state) = 'object'),
    winner_slot             smallint NULL CHECK (winner_slot IN (0,1)),
    loser_slot              smallint NULL CHECK (loser_slot IN (0,1)),
    result_reason           text NULL CHECK (result_reason IS NULL OR result_reason IN (
        'LP_ZERO', 'DECK_OUT', 'SURRENDER'
    )),
    cancellation_reason     text NULL CHECK (cancellation_reason IS NULL OR cancellation_reason IN (
        'SETUP_INVARIANT_FAILURE',
        'BOT_INVALID_INTENT',
        'STATE_CORRUPTION',
        'INTERNAL_ENGINE_FAILURE'
    )),
    created_at              timestamptz NOT NULL,
    updated_at              timestamptz NOT NULL,
    finished_at             timestamptz NULL,
    UNIQUE (human_wallet, start_request_id),
    CHECK (
        (status = 'MATCH_FINISHED' AND winner_slot IS NOT NULL AND loser_slot IS NOT NULL
            AND result_reason IS NOT NULL AND cancellation_reason IS NULL)
        OR
        (status = 'CANCELLED' AND winner_slot IS NULL AND loser_slot IS NULL
            AND result_reason IS NULL AND cancellation_reason IS NOT NULL)
        OR
        (status NOT IN ('MATCH_FINISHED','CANCELLED') AND winner_slot IS NULL
            AND loser_slot IS NULL AND result_reason IS NULL AND cancellation_reason IS NULL)
    )
  )`.execute(db);

  await sql`CREATE INDEX matches_human_updated_idx
    ON matches (human_wallet, updated_at DESC)`.execute(db);

  // §64 — match actions
  await sql`CREATE TABLE match_actions (
    match_id         uuid NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    action_index     integer NOT NULL CHECK (action_index >= 1),
    actor_slot       smallint NOT NULL CHECK (actor_slot IN (0,1)),
    action_type      text NOT NULL CHECK (action_type IN (
        'MULLIGAN_ACCEPT',
        'MULLIGAN_DECLINE',
        'SUMMON',
        'TRIBUTE_SUMMON',
        'CHANGE_POSITION',
        'END_MAIN',
        'DECLARE_ATTACK',
        'END_BATTLE',
        'SURRENDER'
    )),
    action_schema_version smallint NOT NULL DEFAULT 1 CHECK (action_schema_version = 1),
    action_payload   jsonb NOT NULL CHECK (jsonb_typeof(action_payload) = 'object'),
    before_version   integer NOT NULL CHECK (before_version >= 0),
    after_version    integer NOT NULL CHECK (after_version = before_version + 1),
    created_at       timestamptz NOT NULL,
    PRIMARY KEY (match_id, action_index),
    UNIQUE (match_id, before_version),
    UNIQUE (match_id, after_version)
  )`.execute(db);

  // §65 — profiles: total_wins only; the level is always derived, never stored.
  await sql`CREATE TABLE player_profiles (
    wallet          bytea PRIMARY KEY CHECK (octet_length(wallet) = 20),
    total_wins      integer NOT NULL DEFAULT 0 CHECK (total_wins >= 0),
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL
  )`.execute(db);

  // §66 — progression settlements: match_id PK is the exactly-once identity.
  await sql`CREATE TABLE progression_settlements (
    match_id          uuid PRIMARY KEY REFERENCES matches(match_id),
    wallet            bytea NOT NULL CHECK (octet_length(wallet) = 20),
    win_increment     smallint NOT NULL CHECK (win_increment IN (0,1)),
    total_wins_after  integer NOT NULL CHECK (total_wins_after >= 0),
    settled_at        timestamptz NOT NULL
  )`.execute(db);

  await sql`CREATE INDEX progression_settlements_wallet_idx
    ON progression_settlements (wallet, settled_at DESC)`.execute(db);
}

/**
 * Reverse dependency order: composite FKs first, then child tables, then
 * referenced parents. No CASCADE shortcuts — every drop is explicit.
 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX progression_settlements_wallet_idx`.execute(db);
  await sql`DROP TABLE progression_settlements`.execute(db);
  await sql`DROP TABLE player_profiles`.execute(db);
  await sql`DROP TABLE match_actions`.execute(db);
  await sql`DROP INDEX matches_human_updated_idx`.execute(db);
  await sql`DROP TABLE matches`.execute(db);
  await sql`DROP INDEX deck_cards_token_idx`.execute(db);
  await sql`DROP TABLE deck_cards`.execute(db);
  await sql`DROP TABLE decks`.execute(db);
  await sql`DROP INDEX capture_mints_source_lineage_idx`.execute(db);
  await sql`ALTER TABLE source_jobs DROP CONSTRAINT source_jobs_current_capture_mint_fk`.execute(
    db,
  );
  await sql`ALTER TABLE capture_mints DROP CONSTRAINT capture_mints_attempt_source_fk`.execute(
    db,
  );
  await sql`DROP TABLE capture_mints`.execute(db);
  await sql`DROP INDEX asset_attempts_claimable_renderer_idx`.execute(db);
  await sql`DROP INDEX asset_attempts_source_job_created_idx`.execute(db);
  await sql`ALTER TABLE source_jobs DROP CONSTRAINT source_jobs_current_attempt_fk`.execute(
    db,
  );
  await sql`ALTER TABLE asset_attempts DROP CONSTRAINT asset_attempts_superseded_fk`.execute(
    db,
  );
  await sql`DROP TABLE asset_attempts`.execute(db);
  await sql`DROP INDEX source_jobs_claimant_updated_idx`.execute(db);
  await sql`DROP INDEX capture_requests_claimant_updated_idx`.execute(db);
  await sql`ALTER TABLE capture_requests DROP CONSTRAINT capture_requests_source_job_fk`.execute(
    db,
  );
  await sql`DROP TABLE source_jobs`.execute(db);
  await sql`DROP TABLE capture_requests`.execute(db);
  await sql`DROP INDEX auth_sessions_wallet_active_idx`.execute(db);
  await sql`DROP TABLE auth_sessions`.execute(db);
  await sql`DROP INDEX auth_challenges_wallet_expires_idx`.execute(db);
  await sql`DROP TABLE auth_challenges`.execute(db);
}
