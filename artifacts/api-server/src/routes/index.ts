import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import attendanceRouter from "./attendance";
import adminRouter from "./admin";
import authRouter from "./auth";
import operatorsRouter from "./operators";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(operatorsRouter);
router.use(syncRouter);
router.use(attendanceRouter);
router.use(adminRouter);

export default router;
