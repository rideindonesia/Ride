import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import penggunaRouter from "./pengguna";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/pengguna", penggunaRouter);

export default router;
