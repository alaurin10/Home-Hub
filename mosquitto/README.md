# Mosquitto (MQTT broker add-on)

Mosquitto runs as a Home Assistant add-on and exists almost entirely to carry
**Zigbee2MQTT** traffic. Keeping it as a separate broker (rather than relying on
HA internals) is what lets Zigbee survive HA Core restarts (see the §15
independence test).

## What's tracked here

- `acl.example` — a starter access-control list (authored config → mirror it into
  the add-on; ACLs are enabled as part of the Phase 5 hardening below).

## What's **not** tracked

- The MQTT users/passwords (create a dedicated `zigbee2mqtt` user; store its
  password in the add-on / secrets, never in git).
- Broker runtime state.

## Setup (Phase 5)

1. Install the **Mosquitto broker** add-on.
2. Create an MQTT user `zigbee2mqtt` (used by `zigbee2mqtt/configuration.yaml`).
3. Point Zigbee2MQTT at `mqtt://core-mosquitto:1883`.

## Hardening (do with the Phase 5 setup, not "later")

An unauthenticated broker on the IoT VLAN would let any compromised device
publish/subscribe to everything — including Zigbee commands. Do all three:

1. **No anonymous access.** The HA add-on requires logins by default — verify
   it stays that way: the add-on config must NOT contain `anonymous: true`
   (and `logins:`/HA users are the only way in).
2. **Per-service users, least privilege.** One user per client (`zigbee2mqtt`,
   plus one per future MQTT device/service) — never share credentials, so a
   leaked password revokes one client, not the fleet.
3. **Enable the ACL.** In the add-on config set
   `customize: { active: true, folder: mosquitto }`, copy `acl.example` to
   `/share/mosquitto/accesscontrollist`, and restart the add-on. The starter
   ACL confines `zigbee2mqtt` to `zigbee2mqtt/#`.

**Verify (add to the Phase 5 checklist in `docs/06-verification.md`):**

```sh
# From a LAN machine with mosquitto-clients — MUST be refused:
mosquitto_sub -h <broker-ip> -t '#' -C 1
# As zigbee2mqtt — MUST see Z2M traffic but get nothing outside its tree:
mosquitto_sub -h <broker-ip> -u zigbee2mqtt -P '<pw>' -t 'homeassistant/#' -C 1
```
