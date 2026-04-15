import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import penggunaRouter from "./pengguna";
import mitraRouter from "./mitra";
import seedRouter from "./seed";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/pengguna", penggunaRouter);
router.use("/mitra", mitraRouter);
router.use("/seed", seedRouter);

export default router;
