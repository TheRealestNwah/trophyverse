import { pool } from "../db";
import { runMatching } from "../matching";

runMatching()
    .then((summary) => {
        console.log(summary);
        return pool.end();
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
