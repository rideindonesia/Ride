import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import penggunaRouter from "./pengguna";
import mitraRouter from "./mitra";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/pengguna", penggunaRouter);
router.use("/mitra", mitraRouter);

export default router;
