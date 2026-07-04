import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { ScreenHeader } from '../ScreenHeader';

describe('ScreenHeader', () => {
  it('renders title and subtitle', () => {
    render(<ScreenHeader title="Results" subtitle="Estimated from video" />);
    expect(screen.getByText('Results')).toBeTruthy();
    expect(screen.getByText('Estimated from video')).toBeTruthy();
  });

  it('gives the title the header role', () => {
    render(<ScreenHeader title="Results" />);
    expect(screen.getByRole('header', { name: 'Results' })).toBeTruthy();
  });

  it('renders a trailing node', () => {
    render(<ScreenHeader title="Results" trailing={<Text>Edit</Text>} />);
    expect(screen.getByText('Edit')).toBeTruthy();
  });
});
