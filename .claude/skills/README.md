# Project skills

Skills teach Claude Code repeatable, project-specific workflows (e.g., "run the golden-file suite," "deploy a rehearsal stack," "add a metric within the 12-metric budget"). Claude loads a skill automatically when a task matches its description, or explicitly via `/skill-name`.

## Layout

```
.claude/skills/
  <skill-name>/        # kebab-case
    SKILL.md           # required
    ...                # optional supporting files (scripts, templates, references)
```

## SKILL.md format

```markdown
---
name: skill-name
description: What it does and when to use it — Claude matches tasks against this line, so include trigger phrases.
---

Instructions for Claude: steps, commands, constraints, examples.
```

Keep skills small and single-purpose; link to the plan documents in `plan/` rather than duplicating their content.
