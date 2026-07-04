import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedControl } from '../SegmentedControl';

const options = [
  { label: '240 fps slo-mo', value: 'slomo' },
  { label: 'Normal video', value: 'normal' },
] as const;

describe('SegmentedControl', () => {
  it('renders every option as a button', () => {
    render(
      <SegmentedControl options={options} value="slomo" onChange={jest.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: '240 fps slo-mo' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Normal video' })).toBeTruthy();
  });

  it('calls onChange with the pressed value', () => {
    const onChange = jest.fn();
    render(
      <SegmentedControl options={options} value="slomo" onChange={onChange} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Normal video' }));
    expect(onChange).toHaveBeenCalledWith('normal');
  });

  it('marks the selected segment via accessibilityState', () => {
    render(
      <SegmentedControl options={options} value="normal" onChange={jest.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Normal video' }).props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: '240 fps slo-mo' }).props
        .accessibilityState.selected,
    ).toBe(false);
  });
});
