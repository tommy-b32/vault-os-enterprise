# Isolated baseline replay runbook

## Purpose

This runbook rebuilds and validates the Vault OS Supabase migration history in a disposable local database. It proves that the staged baseline, authoritative migrations, and narrowly-scoped compatibility fixtures can replay from an empty volume through `20261078000000_governed_late_supplier_payments.sql`.

## Safety boundaries

- This is an **isolated local replay only**. It is not a deployment procedure.
- Never use `--linked`, a remote database URL, `supabase db push`, `supabase migration repair` against a remote project, or any production credentials.
- Never copy a compatibility fixture into `supabase/migrations` or change an authoritative migration to accommodate replay.
- The only permitted migration-history repair is the local replay version `20260904130000`, after its documented shim succeeds under `supabase_admin`.
- `cron.launch_active_jobs` must be `off` for the complete replay.
- Do not use bare `supabase start` or `supabase db reset`; the wrapper controls the database invocation and its cron setting.

## Prerequisites

- Docker Desktop is running.
- The isolated replay resources and staged tree exist under `.temp/supabase-baseline-replay`.
- The local replay listener is `127.0.0.1:54322`; do not substitute a remote address.
- Run all commands from the repository root unless a command explicitly changes directory.

```powershell
Set-Location C:\Users\tommy\OneDrive\Desktop\vault-os-enterprise\vault-os-enterprise
$replay = '.temp\supabase-baseline-replay'
$wrapperScripts = 'scripts\baseline-replay'
```

## Compatibility inventory

The staged tree contains all authoritative migrations plus these staged-only components. Their version ordering is intentional and collision-free.

| Version | Component | Why it exists | Placement |
| --- | --- | --- | --- |
| 20260714000000 | `vault_legacy_schema_baseline.sql` | Replay baseline, not forward production history | First |
| 20260721120000 | historical product-cost currency compatibility | Recreates documented historical schema transition | After baseline, before forward migrations |
| 20260807500000 | inert Vault secrets | Provides inert values required by historical schedules | Before schedule-dependent migrations |
| 20260904130000 | analytics cron job-ID shim | Remaps the replay analytics job to historical ID 9 | After `20260904120000`; handled manually |
| 20261003120000 | decision-memory scheduler-secret shim | Supplies the isolated inert scheduler secret | After `20261003000000`, before `20261004000000` |
| 20261030500000 | VaultCare canonical catalogue fixture | Restores verified externally-created catalogue identity | After `20261030000000`, before `20261031000000` |
| 20261034500000 | Exclusive historical catalogue fixture | Restores verified supplier/catalogue identities | After `20261034000000`, before `20261035000000` |
| 20261047400000 | Tee cost-type reference fixture | Restores only verified `tee / Tee / true` reference data | After `20261047000000`, before `20261047500000` |
| 20261047500000 | Exclusive tee operational-profile fixture | Restores the verified profile and 15 settings | After `20261047400000`, before `20261048000000` |

The five `202610...` entries described as fixtures and all three SQL shims are replay-only. They must never be deployed as authoritative migrations. The source copies live in `apps/web/tests/fixtures/replay-compat`; the staged copies are only in `.temp/supabase-baseline-replay/supabase/migrations`.

`20260807500000_replay_inert_vault_secrets.sql` creates only local inert placeholder Vault values required by historical schedule validation. It contains no real production secrets and is safe only with this isolated replay's server-level `cron.launch_active_jobs = off` control. Never deploy it as an authoritative production migration.

## Clean replay lifecycle

### 1. Recreate the wrapper database

The reset removes only the named isolated wrapper/container/volume and starts the wrapper with cron disabled.

```powershell
powershell.exe -ExecutionPolicy Bypass -File "$wrapperScripts\Reset-ReplayDb.ps1" -ReplayRoot $replay
```

### 2. Verify cron and database aliases

