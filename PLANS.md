# Execution Plans

Execution plans are the internal record for non-trivial work.

## Use A Plan When

- The change spans more than one runtime slice.
- The task changes behavior, not just local implementation.
- The work needs explicit acceptance criteria or decision logging.
- The task is likely to continue across multiple sessions.

## Plan Layout

- Active plans live in [`.agent/exec-plans/active`](./.agent/exec-plans/active/README.md).
- Completed plans live in [`.agent/exec-plans/completed`](./.agent/exec-plans/completed/README.md).
- Start from [`.agent/exec-plans/TEMPLATE.md`](./.agent/exec-plans/TEMPLATE.md).

## Minimum Expectations

- State the goal and non-goals.
- Name the affected runtime slices.
- List the verification required before completion.
- Record decisions when the implementation diverges from the initial idea.
- Move the plan to `completed/` once shipped.
