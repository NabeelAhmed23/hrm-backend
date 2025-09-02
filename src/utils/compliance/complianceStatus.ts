/**
 * Compliance Status Utility Functions
 * 
 * Provides utility functions to determine compliance status based on document expiry dates.
 * Implements traffic-light system: Green (valid), Yellow (expiring soon), Red (expired).
 * 
 * Business Rules:
 * - Red: Document has expired (expiresAt < now)
 * - Yellow: Document expires within next 30 days
 * - Green: Document is valid (expires > 30 days or no expiry)
 */

export type ComplianceStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface DocumentComplianceInfo {
  documentId: string;
  title: string;
  status: ComplianceStatus;
  expiresAt?: Date;
  daysUntilExpiry?: number;
}

export interface EmployeeComplianceInfo {
  employeeId: string;
  name: string;
  status: ComplianceStatus;
  documents: DocumentComplianceInfo[];
}

export interface OrganizationComplianceInfo {
  organizationId: string;
  summary: {
    green: number;
    yellow: number;
    red: number;
    total: number;
  };
  employees: Array<{
    employeeId: string;
    name: string;
    status: ComplianceStatus;
  }>;
}

export interface ComplianceByType {
  documentType: string;
  summary: {
    green: number;
    yellow: number;
    red: number;
    total: number;
  };
  documents: DocumentComplianceInfo[];
}

/**
 * Determines compliance status for a single document based on expiry date
 * 
 * @param expiresAt - Document expiry date (optional)
 * @param warningDays - Days before expiry to show yellow status (default: 30)
 * @returns Compliance status (GREEN, YELLOW, or RED)
 */
export function getComplianceStatus(
  expiresAt?: Date | null,
  warningDays: number = 30
): ComplianceStatus {
  // Documents without expiry are always GREEN
  if (!expiresAt) {
    return 'GREEN';
  }

  const now = new Date();
  const expiryDate = new Date(expiresAt);

  // Check if document has already expired
  if (expiryDate < now) {
    return 'RED';
  }

  // Check if document expires within warning period
  const millisecondsUntilExpiry = expiryDate.getTime() - now.getTime();
  const daysUntilExpiry = Math.ceil(millisecondsUntilExpiry / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry <= warningDays) {
    return 'YELLOW';
  }

  return 'GREEN';
}

/**
 * Calculate days until document expires
 * 
 * @param expiresAt - Document expiry date
 * @returns Number of days until expiry (negative if expired, null if no expiry)
 */
export function getDaysUntilExpiry(expiresAt?: Date | null): number | null {
  if (!expiresAt) {
    return null;
  }

  const now = new Date();
  const expiryDate = new Date(expiresAt);
  const millisecondsUntilExpiry = expiryDate.getTime() - now.getTime();
  
  return Math.ceil(millisecondsUntilExpiry / (1000 * 60 * 60 * 24));
}

/**
 * Determines overall compliance status for an employee based on their documents
 * Priority: RED > YELLOW > GREEN
 * 
 * @param documents - Array of employee's documents with expiry info
 * @returns Overall compliance status for the employee
 */
export function getEmployeeComplianceStatus(
  documents: Array<{ expiresAt?: Date | null }>
): ComplianceStatus {
  if (documents.length === 0) {
    return 'GREEN'; // No documents = compliant
  }

  let hasYellow = false;

  for (const doc of documents) {
    const status = getComplianceStatus(doc.expiresAt);
    
    // If any document is RED, employee is RED
    if (status === 'RED') {
      return 'RED';
    }
    
    // Track if any document is YELLOW
    if (status === 'YELLOW') {
      hasYellow = true;
    }
  }

  // If any document is YELLOW (and none are RED), employee is YELLOW
  if (hasYellow) {
    return 'YELLOW';
  }

  // All documents are GREEN
  return 'GREEN';
}

/**
 * Creates formatted document compliance information
 * 
 * @param document - Document with id, title, and expiresAt
 * @returns Formatted document compliance info
 */
export function formatDocumentCompliance(document: {
  id: string;
  title: string;
  expiresAt?: Date | null;
}): DocumentComplianceInfo {
  const status = getComplianceStatus(document.expiresAt);
  const daysUntilExpiry = getDaysUntilExpiry(document.expiresAt);

  return {
    documentId: document.id,
    title: document.title,
    status,
    expiresAt: document.expiresAt || undefined,
    daysUntilExpiry: daysUntilExpiry || undefined,
  };
}

/**
 * Calculates summary statistics for compliance status distribution
 * 
 * @param employees - Array of employees with their compliance status
 * @returns Summary with counts for each status
 */
export function calculateComplianceSummary(
  employees: Array<{ status: ComplianceStatus }>
): { green: number; yellow: number; red: number; total: number } {
  const summary = {
    green: 0,
    yellow: 0,
    red: 0,
    total: employees.length,
  };

  employees.forEach(employee => {
    switch (employee.status) {
      case 'GREEN':
        summary.green++;
        break;
      case 'YELLOW':
        summary.yellow++;
        break;
      case 'RED':
        summary.red++;
        break;
    }
  });

  return summary;
}

/**
 * Validates that a date is a valid expiry date (not in the distant past)
 * 
 * @param expiresAt - Date to validate
 * @returns True if date is valid for expiry tracking
 */
export function isValidExpiryDate(expiresAt?: Date | null): boolean {
  if (!expiresAt) {
    return true; // No expiry is valid
  }

  const date = new Date(expiresAt);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Date should not be more than 1 year in the past (likely data error)
  return date > oneYearAgo;
}

/**
 * Gets a human-readable description of compliance status
 * 
 * @param status - Compliance status
 * @param daysUntilExpiry - Days until expiry (optional)
 * @returns Human-readable status description
 */
export function getComplianceStatusDescription(
  status: ComplianceStatus,
  daysUntilExpiry?: number
): string {
  switch (status) {
    case 'RED':
      const daysExpired = daysUntilExpiry ? Math.abs(daysUntilExpiry) : null;
      return daysExpired 
        ? `Expired ${daysExpired} day${daysExpired === 1 ? '' : 's'} ago`
        : 'Expired';
    
    case 'YELLOW':
      return daysUntilExpiry
        ? `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`
        : 'Expiring soon';
    
    case 'GREEN':
    default:
      return 'Valid';
  }
}