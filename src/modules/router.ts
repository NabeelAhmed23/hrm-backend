import express from "express";
import authRouter from "./auth/auth.router";
import organizationRouter from "./organization/organization.router";

const router = express.Router();

// Mount auth routes
router.use("/auth", authRouter);

// Mount organization routes
router.use("/organizations", organizationRouter);

export default router;
