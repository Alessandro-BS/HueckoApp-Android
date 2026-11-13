# Common rules for every task reviewer of this plan

You are reviewing one task's implementation: first whether it matches its requirements, then whether it is well-built. Task-scoped gate; a whole-branch review happens after all tasks.

- Global constraints and Review Focus that bind the task: .superpowers/sdd/2026-11-13-votacion-expres-grupal/global-constraints.md (repo root /home/aless/Documents/HueckoApp-Android). Spec (binding): docs/superpowers/specs/2026-11-13-votacion-expres-grupal-design.md.
- Controller ruling given to implementers: keep root typecheck and all suites green; transitional adapters at call sites later tasks rewrite are allowed if marked `// TODO(votacion-expres Task N)` and listed in the report.
- Read the diff file once — it has the commit list, stat and full diff with context, and it is your view. Do not Read changed files separately unless a hunk is cut off (say so). Do not re-run git. Do not crawl the codebase; inspect code outside the diff only for a concrete named risk (one focused check per risk; name risk and check). Cross-cutting changes (changed contract/signature) justify checking call sites.
- Read-only: do not mutate the working tree, index, HEAD or branches. Do not dispatch subagents.
- Treat the implementer's report as unverified claims; rationales never downgrade severity. Do not re-run the suite; run a focused test only for a specific doubt (Node: `export PATH="$HOME/.local/share/fnm:$PATH"; eval "$(fnm env --shell zsh)"`; backend `npx vitest run <file>`; mobile `npx jest --maxWorkers=2 <name>`). Warnings/noise in reported output are findings.
- Concurrency on state transitions (plan state, vote closing) is a standing focus of this project: check locking/guards where the task touches them.
- Part 1 Spec compliance: Missing / Extra / Misunderstood with file:line; ⚠️ for what can't be verified from the diff.
- Part 2 Quality: separation, error handling, DRY, edge cases, tests verify real behavior, structure follows the plan.
- Calibration: Important = cannot be trusted until fixed (incorrect/fragile behavior, missed requirement, swallowed errors, tests asserting nothing). Coverage/polish = Minor. Plan-mandated defects → Important labeled plan-mandated. Acknowledge strengths.
- Final message is the report itself, starting with the spec verdict, every finding with file:line:
### Spec Compliance (✅ | ❌ …; ⚠️ Cannot verify from diff: …)
### Strengths
### Issues (#### Critical / #### Important / #### Minor)
### Assessment — **Task quality:** Approved | Needs fixes; **Reasoning:** 1-2 sentences
