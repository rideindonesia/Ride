import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import penggunaRouter from "./pengguna";
import mitraRouter from "./mitra";
import seedRouter from "./seed";
import chatRouter from "./chat";
import adminRouter from "./admin";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/pengguna", penggunaRouter);
router.use("/mitra", mitraRouter);
router.use("/seed", seedRouter);
router.use("/chat", chatRouter);
router.use("/admin", adminRouter);
router.use("/push", pushRouter);

export default router;
