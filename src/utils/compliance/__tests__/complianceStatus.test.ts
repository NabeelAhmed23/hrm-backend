/**
 * Unit Tests for Compliance Status Utilities
 * 
 * Tests the core compliance status calculation logic including:
 * - Individual document compliance status
 * - Employee overall compliance status
 * - Date calculations and edge cases
 * - Status priority and aggregation
 */

import {
  getComplianceStatus,
  getDaysUntilExpiry,
  getEmployeeComplianceStatus,
  formatDocumentCompliance,
  calculateComplianceSummary,
  isValidExpiryDate,
  getComplianceStatusDescription,
  ComplianceStatus,
} from '../complianceStatus';

describe('getComplianceStatus', () => {
  const now = new Date('2024-09-01T10:00:00Z');
  
  // Mock Date.now() to return consistent results
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  test('should return GREEN for documents without expiry date', () => {
    expect(getComplianceStatus(null)).toBe('GREEN');
    expect(getComplianceStatus(undefined)).toBe('GREEN');
  });

  test('should return RED for expired documents', () => {
    const expiredDate = new Date('2024-08-01T10:00:00Z'); // 31 days ago
    expect(getComplianceStatus(expiredDate)).toBe('RED');
    
    const yesterdayDate = new Date('2024-08-31T10:00:00Z'); // 1 day ago
    expect(getComplianceStatus(yesterdayDate)).toBe('RED');
  });

  test('should return YELLOW for documents expiring within 30 days', () => {
    const in30Days = new Date('2024-10-01T10:00:00Z'); // exactly 30 days
    expect(getComplianceStatus(in30Days)).toBe('YELLOW');
    
    const in15Days = new Date('2024-09-16T10:00:00Z'); // 15 days
    expect(getComplianceStatus(in15Days)).toBe('YELLOW');
    
    const in1Day = new Date('2024-09-02T10:00:00Z'); // 1 day
    expect(getComplianceStatus(in1Day)).toBe('YELLOW');
  });

  test('should return GREEN for documents expiring after 30 days', () => {
    const in31Days = new Date('2024-10-02T10:00:00Z'); // 31 days
    expect(getComplianceStatus(in31Days)).toBe('GREEN');
    
    const in365Days = new Date('2025-09-01T10:00:00Z'); // 1 year
    expect(getComplianceStatus(in365Days)).toBe('GREEN');
  });

  test('should respect custom warning days parameter', () => {
    const in20Days = new Date('2024-09-21T10:00:00Z'); // 20 days
    
    expect(getComplianceStatus(in20Days, 30)).toBe('YELLOW'); // default 30 days
    expect(getComplianceStatus(in20Days, 15)).toBe('GREEN');  // custom 15 days
    expect(getComplianceStatus(in20Days, 25)).toBe('YELLOW'); // custom 25 days
  });
});

describe('getDaysUntilExpiry', () => {
  const now = new Date('2024-09-01T10:00:00Z');
  
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  test('should return null for documents without expiry', () => {
    expect(getDaysUntilExpiry(null)).toBeNull();
    expect(getDaysUntilExpiry(undefined)).toBeNull();
  });

  test('should calculate positive days for future dates', () => {
    const futureDate = new Date('2024-09-11T10:00:00Z'); // 10 days from now
    expect(getDaysUntilExpiry(futureDate)).toBe(10);
  });

  test('should calculate negative days for past dates', () => {
    const pastDate = new Date('2024-08-27T10:00:00Z'); // 5 days ago
    expect(getDaysUntilExpiry(pastDate)).toBe(-5);
  });

  test('should handle same day correctly', () => {
    const sameDay = new Date('2024-09-01T15:00:00Z'); // same day, different time
    expect(getDaysUntilExpiry(sameDay)).toBe(1);
  });
});

describe('getEmployeeComplianceStatus', () => {
  test('should return GREEN for employee with no documents', () => {
    expect(getEmployeeComplianceStatus([])).toBe('GREEN');
  });

  test('should return RED if any document is expired', () => {
    const documents = [
      { expiresAt: new Date('2025-01-01') }, // future - GREEN
      { expiresAt: new Date('2024-01-01') }, // expired - RED
      { expiresAt: null },                   // no expiry - GREEN
    ];
    
    expect(getEmployeeComplianceStatus(documents)).toBe('RED');
  });

  test('should return YELLOW if any document is expiring soon and none expired', () => {
    // Mock the current date inside the test
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-09-01T10:00:00Z'));
    
    const documents = [
      { expiresAt: new Date('2025-01-01T10:00:00Z') }, // future - GREEN
      { expiresAt: new Date('2024-09-15T10:00:00Z') }, // expiring soon - YELLOW
      { expiresAt: null },                             // no expiry - GREEN
    ];
    
    expect(getEmployeeComplianceStatus(documents)).toBe('YELLOW');
    
    jest.useRealTimers();
  });

  test('should return GREEN if all documents are valid', () => {
    // Mock the current date inside the test
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-09-01T10:00:00Z'));
    
    const documents = [
      { expiresAt: new Date('2025-01-01T10:00:00Z') }, // future - GREEN
      { expiresAt: new Date('2025-06-01T10:00:00Z') }, // future - GREEN
      { expiresAt: null },                             // no expiry - GREEN
    ];
    
    expect(getEmployeeComplianceStatus(documents)).toBe('GREEN');
    
    jest.useRealTimers();
  });

  test('should prioritize RED over YELLOW over GREEN', () => {
    const documentsRedYellowGreen = [
      { expiresAt: new Date('2024-01-01') }, // expired - RED
      { expiresAt: new Date('2024-09-15') }, // expiring soon - YELLOW
      { expiresAt: new Date('2025-01-01') }, // future - GREEN
    ];
    
    expect(getEmployeeComplianceStatus(documentsRedYellowGreen)).toBe('RED');
  });
});

