/**
 * Dashboard Router
 * 
 * Defines API routes for compliance dashboard operations.
 * Implements role-based access control and request validation.
 * 
 * Routes:
 * - GET /dashboard/compliance - Organization compliance summary (HR/ADMIN only)
 * - GET /dashboard/compliance/metrics - High-level metrics (HR/ADMIN only)
 * - GET /dashboard/compliance/critical - Critical issues (HR/ADMIN only)
 * - GET /dashboard/compliance/types - Compliance by type (HR/ADMIN only)
 * - GET /dashboard/compliance/:employeeId - Employee compliance (RBAC applied)
 */

import { Router } from 'express';
import { validateRequest } from '../../utils/validation/validateRequest';
import {
  getOrganizationComplianceController,
  getEmployeeComplianceController,
  getComplianceByTypeController,
  getComplianceMetricsController,
  getCriticalComplianceIssuesController,
} from './dashboard.controller';
import {
  employeeIdSchema,
  complianceQuerySchema,
  complianceMetricsQuerySchema,
  criticalIssuesQuerySchema,
  typeComplianceQuerySchema,
} from './validation/validation';
import {
  authenticateToken,
  requireRole,
} from '../auth/middleware/auth.middleware';

const dashboardRouter = Router();

// Validation middleware
const validateEmployeeId = validateRequest({ 
  params: employeeIdSchema 
});
const validateComplianceQuery = validateRequest({ 
  query: complianceQuerySchema 
});
const validateMetricsQuery = validateRequest({ 
  query: complianceMetricsQuerySchema 
});
const validateCriticalIssuesQuery = validateRequest({ 
  query: criticalIssuesQuerySchema 
});
const validateTypeComplianceQuery = validateRequest({ 
  query: typeComplianceQuerySchema 
});

// Role-based middleware
const requireHROrAdmin = requireRole('HR', 'ADMIN', 'SUPERADMIN');

/**
 * GET /dashboard/compliance
 * Get organization-wide compliance summary
 * 
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Optional query parameters for filtering and sorting
 * 
 * Returns traffic-light compliance status for all employees in the organization
 */
dashboardRouter.get(
  '/compliance',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can view org-wide data
  validateComplianceQuery,        // Validate query parameters
  getOrganizationComplianceController
);

/**
 * GET /dashboard/compliance/metrics
 * Get high-level compliance metrics and statistics
 * 
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Optional query parameters for metrics configuration
 * 
 * Returns dashboard-ready compliance metrics and KPIs
 */
dashboardRouter.get(
  '/compliance/metrics',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can view metrics
  validateMetricsQuery,           // Validate query parameters
  getComplianceMetricsController
);

/**
 * GET /dashboard/compliance/critical
 * Get critical compliance issues requiring immediate attention
 * 
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Optional query parameters for filtering critical issues
 * 
 * Returns employees with expired documents (RED status)
 */
dashboardRouter.get(
  '/compliance/critical',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can view critical issues
  validateCriticalIssuesQuery,    // Validate query parameters
  getCriticalComplianceIssuesController
);

/**
 * GET /dashboard/compliance/types
 * Get compliance status breakdown by document type
 * 
 * Requires:
 * - Authentication (JWT token)
 * - HR or ADMIN role
 * - Optional query parameters for type analysis configuration
 * 
 * Returns compliance statistics grouped by document type
 */
dashboardRouter.get(
  '/compliance/types',
  authenticateToken,              // Verify JWT and populate req.user
  requireHROrAdmin,               // Only HR and ADMIN can view type breakdown
  validateTypeComplianceQuery,    // Validate query parameters
  getComplianceByTypeController
);

/**
 * GET /dashboard/compliance/:employeeId
 * Get compliance status for a specific employee
 * 
 * Requires:
 * - Authentication (JWT token)
 * - Valid employee ID (UUID)
 * 
 * Access Control:
 * - HR/ADMIN: Can view any employee's compliance
 * - USER: Can only view their own compliance status
 * 
 * Returns detailed compliance breakdown for the employee
 */
dashboardRouter.get(
  '/compliance/:employeeId',
  authenticateToken,              // Verify JWT and populate req.user
  validateEmployeeId,             // Validate employee ID parameter
  getEmployeeComplianceController // RBAC is handled within the controller
);

export default dashboardRouter;