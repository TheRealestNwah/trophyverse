import { pool } from "../db";
import { seedLevelThresholds } from "./migrate";

seedLevelThresholds()
    .then(() => pool.end())
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