describe('formatDocumentCompliance', () => {
  const now = new Date('2024-09-01T10:00:00Z');
  
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });

  test('should format document with expiry date correctly', () => {
    const document = {
      id: 'doc-123',
      title: 'Safety Certificate',
      expiresAt: new Date('2024-09-15T10:00:00Z'),
    };

    const formatted = formatDocumentCompliance(document);

    expect(formatted).toEqual({
      documentId: 'doc-123',
      title: 'Safety Certificate',
      status: 'YELLOW',
      expiresAt: document.expiresAt,
      daysUntilExpiry: 14,
    });
  });

  test('should format document without expiry date correctly', () => {
    const document = {
      id: 'doc-456',
      title: 'Employment Contract',
      expiresAt: null,
    };

    const formatted = formatDocumentCompliance(document);

    expect(formatted).toEqual({
      documentId: 'doc-456',
      title: 'Employment Contract',
      status: 'GREEN',
      expiresAt: undefined,
      daysUntilExpiry: undefined,
    });
  });
});

describe('calculateComplianceSummary', () => {
  test('should calculate summary correctly', () => {
    const employees = [
      { status: 'GREEN' as ComplianceStatus },
      { status: 'GREEN' as ComplianceStatus },
      { status: 'YELLOW' as ComplianceStatus },
      { status: 'RED' as ComplianceStatus },
      { status: 'RED' as ComplianceStatus },
      { status: 'RED' as ComplianceStatus },
    ];

    const summary = calculateComplianceSummary(employees);

    expect(summary).toEqual({
      green: 2,
      yellow: 1,
      red: 3,
      total: 6,
    });
  });

  test('should handle empty employee list', () => {
    const summary = calculateComplianceSummary([]);

    expect(summary).toEqual({
      green: 0,
      yellow: 0,
      red: 0,
      total: 0,
    });
  });

  test('should handle single status type', () => {
    const employees = [
      { status: 'GREEN' as ComplianceStatus },
      { status: 'GREEN' as ComplianceStatus },
      { status: 'GREEN' as ComplianceStatus },
    ];

    const summary = calculateComplianceSummary(employees);

    expect(summary).toEqual({
      green: 3,
      yellow: 0,
      red: 0,
      total: 3,
    });
  });
});

describe('isValidExpiryDate', () => {
  test('should return true for null/undefined dates', () => {
    expect(isValidExpiryDate(null)).toBe(true);
    expect(isValidExpiryDate(undefined)).toBe(true);
  });

  test('should return true for valid future dates', () => {
    const futureDate = new Date('2025-01-01');
    expect(isValidExpiryDate(futureDate)).toBe(true);
  });

  test('should return true for recent past dates', () => {
    const recentPast = new Date();
    recentPast.setDate(recentPast.getDate() - 30); // 30 days ago
    expect(isValidExpiryDate(recentPast)).toBe(true);
  });

  test('should return false for very old dates', () => {
    const veryOld = new Date();
    veryOld.setFullYear(veryOld.getFullYear() - 2); // 2 years ago
    expect(isValidExpiryDate(veryOld)).toBe(false);
  });
});

describe('getComplianceStatusDescription', () => {
  test('should provide correct descriptions for each status', () => {
    expect(getComplianceStatusDescription('GREEN')).toBe('Valid');
    expect(getComplianceStatusDescription('YELLOW')).toBe('Expiring soon');
    expect(getComplianceStatusDescription('RED')).toBe('Expired');
  });

  test('should include days information when provided', () => {
    expect(getComplianceStatusDescription('GREEN', 45)).toBe('Valid');
    expect(getComplianceStatusDescription('YELLOW', 15)).toBe('Expires in 15 days');
    expect(getComplianceStatusDescription('YELLOW', 1)).toBe('Expires in 1 day');
    expect(getComplianceStatusDescription('RED', -5)).toBe('Expired 5 days ago');
    expect(getComplianceStatusDescription('RED', -1)).toBe('Expired 1 day ago');
  });
});

describe('Edge Cases and Integration', () => {
  test('should handle timezone differences correctly', () => {
    // Test with different timezone representations of the same moment
    const utcDate = new Date('2024-09-15T00:00:00Z');
    const localDate = new Date('2024-09-15T00:00:00');
    
    // Both should have consistent behavior relative to the mocked "now"
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-09-01T00:00:00Z'));
    
    const status1 = getComplianceStatus(utcDate);
    const status2 = getComplianceStatus(localDate);
    
    // Both should be YELLOW (within 30 days)
    expect(status1).toBe('YELLOW');
    expect(status2).toBe('YELLOW');
    
    jest.useRealTimers();
  });

  test('should handle leap year dates correctly', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-02-01T00:00:00Z')); // 2024 is a leap year
    
    const leapDayExpiry = new Date('2024-02-29T00:00:00Z');
    expect(getComplianceStatus(leapDayExpiry)).toBe('YELLOW'); // Within 30 days
    
    jest.useRealTimers();
  });

  test('should maintain consistency across multiple calls', () => {
    const testDate = new Date('2024-09-15T10:00:00Z');
    
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-09-01T10:00:00Z'));
    
    // Multiple calls should return the same result
    expect(getComplianceStatus(testDate)).toBe('YELLOW');
    expect(getComplianceStatus(testDate)).toBe('YELLOW');
    expect(getComplianceStatus(testDate)).toBe('YELLOW');
    
    jest.useRealTimers();
  });
});