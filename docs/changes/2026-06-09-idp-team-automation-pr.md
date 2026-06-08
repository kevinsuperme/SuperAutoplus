# PR Draft: IDP Team Automation Safe Admin Workflow

## Summary

This PR integrates `IDP Team Automation` into SuperAutoplus as a controlled admin feature instead of exposing the upstream repository's high-risk interactive flows.

The implementation adds:

- a new `IDP Team Automation` admin page
- safe authorized-credential import
- controlled preflight and sync tasks
- Sub2API / Any2API artifact generation
- Sub2API push support with `created / updated / failed` result semantics
- persisted sync history
- scheduled sync policy management

## Scope

### Backend

- add `src/application/idp_team_automation.py`
- add `src/api/idp_team_automation.py`
- register new ITA routes in `main.py`
- add ITA task creation endpoints in `src/api/task_commands.py`
- wire ITA tasks into `src/application/task_commands.py`
- execute ITA preflight/sync tasks through `src/application/tasks.py`
- extend config whitelist in `src/infrastructure/config_repository.py`
- trigger scheduled ITA sync checks from `src/core/scheduler.py`

### Frontend

- add `frontend/src/pages/IdpTeamAutomation.tsx`
- add `frontend/src/lib/idp-team-automation.ts`
- register the page in `frontend/src/App.tsx`
- add nav copy in `frontend/src/lib/i18n.ts`

### Tests

- add `tests/test_idp_team_automation_safe.py`
- add `frontend/tests/idp-team-automation.test.mjs`

## Design Notes

This integration is intentionally limited to safe mode:

- only user-provided callback URLs or token JSON are accepted
- the backend does not run `run_batch_tui.py` or `run_idp_codex.py`
- sync tasks only process managed accounts already stored in the local account repository
- secrets are not echoed back in task payloads, logs, history, or page responses

## Behavior Changes

### Authorized import

Admins can import callback URL or token JSON into the existing account repository and mark the account as ITA-managed.

### Controlled sync

Admins can run a sync task that:

- exports Sub2API artifacts
- exports Any2API artifacts
- optionally pushes to Sub2API

### Real push result semantics

Push results are now explicit:

- `created`
- `updated`
- `failed`

The page renders these as colored badges in both:

- `最近同步结果`
- `同步历史`

### Sync history persistence

Sync results are persisted through the existing `tasks` table and exposed through a dedicated history endpoint, so page refresh does not lose the result.

### Scheduled policy

Admins can configure a controlled scheduled sync policy for `all_managed` accounts.

## API Additions

- `GET /api/idp-team-automation/status`
- `GET /api/idp-team-automation/accounts`
- `GET /api/idp-team-automation/history`
- `GET /api/idp-team-automation/policy`
- `PUT /api/idp-team-automation/policy`
- `POST /api/idp-team-automation/authorized-import`
- `GET /api/idp-team-automation/artifacts/{task_id}`
- `POST /api/tasks/idp-team-automation/preflight`
- `POST /api/tasks/idp-team-automation/sync`

## Verification

Local verification completed:

- `python -m pytest tests/test_idp_team_automation_safe.py -q`
- `node frontend/tests/idp-team-automation.test.mjs`
- `npm --prefix frontend run build`

Live verification completed after deployment:

- triggered a real controlled sync
- produced one real `updated` push result
- produced one real `failed` push result
- verified the badges on the live page
- verified persisted history after page refresh
- verified artifact download button behavior

Live verification task:

```text
task_1780930698259_64f14f
```

## Risks / Limitations

- scheduling currently supports only `all_managed`
- the system still depends on manual import of already-authorized credentials
- upstream high-risk automation entrypoints remain intentionally blocked

## Follow-ups

- add narrower scheduling scopes
- add richer sync history filtering and pagination
- add more audit-oriented artifact metadata
