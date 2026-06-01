# Mosquitto (MQTT broker add-on)

Mosquitto runs as a Home Assistant add-on and exists almost entirely to carry
**Zigbee2MQTT** traffic. Keeping it as a separate broker (rather than relying on
HA internals) is what lets Zigbee survive HA Core restarts (see the §15
independence test).

## What's tracked here

- `acl.example` — a starter access-control list (authored config → mirror it into
  the add-on if you enable ACLs).

## What's **not** tracked

- The MQTT users/passwords (create a dedicated `zigbee2mqtt` user; store its
  password in the add-on / secrets, never in git).
- Broker runtime state.

## Setup (Phase 5)

1. Install the **Mosquitto broker** add-on.
2. Create an MQTT user `zigbee2mqtt` (used by `zigbee2mqtt/configuration.yaml`).
3. Point Zigbee2MQTT at `mqtt://core-mosquitto:1883`.
