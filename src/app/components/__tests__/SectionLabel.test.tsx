import { render, screen } from '@testing-library/react-native';

import { SectionLabel } from '../SectionLabel';

describe('SectionLabel', () => {
  it('renders the text', () => {
    render(<SectionLabel>Recent swings</SectionLabel>);
    expect(screen.getByText('Recent swings')).toBeTruthy();
  });
});
