/**
 * Dashboard Controller
 *
 * Handles HTTP requests for compliance dashboard operations.
 * Provides traffic-light compliance status monitoring for employees and organizations.
 *
 * Endpoints:
 * - GET /dashboard/compliance - Organization-wide compliance summary
 * - GET /dashboard/compliance/:employeeId - Individual employee compliance
 * - GET /dashboard/compliance/types - Compliance by document type
 * - GET /dashboard/compliance/metrics - High-level compliance metrics
 * - GET /dashboard/compliance/critical - Critical compliance issues
 */

import { Request, Response } from "express";
import {
  EmployeeIdParams,
  ComplianceQuery,
  ComplianceMetricsQuery,
  CriticalIssuesQuery,
  TypeComplianceQuery,
} from "./validation/validation";
import { complianceService } from "../../services/complianceService";
import { isAppError } from "../../utils/error/error";
import { Role } from "../../../generated/prisma";

/**
 * GET /dashboard/compliance
 * Get organization-wide compliance summary
 *
 * Features:
 * - Role-based authorization (HR/ADMIN only)
 * - Traffic-light status summary
 * - Employee list with compliance status
 * - Optional filtering and sorting
 */
export async function getOrganizationComplianceController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { orgId, role } = user;

    // Query parameters are validated by middleware
    const query = req.validated?.query as ComplianceQuery;

    // Get organization compliance data
    const complianceData = await complianceService.getOrganizationCompliance(
      orgId,
      role as Role
    );

    // Apply filters if specified
    let filteredEmployees = complianceData.employees;

    if (query?.status) {
      filteredEmployees = filteredEmployees.filter(
        (employee) => employee.status === query.status
      );
    }

    // Apply sorting
    if (query?.sortBy) {
      filteredEmployees.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (query.sortBy) {
          case "name":
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case "status":
            // Sort by severity: RED > YELLOW > GREEN
            const statusOrder = { RED: 3, YELLOW: 2, GREEN: 1 };
            aValue = statusOrder[a.status];
            bValue = statusOrder[b.status];
            break;
          default:
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
        }

        if (query.sortOrder === "desc") {
          return aValue < bValue ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      });
    }

    // Recalculate summary for filtered results
    const filteredSummary = {
      green: filteredEmployees.filter((e) => e.status === "GREEN").length,
      yellow: filteredEmployees.filter((e) => e.status === "YELLOW").length,
      red: filteredEmployees.filter((e) => e.status === "RED").length,
      total: filteredEmployees.length,
    };

    // Include metrics if requested
    let metrics = undefined;
    if (query?.includeMetrics) {
      metrics = await complianceService.getComplianceMetrics(
        orgId,
        role as Role,
        user.userId
      );
    }

    // Send success response
    res.status(200).json({
      success: true,
      message: "Organization compliance data retrieved successfully",
      data: {
        organizationId: complianceData.organizationId,
        summary: query?.status ? filteredSummary : complianceData.summary,
        employees: filteredEmployees,
        ...(metrics && { metrics }),
      },
    });
  } catch (error) {
    console.error("❌ Get organization compliance controller error:", error);

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
 * GET /dashboard/compliance/:employeeId
 * Get individual employee compliance status
 *
 * Features:
 * - Role-based access (HR/ADMIN see all, USER sees own)
 * - Document-level compliance breakdown
 * - Expiry details and warnings
 */
export async function getEmployeeComplianceController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { userId, orgId, role } = user;

    // Route parameters are validated by middleware
    const params = req.validated.params as EmployeeIdParams;
    const employeeId = params.employeeId;

    // Get employee compliance data
    const complianceData = await complianceService.getEmployeeCompliance(
      employeeId,
      orgId,
      userId,
      role as Role
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: "Employee compliance data retrieved successfully",
      data: complianceData,
    });
  } catch (error) {
    console.error("❌ Get employee compliance controller error:", error);

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
 * GET /dashboard/compliance/types
 * Get compliance status by document type
 *
 * Features:
 * - Role-based authorization (HR/ADMIN only)
 * - Document type breakdown
 * - Status distribution per type
 */
export async function getComplianceByTypeController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { orgId, role } = user;

    // Query parameters are validated by middleware
    const query = req.validated?.query as TypeComplianceQuery;

    // Get compliance by document type
    const complianceData = await complianceService.getComplianceByType(
      orgId,
      role as Role
    );

    // Filter by minimum documents if specified
    let filteredData = complianceData;
    if (query?.minDocuments && query.minDocuments > 1) {
      filteredData = complianceData.filter(
        (typeData) => typeData.summary.total >= query.minDocuments!
      );
    }

    // Remove detailed documents if not requested
    if (!query?.includeDetails) {
      filteredData = filteredData.map((typeData) => ({
        ...typeData,
        documents: [], // Remove document details for summary view
      }));
    }

    // Send success response
    res.status(200).json({
      success: true,
      message: "Compliance by document type retrieved successfully",
      data: {
        documentTypes: filteredData,
        totalTypes: filteredData.length,
      },
    });
  } catch (error) {
    console.error("❌ Get compliance by type controller error:", error);

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
 * GET /dashboard/compliance/metrics
 * Get high-level compliance metrics
 *
 * Features:
 * - Role-based data filtering (organization-wide for HR/ADMIN, personal for employees)
 * - Dashboard summary statistics
 * - Compliance rates and trends
 * - Employee-specific metrics for regular users
 */
export async function getComplianceMetricsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { userId, orgId, role } = user;

    // Query parameters are validated by middleware
    const query = req.validated?.query as ComplianceMetricsQuery;

    // Get compliance metrics
    const metrics = await complianceService.getComplianceMetrics(
      orgId,
      role as Role,
      userId
    );

    // Add additional context
    const responseData = {
      ...metrics,
      period: query?.period || 30,
      generatedAt: new Date().toISOString(),
      complianceGrade: getComplianceGrade(metrics.complianceRate),
    };

    // Send success response
    res.status(200).json({
      success: true,
      message: "Compliance metrics retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("❌ Get compliance metrics controller error:", error);

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
 * GET /dashboard/compliance/critical
 * Get critical compliance issues (RED status)
 *
 * Features:
 * - Role-based data filtering (organization-wide for HR/ADMIN, personal for employees)
 * - Expired document details
 * - Urgent action items
 * - Employee-specific critical issues for regular users
 */
export async function getCriticalComplianceIssuesController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Extract authenticated user data
    const user = req.user!;
    const { userId, orgId, role } = user;

    // Query parameters are validated by middleware
    const query = req.validated?.query as CriticalIssuesQuery;

    // Get critical compliance issues
    let criticalIssues = await complianceService.getCriticalComplianceIssues(
      orgId,
      role as Role,
      userId
    );

    // Apply filters if specified
    if (query?.maxDaysExpired) {
      criticalIssues = criticalIssues
        .map((employee) => ({
          ...employee,
          expiredDocuments: employee.expiredDocuments.filter(
            (doc) => doc.daysExpired <= query.maxDaysExpired!
          ),
        }))
        .filter((employee) => employee.expiredDocuments.length > 0);
    }

    if (query?.documentType) {
      criticalIssues = criticalIssues
        .map((employee) => ({
          ...employee,
          expiredDocuments: employee.expiredDocuments.filter(
            (doc) => doc.type === query.documentType
          ),
        }))
        .filter((employee) => employee.expiredDocuments.length > 0);
    }

    // Calculate summary statistics
    const totalEmployees = criticalIssues.length;
    const totalExpiredDocuments = criticalIssues.reduce(
      (sum, employee) => sum + employee.expiredDocuments.length,
      0
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: "Critical compliance issues retrieved successfully",
      data: {
        summary: {
          totalEmployees,
          totalExpiredDocuments,
        },
        employees: criticalIssues,
      },
    });
  } catch (error) {
    console.error("❌ Get critical compliance issues controller error:", error);

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
 * Helper function to get compliance grade based on compliance rate
 */
function getComplianceGrade(complianceRate: number): string {
  if (complianceRate >= 95) return "A+";
  if (complianceRate >= 90) return "A";
  if (complianceRate >= 85) return "B+";
  if (complianceRate >= 80) return "B";
  if (complianceRate >= 75) return "C+";
  if (complianceRate >= 70) return "C";
  if (complianceRate >= 65) return "D+";
  if (complianceRate >= 60) return "D";
  return "F";
}
