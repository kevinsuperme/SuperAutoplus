# Recommended PR Title

feat: integrate IDP Team Automation as a controlled admin workflow

## Ready-to-paste PR Description

## Summary

This PR integrates `IDP Team Automation` into SuperAutoplus as a controlled admin workflow.

Instead of exposing the upstream repository's high-risk interactive entrypoints directly, we wrap the supported parts in managed APIs, task execution, persisted history, and a dedicated admin page.

This PR includes:

- a new `IDP Team Automation` admin page
- safe import of already authorized credentials
- controlled preflight and sync tasks
- artifact generation plus in-page download actions
- real Sub2API push result states: `created` / `updated` / `failed`
- persisted sync history and history list rendering
- scheduled sync policy management
- docs updates and local cache artifact cleanup

## What Changed

### Admin page

Added a new backend management page:

```text
/idp-team-automation
```

Admins can now:

- configure ITA-related local settings
- import user-provided callback URLs or token JSON
- manage eligible synced accounts
- run controlled preflight and sync tasks
- download generated artifacts by file type
- inspect latest sync results and persisted history
- review push results with clear status badges
- configure scheduled sync policy

### Backend workflow

Added a dedicated ITA application module and API surface:

- `src/application/idp_team_automation.py`
- `src/api/idp_team_automation.py`

Added task entrypoints:

- `POST /api/tasks/idp-team-automation/preflight`
- `POST /api/tasks/idp-team-automation/sync`

Added ITA support across:

- `main.py`
- `src/api/task_commands.py`
- `src/application/task_commands.py`
- `src/application/tasks.py`
- `src/core/scheduler.py`
- `src/infrastructure/config_repository.py`

### Push result statuses

Sub2API push results now distinguish between:

- `created`
- `updated`
- `failed`

The UI renders these with explicit colored badges in both:

- `最近同步结果`
- `同步历史`

### Persisted sync history

Sync results are now persisted through the existing task system and exposed through:

- `GET /api/idp-team-automation/history`

This keeps push results, artifact links, and status details available after refresh and across later page visits.

### Scheduled policy

Added controlled scheduled sync policy APIs:

- `GET /api/idp-team-automation/policy`
- `PUT /api/idp-team-automation/policy`

The scheduler now checks ITA policy and creates controlled sync tasks when due.

### Docs and repo hygiene

Added:

- ITA feature documentation
- ITA integration change notes
- this PR draft document

Also updated `.gitignore` to exclude local test and cache artifacts, and removed the tracked local-only pytest result file from version control.

## Safety Boundaries

This integration is intentionally limited to safe mode.

It does **not**:

- run `run_batch_tui.py`
- run `run_idp_codex.py`
- bypass user authorization
- auto-acquire unauthorized OAuth credentials
- expose secrets in task payloads, logs, history, or page responses

It only operates on already imported, already authorized managed accounts.

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

Local verification:

- `python -m pytest tests/test_idp_team_automation_safe.py -q`
- `node frontend/tests/idp-team-automation.test.mjs`
- `npm --prefix frontend run build`

Live verification completed after deployment:

- triggered a real controlled sync from the deployed page
- produced one real `updated` push result
- produced one real `failed` push result
- verified status badges in `最近同步结果`
- verified status badges in `同步历史`
- verified persisted history after refresh
- verified artifact download button behavior

Live verification task:

```text
task_1780930698259_64f14f
```

## Included Commits

- `e3d7703` `feat: add safe IDP Team Automation admin workflow`
- `46ed5d8` `docs: add ITA integration notes and PR draft`
- `7c96d26` `chore: ignore local test cache artifacts`

## Risks / Limitations

- scheduling currently supports only `all_managed`
- the system still depends on manual import of already authorized credentials
- high-risk upstream automation entrypoints remain intentionally blocked

## Follow-ups

- add narrower scheduling scopes
- add richer sync history filtering and pagination
- add more audit-oriented artifact metadata
