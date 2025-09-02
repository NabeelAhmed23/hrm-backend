import { Organization, Role } from "../../../generated/prisma";
import { UpdateOrganizationRequest } from "./validation/validation";
import prisma from "../../utils/config/db";
import {
  NotFoundError,
  AuthorizationError,
  handlePrismaError,
  InternalServerError,
} from "../../utils/error/error";

// Response interface
export interface UpdateOrganizationResponse {
  organization: {
    id: string;
    name: string;
    industry: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Updates an organization's details with proper authorization checks
 * Only ADMIN and HR roles within the organization can perform updates
 */
export async function updateOrganization(
  organizationId: string,
  userId: string,
  userOrgId: string,
  userRole: Role,
  data: UpdateOrganizationRequest
): Promise<UpdateOrganizationResponse> {
  try {
    // Authorization check: User must belong to the organization they're trying to update
    if (userOrgId !== organizationId) {
      throw new AuthorizationError(
        "You can only update your own organization"
      );
    }

    // Role-based authorization: Only ADMIN or HR can update organization details
    if (userRole !== Role.ADMIN && userRole !== Role.SUPERADMIN) {
      // Note: HR role doesn't exist in the current schema, so we only allow ADMIN and SUPERADMIN
      // If HR role is needed, it should be added to the Role enum in the Prisma schema
      throw new AuthorizationError(
        "Only administrators can update organization details"
      );
    }

    // Check if organization exists
    const existingOrg = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!existingOrg) {
      throw new NotFoundError("Organization");
    }

    // Update the organization
    const updatedOrganization = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.industry !== undefined && { industry: data.industry }),
        updatedAt: new Date(),
      },
    });

    return {
      organization: {
        id: updatedOrganization.id,
        name: updatedOrganization.name,
        industry: updatedOrganization.industry,
        createdAt: updatedOrganization.createdAt,
        updatedAt: updatedOrganization.updatedAt,
      },
    };
  } catch (error) {
    console.error("Update organization error:", error);

    // Re-throw custom errors as they are
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
      "An unexpected error occurred while updating organization"
    );
  }
}

/**
 * Gets organization details by ID
 * Used for verification and response purposes
 */
export async function getOrganizationById(
  organizationId: string
): Promise<Organization> {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError("Organization");
    }

    return organization;
  } catch (error) {
    console.error("Get organization error:", error);

    // Re-throw custom errors as they are
    if (error instanceof NotFoundError) {
      throw error;
    }

    // Handle Prisma errors
    if (error && typeof error === "object" && "code" in error) {
      throw handlePrismaError(error);
    }

    // Handle unexpected errors
    throw new InternalServerError(
      "An unexpected error occurred while fetching organization"
    );
  }
}