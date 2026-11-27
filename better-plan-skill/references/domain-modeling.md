<!-- Adapted from mattpocock/skills skills/engineering/domain-modeling (MIT). See THIRD_PARTY_NOTICES.md. -->

# Domain Modeling

Actively build and sharpen the project's domain model as you design. Challenge terms against
`GLOSSARY.md`, sharpen fuzzy language with a precise canonical term, stress-test relationships with
concrete edge-case scenarios, and cross-check statements against the code. Update `GLOSSARY.md`
inline the moment a term is resolved; it must contain domain definitions only, never implementation
details. Offer an ADR only when a decision is hard to reverse, surprising without context, and the
result of a real trade-off.

## During the session

- **Challenge against the glossary.** If the user's term conflicts with `GLOSSARY.md`, say so
  immediately: "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"
- **Sharpen fuzzy language.** Propose one canonical term: "You're saying 'account' — the Customer
  or the User? Those are different things."
- **Discuss concrete scenarios.** Invent edge cases that force precision about boundaries between
  concepts.
- **Cross-check with the code.** If the code disagrees with what the user said, surface the
  contradiction and ask which one is right.
- **Write it down as it crystallises.** Create `GLOSSARY.md` with the first resolved term and
  `docs/adr/NNNN-<slug>.md` with the first real decision; do not wait to batch them.
- **ADRs sparingly.** Hard to reverse + surprising without context + a real trade-off. If any of
  the three is missing, skip the ADR.
