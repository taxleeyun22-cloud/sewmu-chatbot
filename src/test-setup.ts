/**
 * Vitest setup — @testing-library/jest-dom matchers 자동 등록.
 * 사용 (test file):
 *   expect(element).toBeInTheDocument();
 *   expect(element).toHaveStyle({ color: 'red' });
 */

import '@testing-library/jest-dom/vitest';
