import { useCallback, useState } from 'react';
import {
  ADMIN_REPORTING_DAYS_FILTER_OPTIONS,
  type AdminReportingDaysFilterValue,
} from '../../../../shared/constants/adminReporting.js';

export interface AdminReportingDaysFilterControls {
  readonly daysFilter: AdminReportingDaysFilterValue;
  readonly daysFilterOptions: typeof ADMIN_REPORTING_DAYS_FILTER_OPTIONS;
  readonly handleDaysFilterChange: (value: string | null) => void;
}

export function useAdminReportingDaysFilter(): AdminReportingDaysFilterControls {
  const [daysFilter, setDaysFilter] = useState<AdminReportingDaysFilterValue>('all');

  const handleDaysFilterChange = useCallback((value: string | null): void => {
    if (value == null) {
      return;
    }
    if (ADMIN_REPORTING_DAYS_FILTER_OPTIONS.some((option) => option.value === value)) {
      setDaysFilter(value as AdminReportingDaysFilterValue);
    }
  }, []);

  return {
    daysFilter,
    daysFilterOptions: ADMIN_REPORTING_DAYS_FILTER_OPTIONS,
    handleDaysFilterChange,
  };
}
