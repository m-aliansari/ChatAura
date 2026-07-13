import { Router } from "express";

const router = Router();

// Liveness only — deliberately no Postgres/Redis round-trip. Load balancers poll this
// every few seconds and kill the task when it fails, so it must not go red for a
// transient dependency blip the process itself can recover from.
router.get("/", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

export default router;
