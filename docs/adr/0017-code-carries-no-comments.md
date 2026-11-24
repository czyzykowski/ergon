# Code carries no comments

ergon's TypeScript has no comments, JSDoc included. The only exceptions are
directives a tool acts on, written without a reason.

Every comment we had was one of four kinds, and each has a better home. One that
restates the code adds nothing. One that explains hard code should become a
restructuring of that code, and one that excuses bad code should become a fix.
One that records a decision belongs in an ADR, and one that records expected
behaviour belongs in a test name, where it is checked rather than asserted.
Nothing generates documentation from JSDoc, so it has nothing to add over a name
and a type.

Nix, YAML and shell are executable configuration rather than code that can
explain itself through its structure, so they keep their comments.

## Consequences

Only changed lines are held to this. Existing comments stay until someone
touches their lines, so the codebase converges without a sweep, and moving
commented code means finding its comments a new home in the same change.