```powershell
docker exec vault-os-baseline-replay-db-replay psql -U postgres -d postgres -Atqc "show cron.launch_active_jobs"
docker inspect vault-os-baseline-replay-db-replay --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{range $v.Aliases}}{{.}} {{end}}{{end}}'
```

Expected: `off`, and aliases `db`, `db.supabase.internal`, and `supabase_db_vault-os-baseline-replay-supabase`.

### 3. Restart only Storage

```powershell
docker restart supabase_storage_vault-os-baseline-replay-supabase
```

Do not restart or recreate the other Supabase services. On a blank database the `storage` tables do not exist until the historical `20260904000000` storage migration applies. Verify them after the migration pass:

```powershell
docker exec vault-os-baseline-replay-db-replay psql -U postgres -d postgres -Atqc "select to_regclass('storage.buckets'), to_regclass('storage.objects'), to_regclass('storage.migrations');"
```

Expected: `storage.buckets|storage.objects|storage.migrations`.

### 4. Run the CLI-managed replay

```powershell
supabase.cmd migration up --include-all --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

The first pass is expected to stop at `20260904130000_analytics_cron_jobid_compat.sql`. This is expected shim behavior, not a new migration failure. Do not alter the shim or authoritative migrations.

### 5. Handle only the known analytics shim

Execute the existing staged shim as `supabase_admin` against the wrapper, then mark only that same local version applied:

```powershell
Get-Content -LiteralPath 'supabase\migrations\20260904130000_analytics_cron_jobid_compat.sql' -Raw |
  docker exec -i vault-os-baseline-replay-db-replay psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1

supabase.cmd migration repair --status applied 20260904130000 --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Then rerun the command from step 4. Do not repair any other version. If the shim fails, stop and report its native PostgreSQL error; do not work around it automatically.

## Expected checkpoints

- `20260904000000` creates the storage bootstrap objects.
- `20261047400000` applies before `20261047500000` and introduces only the verified tee reference row.
- `20261047500000` applies with its `vault_cost_types('tee')` foreign-key precondition satisfied.
- `20261048000000` applies unchanged.
- `20261060000000` was previously validated as passing. If it fails because profile version `f2978e12-f2db-40bc-bd35-a1d10cee64f7` is absent, stop and report it without a fix.
- Successful replay ends at `20261078000000_governed_late_supplier_payments.sql`.

## Final verification

```powershell
docker exec vault-os-baseline-replay-db-replay psql -U postgres -d postgres -P pager=off `
  -c "select version from supabase_migrations.schema_migrations where version in ('20261047400000','20261047500000','20261048000000','20261060000000') order by version" `
  -c "select version from supabase_migrations.schema_migrations order by version desc limit 1" `
  -c "select id, display_name, active from public.vault_cost_types where id = 'tee'" `
  -c "show cron.launch_active_jobs"
```

Expected: all four checkpoint versions, final version `20261078000000`, `tee | Tee | t`, and cron `off`.

Also run the focused fixture tests and whitespace validation from the repository root:

```powershell
node --test apps/web/tests/HistoricalProductCostCurrencyReplayCompat.test.mjs apps/web/tests/ReplayInertVaultSecretsFixture.test.mjs apps/web/tests/GovernedDecisionMemoryCaptureSchedule.test.mjs apps/web/tests/ReplayVaultCareCanonicalCatalogueFixture.test.mjs apps/web/tests/ReplayExclusiveHistoricalCatalogueFixture.test.mjs apps/web/tests/ReplayCostTypeReferenceFixture.test.mjs apps/web/tests/ReplayExclusiveTeeOperationalProfileFixture.test.mjs
git diff --check
```

## Cleanup

Only after preserving the replay evidence, remove the isolated wrapper resources:

```powershell
Set-Location $replay
docker rm --force vault-os-baseline-replay-db-replay
docker volume rm supabase_db_vault-os-baseline-replay-supabase
Remove-Item -LiteralPath .replay-db-container-template.json -Force
```

These commands target only the explicitly named disposable replay resources. Never substitute production names or run them against a linked project.
