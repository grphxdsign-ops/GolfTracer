import { navigateTab, resetToTab } from '../navTabs';

describe('navTabs', () => {
  it('navigates into the nested Tabs navigator', () => {
    const navigate = jest.fn();
    navigateTab({ navigate }, 'Insights');
    expect(navigate).toHaveBeenCalledWith('Tabs', { screen: 'Insights' });
  });

  it('replaces the stack with the tab shell on reset', () => {
    const reset = jest.fn();
    resetToTab({ reset }, 'Home');
    expect(reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Tabs', params: { screen: 'Home' } }],
    });
  });
});
