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

`unlog` sends no `adjustEstimate`, so Jira's default applies and the removal
_increases_ the issue's remaining estimate by the removed time. That is the
exact inverse of the logging that created it, because `addWorklog` sends no
`adjustEstimate` either and Jira's create default decrements. The pair cancels,
and a correction leaves the estimate where it started.

This is correct only because correction is remove-then-re-log. Sending
`adjustEstimate=leave` looks more conservative and is the trap: the removal
would leave the estimate alone, then the re-log would decrement it a second time
for hours nobody worked. Anything that amends a Worklog in future has to revisit
that, and has to decide which rule authors `started`.

A correction costs two commands, and the second needs the first one's details.
That is why `ergon unlog` prints what it removed rather than only that it
removed something — the receipt is what a re-log is typed from.
