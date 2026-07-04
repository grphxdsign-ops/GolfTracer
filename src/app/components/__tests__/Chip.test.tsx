import { fireEvent, render, screen } from '@testing-library/react-native';

import { Chip } from '../Chip';

describe('Chip', () => {
  it('renders label and value when static', () => {
    render(<Chip label="Apex" value="31 m" />);
    expect(screen.getByText('Apex')).toBeTruthy();
    expect(screen.getByText('31 m')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fires onPress and is queryable by visible label', () => {
    const onPress = jest.fn();
    render(<Chip label="Driver" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Driver' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reflects selection in accessibilityState', () => {
    const { rerender } = render(
      <Chip label="PW" onPress={jest.fn()} selected={false} />,
    );
    expect(
      screen.getByRole('button', { name: 'PW' }).props.accessibilityState
        .selected,
    ).toBe(false);

    rerender(<Chip label="PW" onPress={jest.fn()} selected />);
    expect(
      screen.getByRole('button', { name: 'PW' }).props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('blocks onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Chip label="Driver" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button', { name: 'Driver' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
