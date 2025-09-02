import { Router } from "express";
import { validateRequest } from "../../utils/validation/validateRequest";
import {
  updateOrganizationController,
  getOrganizationController,
} from "./organization.controller";
import { 
  updateOrganizationSchema,
} from "./validation/validation";
import { 
  authenticateToken,
  requireRole,
  requireSameOrg,
} from "../auth/middleware/auth.middleware";

const organizationRouter = Router();

// Validation middleware for organization update
const validateOrganizationUpdate = validateRequest({ body: updateOrganizationSchema });

// Organization-specific middleware to extract org ID from route params
const requireSameOrgFromParams = requireSameOrg((req) => req.params.id);

/**
 * PUT /organizations/:id
 * Updates organization details
 * Requires:
 * - Authentication (JWT token)
 * - ADMIN or SUPERADMIN role
 * - User must belong to the organization being updated
 * - Valid request body (name and/or industry)
 */
organizationRouter.put(
  "/:id",
  authenticateToken,                    // Verify JWT and populate req.user
  requireRole("ADMIN", "SUPERADMIN"),   // Only admins can update organizations
  requireSameOrgFromParams,             // User must belong to the organization
  validateOrganizationUpdate,           // Validate request body
  updateOrganizationController
);

/**
 * GET /organizations/:id
 * Gets organization details
 * Requires:
 * - Authentication (JWT token)
 * - User must belong to the organization being accessed
 */
organizationRouter.get(
  "/:id",
  authenticateToken,                    // Verify JWT and populate req.user
  requireSameOrgFromParams,             // User must belong to the organization
  getOrganizationController
);

export default organizationRouter;