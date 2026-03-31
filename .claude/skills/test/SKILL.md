---
name: test
description: Run the Desert Golf physics test suite
disable-model-invocation: true
argument-hint: "[test-name-filter]"
---

Run the Desert Golf physics tests:

```
NODE_PATH=/opt/node22/lib/node_modules node tests/physics.test.js
```

Report the full output. If any tests fail, investigate the failure and fix it before reporting back. If $ARGUMENTS is provided, focus your investigation on tests matching that name.
