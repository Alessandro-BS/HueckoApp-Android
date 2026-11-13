---
name: git-flow
description: "User requires git flow branching (feature/* from develop, release/* to main with tags, hotfix/*) in HueckoApp"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fee355d0-757f-472b-8bc7-7a203d225784
  modified: 2026-09-29T16:39:17.879Z
---

Work with git flow in HueckoApp: feature/* branches off develop with PRs into develop; release/* branches from develop into main, tagged with a semver version, then back-merged into develop; hotfix/* from main.

**Why:** User explicitly asked ("recuerda trabajar mediante git flow") when starting the React Native restructure (2026-09-29).

**How to apply:** Never commit directly to main/develop; open PRs via `gh`. On 2026-09-29 the user explicitly authorized Claude to merge the PRs itself ("quiero que tú lo hagas, aceptar las PR") for the RN migration. Local git has no user.name/email configured — commits use the history identity `Aless Bustamante <fabrizio.bs9012@gmail.com>` via GIT_AUTHOR/COMMITTER env vars. See [[hueckoapp-rn-restructure]].
