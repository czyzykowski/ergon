# A Worklog is removed and re-logged, never amended

Jira exposes `PUT /issue/{key}/worklog/{id}`, so ergon could correct a Worklog
in place: change a duration, fix a description, move a block of time onto the
issue it belonged on. It does not. `ergon unlog` removes a Worklog outright, and
a correction is a Removal followed by a fresh `ergon log`.

Most corrections are not deletions. Time logged against the wrong issue, a timer
that ran through lunch, an hour the `wrapup` skill proposed that was already
covered — all three are amendments, and removal is a blunt instrument for them.
The case for amending is real, and it was still declined.

The reason is `started`. A Worklog's start time is Jira's own string, offset and
all, and ergon's read side goes out of its way not to touch it: `assembleDay`
passes it through unparsed, and `ergon worklogs` slices `HH:MM` out of it rather
than reading it as a `Date`, so no timezone is applied on anybody's behalf. The
write side has a second, independent rule: `resolveStartedAt` builds the string
from the machine's local timezone, defaulting the time of day to 09:00. The two
rules agree today only because nothing ever round-trips a timestamp — a Worklog
is read, or it is written, never read and modified and written back. Amending
would make that round trip the normal case, and the first thing to go wrong
would be an entry whose time quietly shifts by an offset nobody asked for.

Removing and re-logging keeps one rule in each direction. `ergon log` is already
the only thing in ergon that authors a `started` string, and it goes on being
the only thing.

## Consequences

`unlog` sends `adjustEstimate=leave`, against Jira's default, because the
reasoning that first chose the default turned out to be wrong.

That reasoning was symmetry. Jira's delete default adds the removed time back to
the remaining estimate and its create default subtracts, so remove-then-re-log
should cancel and leave the estimate where it started. Measured against this
instance, it does not. Logging 1m on an issue carrying no estimate moved its
remaining estimate from absent to zero; removing that same worklog moved it to
1m. The subtraction has a floor at zero and the addition has no ceiling, so the
two are only inverse on an issue whose remaining estimate already covers the
time being removed. Of fifteen issues this operator has logged time against,
none carries an estimate at all — so under the default every correction would
have invented a remaining estimate equal to the hours it had just removed, and
repeated corrections would have ratcheted it upward.

`leave` makes a removal leave the estimate untouched. Its cost is the trap the
original reasoning was trying to avoid: on an issue that does carry a real
estimate, a correction decrements it twice for the same hours, once per log.
That is the lesser error — it understates the time left on work that was
genuinely done, where the default overstates it on work nobody did — and on this
instance it is unreachable.

Jira also does not verify the issue key in a worklog delete: a `DELETE`
addressed to one issue removes a worklog belonging to another. That makes
`requireRemovableWorklog` the whole of the protection rather than a better error
message, which is why it resolves the id against the issue's own worklogs before
anything is sent.

Anything that amends a Worklog in future inherits none of the estimate problem,
because an amendment has nothing to cancel. It still has to decide which rule
authors `started`.

A correction costs two commands, and the second needs the first one's details.
That is why `ergon unlog` prints what it removed rather than only that it
removed something — the receipt is what a re-log is typed from.
