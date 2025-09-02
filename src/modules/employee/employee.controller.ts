import { Request, Response } from "express";
import {
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  EmployeeIdParams,
  InviteEmployeeRequest,
  getEmployeesQuerySchema,
} from "./validation/validation";
import {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  inviteEmployee,
} from "./employee.service";
import { isAppError } from "../../utils/error/error";
import { Role } from "../../../generated/prisma";

/**
 * POST /employees
 * Creates a new employee record
 * Requires HR or ADMIN role
 */
export async function createEmployeeController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId, role } = user;

    // Request body is already validated by zod middleware
    const validatedData = req.body as CreateEmployeeRequest;

    // Create employee
    const result = await createEmployee(orgId, role as Role, validatedData);

    // Send success response
    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Create employee controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /employees
 * Lists employees for the authenticated user's organization
 * Supports pagination, search, and filtering
 */
export async function getEmployeesController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId, role } = user;

    // Validate query parameters manually
    const queryValidation = getEmployeesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        code: "VALIDATION_ERROR",
        details: queryValidation.error.issues,
      });
      return;
    }
    
    const query = queryValidation.data;

    // Get employees
    const result = await getEmployees(orgId, role as Role, query);

    // Send success response
    res.status(200).json({
      success: true,
      message: "Employees retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Get employees controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * GET /employees/:id
 * Gets details of a single employee
 * Employee must belong to the same organization as the authenticated user
 */
export async function getEmployeeByIdController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId } = user;

    // Extract route parameters (already validated by zod middleware)
    const params = req.params as EmployeeIdParams;
    const employeeId = params.id;

    // Get employee
    const employee = await getEmployeeById(employeeId, orgId);

    // Send success response
    res.status(200).json({
      success: true,
      message: "Employee retrieved successfully",
      data: {
        employee,
      },
    });
  } catch (error) {
    console.error("Get employee by ID controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * PUT /employees/:id
 * Updates an employee's details
 * Requires HR or ADMIN role
 * Employee must belong to the same organization as the authenticated user
 */
export async function updateEmployeeController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId, role } = user;

    // Extract route parameters (already validated by zod middleware)
    const params = req.params as EmployeeIdParams;
    const employeeId = params.id;

    // Request body is already validated by zod middleware
    const validatedData = req.body as UpdateEmployeeRequest;

    // Update employee
    const result = await updateEmployee(
      employeeId,
      orgId,
      role as Role,
      validatedData
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: "Employee updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update employee controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * DELETE /employees/:id
 * Soft deletes an employee
 * Requires HR or ADMIN role
 * Employee must belong to the same organization as the authenticated user
 */
export async function deleteEmployeeController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId, role } = user;

    // Extract route parameters (already validated by zod middleware)
    const params = req.params as EmployeeIdParams;
    const employeeId = params.id;

    // Delete employee (soft delete)
    await deleteEmployee(employeeId, orgId, role as Role);

    // Send success response
    res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Delete employee controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * POST /employees/:id/invite
 * Invites an employee by creating a User account linked to them
 * Requires HR or ADMIN role
 * Employee must belong to the same organization as the authenticated user
 */
export async function inviteEmployeeController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId, role } = user;

    // Extract route parameters (already validated by zod middleware)
    const params = req.params as EmployeeIdParams;
    const employeeId = params.id;

    // Request body is already validated by zod middleware
    const validatedData = req.body as InviteEmployeeRequest;

    // Invite employee
    const result = await inviteEmployee(
      employeeId,
      orgId,
      role as Role,
      validatedData
    );

    // Send success response
    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        ...(result.inviteToken && { inviteToken: result.inviteToken }),
      },
    });
  } catch (error) {
    console.error("Invite employee controller error:", error);

    // Handle custom application errors
    if (isAppError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}