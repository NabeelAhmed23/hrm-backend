import { Employee, Role, User } from "../../../generated/prisma";
import { 
  CreateEmployeeRequest, 
  UpdateEmployeeRequest, 
  GetEmployeesQuery,
  InviteEmployeeRequest,
} from "./validation/validation";
import prisma from "../../utils/config/db";
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  handlePrismaError,
  InternalServerError,
} from "../../utils/error/error";
import { generateInviteToken, hashPassword } from "../../utils/invite/invite.utils";

// Response interfaces
export interface EmployeeResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  dob: Date;
  address: string;
  city: string;
  state: string;
  country: string;
  organizationId: string;
  userId: string | null;
  hasUser: boolean;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateEmployeeResponse {
  employee: EmployeeResponse;
}

export interface UpdateEmployeeResponse {
  employee: EmployeeResponse;
}

export interface GetEmployeesResponse {
  employees: EmployeeResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface InviteEmployeeResponse {
  success: boolean;
  message: string;
  inviteToken?: string;
  user: {
    id: string;
    email: string;
    role: Role;
  };
}

/**
 * Utility function to check if user has HR or ADMIN permissions
 */
function hasHROrAdminRole(role: Role): boolean {
  return role === Role.HR || role === Role.ADMIN || role === Role.SUPERADMIN;
}

/**
 * Utility function to format employee data for response
 */
function formatEmployeeResponse(employee: Employee & { user?: User | null }): EmployeeResponse {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    dob: employee.dob,
    address: employee.address,
    city: employee.city,
    state: employee.state,
    country: employee.country,
    organizationId: employee.organizationId,
    userId: employee.userId,
    hasUser: !!employee.userId,
    userEmail: employee.user?.email,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
    deletedAt: employee.deletedAt,
  };
}

/**
 * Creates a new employee record
 * Only HR and ADMIN roles can create employees
 */
export async function createEmployee(
  organizationId: string,
  userRole: Role,
  data: CreateEmployeeRequest
): Promise<CreateEmployeeResponse> {
  try {
    // Role-based authorization
    if (!hasHROrAdminRole(userRole)) {
      throw new AuthorizationError(
        "Only HR and Admin users can create employees"
      );
    }

    // Check if email already exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { email: data.email },
    });

    if (existingEmployee) {
      throw new ConflictError("Employee with this email already exists");
    }

    // Create employee
    const employee = await prisma.employee.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        dob: data.dob,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        organizationId,
      },
      include: {
        user: true,
      },
    });

    return {
      employee: formatEmployeeResponse(employee),
    };
  } catch (error) {
    console.error("Create employee error:", error);

    // Re-throw custom errors first
    if (error instanceof AuthorizationError || error instanceof ConflictError) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while creating employee"
    );
  }
}

/**
 * Gets all employees for an organization with pagination and filtering
 */
export async function getEmployees(
  organizationId: string,
  _userRole: Role,
  query: GetEmployeesQuery
): Promise<GetEmployeesResponse> {
  try {
    const { page, limit, search, includeDeleted } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      organizationId,
    };

    // Include deleted filter
    if (!includeDeleted) {
      where.deletedAt = null;
    }

    // Search filter
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { 
          user: {
            email: { contains: search, mode: 'insensitive' }
          }
        }
      ];
    }

    // Get total count for pagination
    const total = await prisma.employee.count({ where });

    // Get employees with pagination
    const employees = await prisma.employee.findMany({
      where,
      include: {
        user: true,
      },
      orderBy: [
        { deletedAt: 'asc' }, // Non-deleted first
        { createdAt: 'desc' }
      ],
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      employees: employees.map(formatEmployeeResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  } catch (error) {
    console.error("Get employees error:", error);

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while fetching employees"
    );
  }
}

/**
 * Gets a single employee by ID
 */
export async function getEmployeeById(
  employeeId: string,
  organizationId: string
): Promise<EmployeeResponse> {
  try {
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        deletedAt: null, // Only return non-deleted employees
      },
      include: {
        user: true,
      },
    });

    if (!employee) {
      throw new NotFoundError("Employee");
    }

    return formatEmployeeResponse(employee);
  } catch (error) {
    console.error("Get employee error:", error);

    // Re-throw custom errors
    if (error instanceof NotFoundError) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while fetching employee"
    );
  }
}

