/**
 * GlassTabBar tests: four glyph tabs + center Record, selected states,
 * tabPress emit/navigate contract, and the label-free Record action
 * navigating to the root-stack Record flow.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { GlassTabBar } from '../GlassTabBar';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

const routes = ['Home', 'Sessions', 'Insights', 'Profile'].map((name) => ({
  key: `${name}-key`,
  name,
}));

function makeProps(index = 0) {
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigate = jest.fn();
  const props = {
    state: { index, routes },
    descriptors: Object.fromEntries(
      routes.map((r) => [r.key, { options: {} }]),
    ),
    navigation: { emit, navigate },
  } as unknown as BottomTabBarProps;
  return { props, emit, navigate };
}

describe('GlassTabBar', () => {
  it('renders four labeled tabs plus the label-free Record action', () => {
    const { props } = makeProps();
    render(<GlassTabBar {...props} />);
    for (const r of routes) {
      expect(screen.getByTestId(`tab-${r.name}`)).toBeTruthy();
      expect(screen.getByText(r.name)).toBeTruthy();
    }
    expect(screen.getByTestId('tab-record')).toBeTruthy();
    // Record is deliberately label-free — the raised circle IS the label.
    expect(screen.queryByText('Record')).toBeNull();
  });

  it('marks only the focused tab as selected', () => {
    const { props } = makeProps(2);
    render(<GlassTabBar {...props} />);
    expect(
      screen.getByTestId('tab-Insights').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('tab-Home').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('emits tabPress and navigates on unfocused tab taps only', () => {
    const { props, emit, navigate } = makeProps(0);
    render(<GlassTabBar {...props} />);

    fireEvent.press(screen.getByTestId('tab-Sessions'));
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'Sessions-key' }),
    );
    expect(navigate).toHaveBeenCalledWith('Sessions');

    navigate.mockClear();
    fireEvent.press(screen.getByTestId('tab-Home'));
    // Already focused — no re-navigate.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('routes the center action to the Record flow', () => {
    const { props, navigate } = makeProps();
    render(<GlassTabBar {...props} />);
    fireEvent.press(screen.getByTestId('tab-record'));
    expect(navigate).toHaveBeenCalledWith('Record');
  });
});
