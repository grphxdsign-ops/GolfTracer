import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and body', () => {
    render(
      <EmptyState
        title="No swings yet"
        body="Import a video to trace your first shot."
      />,
    );
    expect(screen.getByText('No swings yet')).toBeTruthy();
    expect(
      screen.getByText('Import a video to trace your first shot.'),
    ).toBeTruthy();
  });

  it('fires onAction from the action button', () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        title="No swings yet"
        actionLabel="Import video"
        onAction={onAction}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Import video' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders without an action', () => {
    render(<EmptyState title="No swings yet" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
