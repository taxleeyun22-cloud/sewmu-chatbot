import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CdFinance } from './CdFinance';
import {
  closeDashboard,
  setDashboardLoaded,
} from '../../admin/state/dashboard-store';

beforeEach(() => closeDashboard());
afterEach(() => cleanup());

describe('CdFinance', () => {
  it('has_data=false → 안내 메시지', () => {
    const { container } = render(<CdFinance />);
    expect(container.textContent).toContain('재무 데이터 없음');
  });

  it('has_data=true + rows → 표시', () => {
    setDashboardLoaded({
      userId: 1,
      finance: {
        has_data: true,
        rows: [
          { period: '2024-1기', revenue: 12000000, vat_payable: 1200000 },
          { period: '2024-2기', revenue: 15000000, vat_payable: 1500000 },
        ],
      },
    });
    const { container } = render(<CdFinance />);
    expect(container.textContent).toContain('2024-1기');
    expect(container.textContent).toContain('매출 12,000,000');
    expect(container.textContent).toContain('부가세 1,200,000');
    expect(container.textContent).toContain('2024-2기');
  });

  it('revenue 만 있는 row 처리', () => {
    setDashboardLoaded({
      userId: 1,
      finance: { has_data: true, rows: [{ period: '2024', revenue: 5000000 }] },
    });
    const { container } = render(<CdFinance />);
    expect(container.textContent).toContain('매출 5,000,000');
    expect(container.textContent).not.toContain('부가세');
  });

  it('rows 없으면 안내', () => {
    setDashboardLoaded({
      userId: 1,
      finance: { has_data: true, rows: [] },
    });
    const { container } = render(<CdFinance />);
    expect(container.textContent).toContain('재무 데이터 없음');
  });
});
