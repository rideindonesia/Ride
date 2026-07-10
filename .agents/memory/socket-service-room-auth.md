---
name: Socket.io service-room authorization
description: Why the mitra service-type room must be resolved server-side, not trusted from the client identify payload
---

# Socket service-room authorization

The `identify` socket event must NOT trust a client-supplied `serviceType`. The
service room (`service:<type>`) is what receives cross-mitra order broadcasts
(e.g. `order:cancelled`), so a spoofed serviceType lets a mitra eavesdrop on
another service's orders.

**Rule:** resolve the mitra's real service type from the DB using the
server-trusted identity (verified user ids from session/cookies). Look up
`mitra_locations.serviceType` by `userId` first, fall back to the approved
`mitra_applications.serviceType` by the user's email. Join only that room.

**Why:** broken access control / data exposure — found in audit. The client
`identifySocket(userId, role, serviceType)` still sends serviceType, but the
server deliberately ignores it.

**How to apply:** any new client-driven room join on a socket must derive its
authorization from `collectVerifiedIds`/`hasMitraIdentity`/`isAdminReq`, never
from the event payload. `join:order` already does this (checks order parties).
