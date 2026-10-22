# A screen may have Extra states beyond the five Standard states

Every screen in a Handoff accounts for the five Standard states (default, loading, empty, error, success), and validate rejects any other state name. A Prototype can show more, such as offline or permission denied, and those had nowhere to go. A screen may have Extra states as well. The five Standard states stay required. An Extra state comes from a condition in the Prototype that matches no Standard state, named through a new `state:<expr>` decision, or from the owner's word, as a missing state with a question. It follows the Standard states' rules: a `reach` decision or a reason it cannot be reached, and acceptance criteria may name it.

Decided by the owner on 2026-10-21, when the gaps in [What must a Handoff for one Prototype's feature carry](../research/design-handoff-contents.md) were grilled.

## Considered Options

- **Keep the five and fold everything else into them**, for example offline as a kind of error: rejected. The Handoff would lose what the Prototype shows, and acceptance could not tell the two apart.
- **An Extra state for each field validation error** (`invalid-email`): rejected. The number of states would multiply with the number of fields. A field's errors sit on its Usage instead, as entries in a new `errors[]` key, each a condition and its copy, inside the `error` state. This follows [GOV.UK's guidance](https://design-system.service.gov.uk/components/error-message/): show the message next to the field, and write a different message for each kind of error.

## Consequences

- Handoffs with Extra states would break if the decision were reversed, so this is hard to undo.
- Every place that checks a state name against the five must accept a screen's Extra states: validate's screen, region, text, Usage and acceptance checks, and in generate the `reach` decisions, the missing-state questions, the acceptance criteria and the reading of conditions into states.
