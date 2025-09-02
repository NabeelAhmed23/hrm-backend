import express from "express";
import authRouter from "./auth/auth.router";
import organizationRouter from "./organization/organization.router";
import employeeRouter from "./employee/employee.router";
import notificationRouter from "./notification/notification.router";
import documentRouter from "./document/document.router";
import dashboardRouter from "./dashboard/dashboard.router";

const router = express.Router();

// Mount auth routes
router.use("/auth", authRouter);

// Mount organization routes
router.use("/organizations", organizationRouter);

// Mount employee routes
router.use("/employees", employeeRouter);

// Mount notification routes
router.use("/notifications", notificationRouter);

// Mount document routes
router.use("/documents", documentRouter);

// Mount dashboard routes
router.use("/dashboard", dashboardRouter);

export default router;
