import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import stampsRouter from "./stamps";
import prizesRouter from "./prizes";
import adminRouter from "./admin";
import lineRouter from "./line";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(stampsRouter);
router.use(prizesRouter);
router.use(adminRouter);
router.use(lineRouter);

export default router;
