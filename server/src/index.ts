import express from "express";
import session from "express-session";
import { config } from "./config";
import { passport } from "./auth/passport";
import { authRouter } from "./auth/routes";
import { steamRouter } from "./steam/routes";

const app = express();

app.use(express.json());
app.use(
    session({
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
    })
);
app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRouter);
app.use("/api/steam", steamRouter);

app.get("/", (_req, res) => {
    res.send("Trophyverse API. Sign in via GET /auth/steam.");
});

app.listen(config.port, () => {
    console.log(`Trophyverse server listening on ${config.baseUrl}`);
});
