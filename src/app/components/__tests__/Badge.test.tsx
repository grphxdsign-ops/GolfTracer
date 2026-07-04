import { render, screen } from '@testing-library/react-native';

import { Badge } from '../Badge';

describe('Badge', () => {
  it.each(['neutral', 'success', 'warning', 'danger', 'accent'] as const)(
    'renders the label for the %s tone',
    (tone) => {
      render(<Badge label="Tracked" tone={tone} />);
      expect(screen.getByText('Tracked')).toBeTruthy();
    },
  );

  it('passes through the accessibilityLabel', () => {
    render(
      <Badge
        label="Physics"
        tone="accent"
        accessibilityLabel="Estimation method: Physics"
      />,
    );
    expect(screen.getByLabelText('Estimation method: Physics')).toBeTruthy();
  });
});
