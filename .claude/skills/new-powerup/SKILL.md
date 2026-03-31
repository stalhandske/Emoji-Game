---
name: new-powerup
description: Scaffold a new power-up entry in the Desert Golf game
disable-model-invocation: true
argument-hint: "[id] [name] [description]"
---

Add a new power-up to the Desert Golf game in `index.html`.

Arguments: $ARGUMENTS
- $0 = id (camelCase, e.g. `fastball`)
- $1 = display name (e.g. `Fast Ball`)
- $2 = short description shown on the card (e.g. `Ball moves twice as fast`)

## Steps

1. Read the POWER_UPS array in `index.html` (search for `const POWER_UPS`).

2. Append a new entry following this pattern:
```js
{ id: '$0', name: '$1', desc: '$2',
  apply: () => { /* TODO: implement effect */ } },
```

3. If the effect requires a new PARAMS key:
   - Add it to the `PARAMS` object with a sensible default
   - If it's a boolean flag, also add a `{ key:'...', label:'...', type:'bool' }` entry to the relevant group in `PARAM_GROUPS` (usually the `zombie` or `wizard` group)
   - If it's numeric, add a slider entry with appropriate min/max/step/digits

4. Implement the `apply()` body — mutate PARAMS values only; do not add new game logic unless asked.

5. Run `/test` to confirm nothing broke.

6. Report what was added and what still needs implementing if the effect touches game logic beyond PARAMS.
