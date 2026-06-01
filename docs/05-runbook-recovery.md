# 05 — Runbook: Recovery & Rollback

> See docs/00-architecture.md §4 (deploy rollback) and §12 (backups). Skeleton —
> validate end-to-end during the Phase 7 restore drill.

## A. Roll back a bad config/firmware deploy (Phase 8 pipeline)
1. **`git revert <bad-commit>`** on `main` (or revert the merge).
2. Push → the validation gate runs → the self-hosted runner **redeploys the
   last-good** config and OTAs the affected device(s).
3. ESPHome keeps the **previous firmware** if an OTA upload fails, so a failed
   flash does not brick a node; the canary + health check catch a
   compiles-but-wrong build before it reaches the whole fleet.

## B. Restore Home Assistant from backup (host/VM lost)
1. Reinstall Proxmox (if needed) → recreate the **HA OS VM** (02-bootstrap).
2. In HA onboarding, **restore from the latest Supervisor backup** (or upload the
   off-site copy). This restores `.storage` (incl. **HomeKit pairing**), recorder,
   and add-on data.
3. `git clone`/`git pull` this repo into `/config` to confirm authored config
   matches; reconcile if the backup was newer.
4. Re-enter the backup **encryption passphrase** when prompted.

## C. Zigbee network survives
- The **coordinator backup** + Z2M database restore the mesh **without re-pairing**.
- Verify with the §15 independence test: restart HA Core → bulb returns without
  re-pairing.

## D. HomeKit re-establish
- Pairing lives in `.storage` → restored by the backup. If it doesn't come back,
  remove the bridge in Apple Home and re-pair (then reassign rooms).

## Restore-drill checklist (Phase 7 DoD)
- [ ] Restore into a throwaway VM/snapshot from the latest backup.
- [ ] HA boots; entities present; recorder intact.
- [ ] Zigbee mesh intact (no re-pair).
- [ ] HomeKit re-establishes (or documented re-pair steps).
- [ ] `git revert` round-trip redeploys last-good (once Phase 8 is live).
