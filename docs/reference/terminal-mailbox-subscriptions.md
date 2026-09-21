# Terminal mailbox subscriptions

A running agent in an Orca terminal can opt into mailbox pointers without joining a
Run or Dispatch:

```sh
orca orchestration subscribe --json
orca orchestration subscription status --json
orca orchestration unsubscribe --json
```

Run these commands inside the receiving agent's Orca-launched environment. The
runtime verifies the existing launch proof, exact pane, process incarnation and
host authority. A terminal handle alone is not authorization. There is no target
selector and no automatic registration. The registration stores only the host
scope, handle, pane, PTY and process incarnation; it does not retain or print the
launch token or an SSH attachment secret. A subscribed receiver gets a pointer for
existing undelivered mail as well as later arrivals; the original message body
stays in the inbox.

Registration is ephemeral and belongs to the execution runtime. Repeating
`subscribe` for the same live identity is idempotent. Runtime restart, process
replacement, PTY exit, handle remint or invalid host authority requires explicit
registration again. A transport outage leaves the subscription and durable mail
intact while status reports `host_unverifiable`; it is not evidence of process
exit. A new client against a host without
`orchestration.terminal-subscription.v1` reports `unsupported` without attempting
registration. Existing Run/Dispatch mail keeps its original delivery path.

The runtime rechecks the full binding before writing a pointer and before
submitting Enter. Auto-Enter requires a positively resolved, unchanged, non-Cursor
agent identity plus a live, writable, settled-idle pane. If the pane becomes
working, permission-blocked, unwritable or identity-ambiguous after the pointer,
the pointer remains for manual submission and a later idle edge does not send
Enter. A sender cannot override these checks. Only the existing runtime PTY writer
performs the write; no provider socket, native queue or `session-peer` installation
is required.

`subscription status` describes the latest notification attempt, not message
processing. Its state distinguishes `active`, `blocked_permission`,
`blocked_working`, `ambiguous_write`, `stale_replaced`, `host_unverifiable`,
`proven_exited` and `unsubscribed`. `submitted` means the Enter write was accepted;
`deferred` includes manual submission; `unverifiable` means the current host or a
write result cannot be proved. `messageIds` identifies the attempted batch. The
subscribe and unsubscribe receipts support exact `--retry-request` replay. The
existing send receipt, unread/read flags and acknowledgement semantics are
unchanged. Inbox inspection does not acknowledge a message.

After an ambiguous write, inspect the inbox explicitly. The same execution
incarnation must not replay the pointer or Enter. A restart, missing leaf or
transport timeout does not release an attempted reservation. Once the execution
host positively reports a replacement incarnation or exit, the old tuple is
reconciled and a newly registered process can receive a fresh pointer. No message
body is replayed, and no old handle is rebound to a new recipient.

This first version supports bare terminal recipients that the runtime can resolve
through its existing live-leaf delivery path. It does not add background PTY
resolution, restart slept panes, introduce a Codex app-server controller, or migrate
mail between handles. Related work: Orca issues/PRs #18206, #8057, #12033, #18731,
and #18208.