/**
 * Updates an employee's details
 * Only HR and ADMIN roles can update employees
 */
export async function updateEmployee(
  employeeId: string,
  organizationId: string,
  userRole: Role,
  data: UpdateEmployeeRequest
): Promise<UpdateEmployeeResponse> {
  try {
    // Role-based authorization
    if (!hasHROrAdminRole(userRole)) {
      throw new AuthorizationError(
        "Only HR and Admin users can update employees"
      );
    }

    // Check if employee exists and belongs to organization
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!existingEmployee) {
      throw new NotFoundError("Employee");
    }

    // Update employee
    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        user: true,
      },
    });

    return {
      employee: formatEmployeeResponse(updatedEmployee),
    };
  } catch (error) {
    console.error("Update employee error:", error);

    // Re-throw custom errors
    if (
      error instanceof NotFoundError ||
      error instanceof AuthorizationError
    ) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while updating employee"
    );
  }
}

/**
 * Soft deletes an employee
 * Only HR and ADMIN roles can delete employees
 */
export async function deleteEmployee(
  employeeId: string,
  organizationId: string,
  userRole: Role
): Promise<void> {
  try {
    // Role-based authorization
    if (!hasHROrAdminRole(userRole)) {
      throw new AuthorizationError(
        "Only HR and Admin users can delete employees"
      );
    }

    // Check if employee exists and belongs to organization
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!existingEmployee) {
      throw new NotFoundError("Employee");
    }

    // Soft delete employee
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Delete employee error:", error);

    // Re-throw custom errors
    if (
      error instanceof NotFoundError ||
      error instanceof AuthorizationError
    ) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while deleting employee"
    );
  }
}

/**
 * Invites an employee by creating a User account linked to them
 * Only HR and ADMIN roles can invite employees
 */
export async function inviteEmployee(
  employeeId: string,
  organizationId: string,
  userRole: Role,
  data: InviteEmployeeRequest
): Promise<InviteEmployeeResponse> {
  try {
    // Role-based authorization
    if (!hasHROrAdminRole(userRole)) {
      throw new AuthorizationError(
        "Only HR and Admin users can invite employees"
      );
    }

    // Check if employee exists and belongs to organization
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId,
        deletedAt: null,
      },
      include: {
        user: true,
      },
    });

    if (!existingEmployee) {
      throw new NotFoundError("Employee");
    }

    // Check if employee already has a user account
    if (existingEmployee.userId) {
      throw new ConflictError(
        "Employee already has a user account"
      );
    }

    // Check if email is already in use by another user
    const existingUser = await prisma.user.findUnique({
      where: { email: existingEmployee.email },
    });

    if (existingUser) {
      throw new ConflictError(
        "Employee email is already in use by another user account"
      );
    }

    // Generate temporary password and invite token
    const temporaryPassword = Math.random().toString(36).slice(-12);
    const hashedPassword = await hashPassword(temporaryPassword);
    const inviteToken = generateInviteToken();

    // Create user account in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: existingEmployee.email,
          password: hashedPassword,
          firstName: existingEmployee.firstName,
          lastName: existingEmployee.lastName,
          role: Role.USER, // Default role for invited employees
          isActive: false, // Account is inactive until invite is accepted
          organizationId,
        },
      });

      // Link user to employee
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          userId: user.id,
          updatedAt: new Date(),
        },
      });

      return { user };
    });

    // TODO: Send invitation email with invite token and temporary password
    // This would typically integrate with an email service like SendGrid, SES, etc.
    if (data.sendEmail) {
      console.log(`Sending invite email to ${existingEmployee.email} with token: ${inviteToken}`);
      // await sendInviteEmail(existingEmployee.email, inviteToken, temporaryPassword);
    }

    return {
      success: true,
      message: "Employee invited successfully",
      inviteToken: data.sendEmail ? undefined : inviteToken, // Only return token if email not sent
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
      },
    };
  } catch (error) {
    console.error("Invite employee error:", error);

    // Re-throw custom errors
    if (
      error instanceof NotFoundError ||
      error instanceof AuthorizationError ||
      error instanceof ConflictError
    ) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while inviting employee"
    );
  }
}