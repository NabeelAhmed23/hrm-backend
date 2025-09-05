/**
 * Compliance Service
 *
 * Handles compliance status tracking and reporting for employees and organizations.
 * Implements traffic-light system for document compliance monitoring.
 *
 * Features:
 * - Employee compliance status calculation
 * - Organization-wide compliance reporting
 * - Document type compliance analysis
 * - Efficient Prisma queries with joins
 * - Role-based access control enforcement
 */

import prisma from "../utils/config/db";
import {
  NotFoundError,
  AuthorizationError,
  InternalServerError,
} from "../utils/error/error";
import { Role, DocumentType } from "../../generated/prisma";
import {
  ComplianceStatus,
  EmployeeComplianceInfo,
  OrganizationComplianceInfo,
  ComplianceByType,
  getComplianceStatus,
  getEmployeeComplianceStatus,
  formatDocumentCompliance,
  calculateComplianceSummary,
} from "../utils/compliance/complianceStatus";

/**
 * Compliance Service Class
 */
export class ComplianceService {
  /**
   * Get compliance status for a single employee
   *
   * @param employeeId - Employee ID to check
   * @param organizationId - Organization ID for security
   * @param requestingUserId - ID of user making request (for RBAC)
   * @param requestingUserRole - Role of requesting user
   * @returns Employee compliance information
   */
  async getEmployeeCompliance(
    employeeId: string,
    organizationId: string,
    requestingUserId: string,
    requestingUserRole: Role
  ): Promise<EmployeeComplianceInfo> {
    try {
      // Authorization: HR/ADMIN can view any employee, USER can only view themselves
      if (!["HR", "ADMIN", "SUPERADMIN"].includes(requestingUserRole)) {
        // Check if user is viewing their own employee record
        const requestingUserEmployee = await prisma.employee.findUnique({
          where: { userId: requestingUserId },
          select: { id: true },
        });

        if (
          !requestingUserEmployee ||
          requestingUserEmployee.id !== employeeId
        ) {
          throw new AuthorizationError(
            "You can only view your own compliance status"
          );
        }
      }

      // Fetch employee with their documents using efficient join
      const employee = await prisma.employee.findFirst({
        where: {
          id: employeeId,
          organizationId,
          deletedAt: null, // Only active employees
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          documents: {
            where: {
              deletedAt: null, // Only non-deleted documents
            },
            select: {
              id: true,
              title: true,
              type: true,
              expiresAt: true,
              createdAt: true,
            },
            orderBy: [
              { expiresAt: "asc" }, // Soonest expiry first
              { createdAt: "desc" }, // Newest first for same expiry
            ],
          },
        },
      });

      if (!employee) {
        throw new NotFoundError("Employee not found");
      }

      // Format documents with compliance status
      const documentCompliance = employee.documents.map((doc) =>
        formatDocumentCompliance({
          id: doc.id,
          title: doc.title,
          expiresAt: doc.expiresAt,
        })
      );

      // Calculate overall employee status
      const employeeStatus = getEmployeeComplianceStatus(employee.documents);

      // Return formatted employee compliance info
      return {
        employeeId: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        status: employeeStatus,
        documents: documentCompliance,
      };
    } catch (error) {
      console.error("❌ Get employee compliance error:", error);

      if (
        error instanceof NotFoundError ||
        error instanceof AuthorizationError
      ) {
        throw error;
      }

      throw new InternalServerError(
        "Failed to retrieve employee compliance status"
      );
    }
  }

