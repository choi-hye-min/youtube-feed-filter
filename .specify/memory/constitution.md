<!--
Sync Impact Report
Version change: none → 1.0.0
Added principles: Code Quality & Maintainability; Test-First Delivery; User Experience Consistency; Performance as a First-Class Requirement; Traceable Quality and Feedback
Added sections: Additional Constraints; Development Workflow
Removed sections: none
Templates reviewed: .specify/templates/plan-template.md ✅ updated, .specify/templates/spec-template.md ✅ reviewed, .specify/templates/tasks-template.md ✅ reviewed
Follow-up TODOs: none
-->

# YouTube Skip Constitution

## Core Principles

### Code Quality & Maintainability
All code MUST be written with clarity, modular structure, and maintainability as primary goals.
- Enforce consistent formatting, linting, and readable naming.
- Keep functions small, responsibilities narrow, and dependencies explicit.
- Avoid technical debt by preventing workaround-only implementations and requiring refactors for brittle code.

### Test-First Delivery
Every feature, bug fix, and behavior change MUST be covered by automated tests before it is merged.
- Unit tests MUST validate business logic and edge cases.
- Integration tests MUST verify user-facing flows and interactions between components.
- Regression tests MUST be added for any defect discovered after the first fix.

### User Experience Consistency
User-facing behavior MUST align with established product conventions and provide predictable, understandable outcomes.
- UI changes MUST preserve navigation, layout, and interaction patterns.
- Errors and validation feedback MUST be clear, actionable, and consistent.
- Accessibility and UX clarity MUST be reviewed for every user-visible change.

### Performance as a First-Class Requirement
Performance goals MUST be defined and validated for all releases that affect execution paths or user interactions.
- Code MUST avoid unnecessary work, excessive allocations, and unbounded loops.
- Latency and resource use MUST be measured and bounded where applicable.
- Performance regressions MUST be identified, analyzed, and resolved before shipping.

### Traceable Quality and Feedback
All decisions, tests, and review outcomes MUST be documented so quality is observable and traceable.
- Link changes to requirements, test coverage, and review notes.
- Use logging, metrics, or documentation to make hidden behavior auditable.
- Treat feedback from testing and review as a required input for the next iteration.

## Additional Constraints
The project MUST enforce tooling and processes that support the core principles.
- Automated checks MUST include linting, formatting, and test status verification.
- Every user-facing change MUST be reviewed for UX consistency and accessibility.
- Performance-sensitive work MUST include measurable targets and explicit profiling notes.
- No release MUST proceed without clear evidence that code quality, testing, UX consistency, and performance requirements have been validated.

## Development Workflow
Work MUST follow a disciplined plan → implement → verify → review cycle.
- Feature branches MUST be used for all non-trivial work.
- Peer review and automated gates MUST validate code quality, tests, UX, and performance before merge.
- Changes MUST be small enough to review effectively and large enough to preserve meaningful behavior.
- Documentation updates and test coverage MUST accompany every code change.

## Governance
This constitution supersedes informal practices and establishes the primary quality gate for the project.
- Amendments require a documented rationale, maintainer agreement, and update of affected templates or guidance.
- Versioning follows semantic versioning: major for governance or principle changes, minor for new mandatory guidance, patch for wording or clarification updates.
- All PRs MUST reference this constitution and demonstrate compliance with the relevant principles.
- Compliance reviews MUST check code quality, test coverage, user experience consistency, and performance expectations explicitly.

All contributors are expected to apply these principles consistently across planning, implementation, and review.

**Version**: 1.0.0 | **Ratified**: 2026-04-13 | **Last Amended**: 2026-04-13
