import { Request, Response } from "express";
import {
  UpdateOrganizationRequest,
  OrganizationIdParams,
} from "./validation/validation";
import {
  getOrganizationById,
  updateOrganization,
} from "./organization.service";
import { isAppError, AuthorizationError } from "../../utils/error/error";
import { Role } from "../../../generated/prisma";

/**
 * PUT /organizations/:id
 * Updates an organization's details
 * Requires authentication and proper authorization (ADMIN or HR role within the org)
 */
export async function updateOrganizationController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT (populated by auth middleware)
    const user = req.user!; // Non-null assertion since auth middleware validates this
    const { userId, orgId, role } = user;

    // Extract and validate route parameters
    const params = req.params as OrganizationIdParams;
    const organizationId = params.id;

    // Request body is already validated by zod middleware
    const validatedData = req.body as UpdateOrganizationRequest;

    // Update organization with proper authorization checks
    const result = await updateOrganization(
      organizationId,
      userId,
      orgId,
      role as Role,
      validatedData
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: "Organization updated successfully",
      data: result.organization,
    });
  } catch (error) {
    console.error("Update organization controller error:", error);

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
 * GET /organizations/:id
 * Gets organization details by ID
 * Requires authentication and user must belong to the organization
 */
export async function getOrganizationController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data from JWT
    const user = req.user!;
    const { orgId } = user;

    // Extract route parameters
    const params = req.params as OrganizationIdParams;
    const organizationId = params.id;

    // Authorization check: User can only access their own organization
    if (orgId !== organizationId) {
      throw new AuthorizationError("You can only access your own organization");
    }

    // Get organization details - the service will throw NotFoundError if not found
    const organizationData = await getOrganizationById(organizationId);

    res.status(200).json({
      success: true,
      message: "Organization retrieved successfully",
      data: organizationData,
    });
  } catch (error) {
    console.error("Get organization controller error:", error);

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
