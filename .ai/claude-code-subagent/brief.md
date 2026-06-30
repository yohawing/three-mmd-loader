You are Claude Code acting as a bounded subagent for Codex.

# Working directory
F:\Develop\MMDDev\three-mmd-loader

# User goal
Work with Codex toward a 0.4.0 release and create the release PR autonomously. The immediate gap is that camera/light/self-shadow VMD render verification is not strong enough for the Roadmap's 0.4.0 rendering-fidelity milestone.

# Delegation settings
- Model: sonnet
- Model reason: bounded cross-file release-gate design; no implementation yet.
- Mode: read-only plan

# Scope
- Allowed paths to inspect:
  - AGENTS.md
  - ROADMAP.md
  - docs/RELEASE.md
  - package.json
  - scripts/visual-regression/**
  - scripts/fixtures/**
  - test/unit/**
  - test/integration/**
  - src/runtime/**
  - src/three/**
- Forbidden paths:
  - Do not edit files.
  - Do not commit or push.
- Existing dirty files before delegation:
  - none (`git status --short --branch` shows develop clean)

# Required context
- AGENTS.md hard rules apply, especially no hot-path allocation if runtime code is touched later.
- Roadmap 0.4.0 includes:
  - Tune MMD-compatible shading by comparing rendered output against MMD dump/reference images, focusing on toon response, diffuse/specular balance, ambient terms, alpha handling, outline appearance, and shadow interaction.
  - Strengthen camera, light, and self-shadow runtime parity by comparing VMD sampled state and rendered output against MMD dump/reference evidence.
  - Capture before/after image evidence when changing shading behavior.
- Existing release scripts include `visual:smoke:generated-pmx` and `visual:smoke:self-shadow`.
- Current suspicion: `scripts/visual-regression/render-real-models.mjs` applies self-shadow VMD from motion, but does not apply camera or light VMD to the rendered scene. Generated self-shadow profile exists. Camera/light render evidence may need a new generated visual profile or extension.

# Task
Produce a concrete, minimal release-gate plan for 0.4.0:
1. Identify the smallest code/test/doc changes needed so camera VMD, light VMD, and self-shadow VMD are verified through rendered output, not only sampling unit tests.
2. Prefer generated portable fixtures over local user-owned assets.
3. Reuse existing visual-regression infrastructure where feasible.
4. State exactly which commands Codex should run before release.
5. Identify any release-blocking gaps that cannot be closed without real MMD dump/reference assets.

# Output format
Output:
## PLAN
## PROPOSED FILE CHANGES
## VERIFICATION COMMANDS
## RISKS
## HANDOFF

Do not edit files.
