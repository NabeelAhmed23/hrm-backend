import { Router } from "express";
import { processRequestBody } from "zod-express-middleware";
import {
  createEmployeeController,
  getEmployeesController,
  getEmployeeByIdController,
  updateEmployeeController,
  deleteEmployeeController,
  inviteEmployeeController,
} from "./employee.controller";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  inviteEmployeeSchema,
} from "./validation/validation";
import {
  authenticateToken,
  requireRole,
} from "../auth/middleware/auth.middleware";

const employeeRouter = Router();

// Validation middleware
const validateCreateEmployee = processRequestBody(createEmployeeSchema);
const validateUpdateEmployee = processRequestBody(updateEmployeeSchema);
const validateInviteEmployee = processRequestBody(inviteEmployeeSchema);

// Role-based middleware for HR and ADMIN operations
const requireHROrAdmin = requireRole("HR", "ADMIN", "SUPERADMIN");

/**
 * POST /employees
 * Creates a new employee record
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Valid request body (employee details)
 */
employeeRouter.post(
  "/",
  authenticateToken,        // Verify JWT and populate req.user
  requireHROrAdmin,         // Only HR and ADMIN can create employees
  validateCreateEmployee,   // Validate request body
  createEmployeeController
);

/**
 * GET /employees
 * Lists employees for the authenticated user's organization
 * Requires:
 * - Authentication (JWT token)
 * - Query parameters are validated in the controller
 */
employeeRouter.get(
  "/",
  authenticateToken,         // Verify JWT and populate req.user
  getEmployeesController
);

/**
 * GET /employees/:id
 * Gets details of a single employee
 * Requires:
 * - Authentication (JWT token)
 * - Employee must belong to the same organization
 */
employeeRouter.get(
  "/:id",
  authenticateToken,            // Verify JWT and populate req.user
  getEmployeeByIdController
);

/**
 * PUT /employees/:id
 * Updates an employee's details
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Valid request body (updated employee details)
 * - Employee must belong to the same organization
 */
employeeRouter.put(
  "/:id",
  authenticateToken,        // Verify JWT and populate req.user
  requireHROrAdmin,         // Only HR and ADMIN can update employees
  validateUpdateEmployee,   // Validate request body
  updateEmployeeController
);

/**
 * DELETE /employees/:id
 * Soft deletes an employee
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Employee must belong to the same organization
 */
employeeRouter.delete(
  "/:id",
  authenticateToken,        // Verify JWT and populate req.user
  requireHROrAdmin,         // Only HR and ADMIN can delete employees
  deleteEmployeeController
);

/**
 * POST /employees/:id/invite
 * Invites an employee by creating a User account linked to them
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Valid request body (email and optional sendEmail flag)
 * - Employee must belong to the same organization
 */
employeeRouter.post(
  "/:id/invite",
  authenticateToken,        // Verify JWT and populate req.user
  requireHROrAdmin,         // Only HR and ADMIN can invite employees
  validateInviteEmployee,   // Validate request body
  inviteEmployeeController
);

export default employeeRouter;