  /**
   * Get organization-wide compliance summary
   *
   * @param organizationId - Organization ID
   * @param requestingUserRole - Role of requesting user (must be HR/ADMIN)
   * @returns Organization compliance summary
   */
  async getOrganizationCompliance(
    organizationId: string,
    requestingUserRole: Role
  ): Promise<OrganizationComplianceInfo> {
    try {
      // Authorization: Only HR and ADMIN can view organization-wide data
      if (!["HR", "ADMIN", "SUPERADMIN"].includes(requestingUserRole)) {
        throw new AuthorizationError(
          "Only HR and ADMIN users can view organization compliance"
        );
      }

      // Fetch all employees with their documents in a single efficient query
      const employees = await prisma.employee.findMany({
        where: {
          organizationId,
          deletedAt: null, // Only active employees
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          documents: {
            where: {
              deletedAt: null, // Only non-deleted documents
            },
            select: {
              id: true,
              expiresAt: true,
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });

      // Calculate compliance status for each employee
      const employeeComplianceList = employees.map((employee) => {
        const status = getEmployeeComplianceStatus(employee.documents);

        return {
          employeeId: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          status,
        };
      });

      // Calculate summary statistics
      const summary = calculateComplianceSummary(employeeComplianceList);

      return {
        organizationId,
        summary,
        employees: employeeComplianceList,
      };
    } catch (error) {
      console.error("❌ Get organization compliance error:", error);

      if (error instanceof AuthorizationError) {
        throw error;
      }

      throw new InternalServerError(
        "Failed to retrieve organization compliance status"
      );
    }
  }

  /**
   * Get compliance status broken down by document type
   *
   * @param organizationId - Organization ID
   * @param requestingUserRole - Role of requesting user (must be HR/ADMIN)
   * @returns Compliance status by document type
   */
  async getComplianceByType(
    organizationId: string,
    requestingUserRole: Role
  ): Promise<ComplianceByType[]> {
    try {
      // Authorization: Only HR and ADMIN can view detailed compliance data
      if (!["HR", "ADMIN", "SUPERADMIN"].includes(requestingUserRole)) {
        throw new AuthorizationError(
          "Only HR and ADMIN users can view compliance by type"
        );
      }

      // Fetch all documents grouped by type with efficient query
      const documents = await prisma.document.findMany({
        where: {
          organizationId,
          deletedAt: null,
          // Only include documents assigned to employees
          employeeId: { not: null },
        },
        select: {
          id: true,
          title: true,
          type: true,
          expiresAt: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ type: "asc" }, { expiresAt: "asc" }],
      });

      // Group documents by type and calculate compliance
      const typeGroups = new Map<
        DocumentType,
        Array<{
          id: string;
          title: string;
          expiresAt: Date | null;
        }>
      >();

      documents.forEach((doc) => {
        if (!typeGroups.has(doc.type)) {
          typeGroups.set(doc.type, []);
        }

        typeGroups.get(doc.type)!.push({
          id: doc.id,
          title: doc.title,
          expiresAt: doc.expiresAt,
        });
      });

      // Calculate compliance for each document type
      const complianceByType: ComplianceByType[] = [];

      typeGroups.forEach((docs, type) => {
        const documentCompliance = docs.map((doc) =>
          formatDocumentCompliance(doc)
        );

        // Count status distribution for this type
        const summary = {
          green: documentCompliance.filter((d) => d.status === "GREEN").length,
          yellow: documentCompliance.filter((d) => d.status === "YELLOW")
            .length,
          red: documentCompliance.filter((d) => d.status === "RED").length,
          total: documentCompliance.length,
        };

        complianceByType.push({
          documentType: type,
          summary,
          documents: documentCompliance,
        });
      });

      // Sort by document type
      complianceByType.sort((a, b) =>
        a.documentType.localeCompare(b.documentType)
      );

      return complianceByType;
    } catch (error) {
      console.error("❌ Get compliance by type error:", error);

      if (error instanceof AuthorizationError) {
        throw error;
      }

      throw new InternalServerError(
        "Failed to retrieve compliance by document type"
      );
    }
  }

  /**
   * Get employees with critical compliance issues (RED status)
   * Useful for urgent action items
   *
   * @param organizationId - Organization ID
   * @param requestingUserRole - Role of requesting user
   * @param requestingUserId - ID of requesting user (for employee-specific issues)
   * @returns List of employees with expired documents (org-wide for HR/ADMIN, personal for employees)
   */
  async getCriticalComplianceIssues(
    organizationId: string,
    requestingUserRole: Role,
    requestingUserId?: string
  ): Promise<
    Array<{
      employeeId: string;
      name: string;
      expiredDocuments: Array<{
        id: string;
        title: string;
        type: string;
        expiresAt: Date;
        daysExpired: number;
      }>;
    }>
  > {
    try {
      const now = new Date();

      // Check if requesting user is HR/ADMIN (organization-wide issues) or employee (personal issues)
      if (["HR", "ADMIN", "SUPERADMIN"].includes(requestingUserRole)) {
        // Organization-wide critical issues for HR/ADMIN users
        const employeesWithExpiredDocs = await prisma.employee.findMany({
          where: {
            organizationId,
            deletedAt: null,
            documents: {
              some: {
                deletedAt: null,
                expiresAt: {
                  lt: now, // Document has expired
                },
              },
            },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documents: {
              where: {
                deletedAt: null,
                expiresAt: {
                  lt: now, // Only expired documents
                },
              },
              select: {
                id: true,
                title: true,
                type: true,
                expiresAt: true,
              },
            },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        });

        // Format the results with days expired calculation
        return employeesWithExpiredDocs.map((employee) => ({
          employeeId: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          expiredDocuments: employee.documents.map((doc) => ({
            id: doc.id,
            title: doc.title,
            type: doc.type,
            expiresAt: doc.expiresAt!,
            daysExpired: Math.ceil(
              (now.getTime() - doc.expiresAt!.getTime()) / (1000 * 60 * 60 * 24)
            ),
          })),
        }));

      } else {
        // Employee-specific critical issues for regular users
        if (!requestingUserId) {
          throw new AuthorizationError("User ID required for employee critical issues");
        }

        // Find the employee record for this user
        const employee = await prisma.employee.findUnique({
          where: {
            userId: requestingUserId,
            organizationId,
            deletedAt: null,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documents: {
              where: {
                deletedAt: null,
                expiresAt: {
                  lt: now, // Only expired documents
                },
              },
              select: {
                id: true,
                title: true,
                type: true,
                expiresAt: true,
              },
            },
          },
        });

        if (!employee) {
          throw new AuthorizationError("Employee record not found");
        }

        // Return employee's critical issues only if they have expired documents
        if (employee.documents.length === 0) {
          return []; // No critical issues for this employee
        }

        return [{
          employeeId: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          expiredDocuments: employee.documents.map((doc) => ({
            id: doc.id,
            title: doc.title,
            type: doc.type,
            expiresAt: doc.expiresAt!,
            daysExpired: Math.ceil(
              (now.getTime() - doc.expiresAt!.getTime()) / (1000 * 60 * 60 * 24)
            ),
          })),
        }];
      }
    } catch (error) {
      console.error("❌ Get critical compliance issues error:", error);

      if (error instanceof AuthorizationError) {
        throw error;
      }

      throw new InternalServerError(
        "Failed to retrieve critical compliance issues"
      );
    }
  }

  /**
   * Get compliance statistics for dashboard metrics
   *
   * @param organizationId - Organization ID
   * @param requestingUserRole - Role of requesting user
   * @param requestingUserId - ID of requesting user (for employee-specific metrics)
   * @returns High-level compliance metrics (org-wide for HR/ADMIN, individual for employees)
   */
  async getComplianceMetrics(
    organizationId: string,
    requestingUserRole: Role,
    requestingUserId?: string
  ): Promise<{
    totalEmployees: number;
    totalDocuments: number;
    complianceSummary: {
      green: number;
      yellow: number;
      red: number;
    };
    documentsExpiringSoon: number; // Next 30 days
    expiredDocuments: number;
    complianceRate: number; // Percentage of GREEN employees
  }> {
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);

      // Check if requesting user is HR/ADMIN (organization-wide metrics) or employee (personal metrics)
      if (["HR", "ADMIN", "SUPERADMIN"].includes(requestingUserRole)) {
        // Organization-wide metrics for HR/ADMIN users
        const orgCompliance = await this.getOrganizationCompliance(
          organizationId,
          requestingUserRole
        );

        // Count all organization documents
        const [documentCounts, expiringSoonCount, expiredCount] =
          await Promise.all([
            prisma.document.aggregate({
              where: {
                organizationId,
                deletedAt: null,
                OR: [{ employeeId: { not: null } }, { employeeId: null }],
              },
              _count: {
                id: true,
              },
            }),
            prisma.document.count({
              where: {
                organizationId,
                deletedAt: null,
                OR: [{ employeeId: { not: null } }, { employeeId: null }],
                expiresAt: {
                  gte: now,
                  lte: thirtyDaysFromNow,
                },
              },
            }),
            prisma.document.count({
              where: {
                organizationId,
                deletedAt: null,
                OR: [{ employeeId: { not: null } }, { employeeId: null }],
                expiresAt: {
                  lt: now,
                },
              },
            }),
          ]);

        const complianceRate =
          orgCompliance.summary.total > 0
            ? Math.round(
                (orgCompliance.summary.green / orgCompliance.summary.total) *
                  100
              )
            : 100;

        return {
          totalEmployees: orgCompliance.summary.total,
          totalDocuments: documentCounts._count.id || 0,
          complianceSummary: {
            green: orgCompliance.summary.green,
            yellow: orgCompliance.summary.yellow,
            red: orgCompliance.summary.red,
          },
          documentsExpiringSoon: expiringSoonCount,
          expiredDocuments: expiredCount,
          complianceRate,
        };
      } else {
        // Employee-specific metrics for regular users
        if (!requestingUserId) {
          throw new AuthorizationError("User ID required for employee metrics");
        }

        // Find the employee record for this user
        const [employee, employeeCount] = await Promise.all([
          prisma.employee.findUnique({
            where: {
              userId: requestingUserId,
              organizationId,
              deletedAt: null,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              documents: {
                where: {
                  deletedAt: null,
                },
                select: {
                  id: true,
                  expiresAt: true,
                },
              },
            },
          }),
          prisma.employee.count({
            where: {
              organizationId,
              deletedAt: null,
            },
          }),
        ]);

        if (!employee) {
          throw new AuthorizationError("Employee record not found");
        }

        // Calculate employee's personal compliance status
        const employeeStatus = getEmployeeComplianceStatus(employee.documents);

        // Count employee's documents by category
        const totalDocuments = employee.documents.length;

        const expiringSoonCount = employee.documents.filter(
          (doc) =>
            doc.expiresAt &&
            doc.expiresAt >= now &&
            doc.expiresAt <= thirtyDaysFromNow
        ).length;

        const expiredCount = employee.documents.filter(
          (doc) => doc.expiresAt && doc.expiresAt < now
        ).length;

        // For individual employee, compliance rate is binary (100% if GREEN, 0% if not)
        const complianceRate = employeeStatus === "GREEN" ? 100 : 0;

        // Summary reflects individual status
        const complianceSummary = {
          green: employeeStatus === "GREEN" ? 1 : 0,
          yellow: employeeStatus === "YELLOW" ? 1 : 0,
          red: employeeStatus === "RED" ? 1 : 0,
        };

        return {
          totalEmployees: employeeCount, // Just this employee
          totalDocuments,
          complianceSummary,
          documentsExpiringSoon: expiringSoonCount,
          expiredDocuments: expiredCount,
          complianceRate,
        };
      }
    } catch (error) {
      console.error("❌ Get compliance metrics error:", error);

      if (error instanceof AuthorizationError) {
        throw error;
      }

      throw new InternalServerError("Failed to retrieve compliance metrics");
    }
  }
}

// Export singleton instance
export const complianceService = new ComplianceService();
