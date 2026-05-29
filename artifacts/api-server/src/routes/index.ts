import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import attendanceRouter from "./attendance";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(syncRouter);
router.use(attendanceRouter);
router.use(adminRouter);

export default router;
