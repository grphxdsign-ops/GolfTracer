import { render, screen } from '@testing-library/react-native';

import { Skeleton } from '../Skeleton';
import * as reducedMotion from '../useReducedMotion';

describe('Skeleton', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders with the given dimensions', () => {
    render(<Skeleton width={120} height={16} testID="skeleton" />);
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders the static reduced-motion path', () => {
    jest.spyOn(reducedMotion, 'useReducedMotion').mockReturnValue(true);
    render(<Skeleton height={16} testID="skeleton" />);
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toBeTruthy();
  });

  it('does not throw on unmount', () => {
    const { unmount } = render(<Skeleton height={16} testID="skeleton" />);
    expect(() => unmount()).not.toThrow();
  });
});
