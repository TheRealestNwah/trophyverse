import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Integration test files each truncate the same shared database at
        // startup, so running files in parallel lets one wipe another's rows
        // mid-test (see #172). The suite is fast enough to run serially.
        fileParallelism: false,
    },
});
