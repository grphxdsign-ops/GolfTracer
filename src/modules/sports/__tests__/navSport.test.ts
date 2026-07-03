/**
 * navigateSport tests: the cast helper forwards sport routes to any
 * react-navigation-shaped navigator.
 */
import { navigateSport, type SportRoute } from '../navSport';

describe('navigateSport', () => {
  it('forwards each sport route to navigation.navigate', () => {
    const navigate = jest.fn();
    const routes: SportRoute[] = [
      'SoccerAnalyze',
      'SoccerResults',
      'PerfectedAction',
      'PerfectedResults',
    ];
    for (const route of routes) {
      navigateSport({ navigate }, route);
    }
    expect(navigate.mock.calls.map((c) => c[0])).toEqual(routes);
  });
});
